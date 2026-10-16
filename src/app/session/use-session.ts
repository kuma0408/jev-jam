"use client";

// セッションの音と進行を司るフック。画面（見た目）はこのフックの戻り値だけを使う。
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BASS_GAIN_DB,
  BASS_SAMPLES,
  COMP_GAIN_DB,
  COMP_SAMPLES,
  SOLO_INSTRUMENTS,
  SOLO_VOICES,
  type SoloVoice,
} from "../../lib/audio/instruments.ts";
import { type BandEvent, accompaniment, bassApproach, compVoicing } from "../../lib/band/accompaniment.ts";
import { chordTones, pitchClassOf } from "../../lib/music/chord.ts";
import { type ChordCandidate, nextChordCandidates } from "../../lib/progression/candidates.ts";
import type { Progression } from "../../lib/progression/library.ts";
import {
  START_PROGRESSION,
  isSectionEnd,
  isSectionStart,
  leadInFor,
  progressionById,
  progressionByName,
  sectionBias,
  sectionOptions,
} from "../../lib/progression/sections.ts";
import { aimPitch, fitsChord } from "../../lib/solo/aim.ts";
import type { SoloBar, SoloMemo, SoloNote, SoloRequest, SoloResponse, SoloStrategy } from "../../lib/solo/api.ts";
import { padPitches } from "../../lib/music/pads.ts";
import { type PlayedNote, type Turn, TURN_BARS, prepareBeat, summarizeCall, turnOf } from "../../lib/solo/call.ts";
import { type Energy, type Press, RESTING_ENERGY, type Touch, compTouch, touchEnergy } from "../../lib/solo/energy.ts";
import { pitchAtStep, voicingUnder } from "../../lib/music/staff.ts";
import { type NoteExpression, planExpression } from "../../lib/solo/expression.ts";
import { renderCells } from "../../lib/solo/render-cells.ts";
import { swingBeats, swingRatioFor } from "../../lib/solo/swing.ts";
import { type ExpressiveVoice, type HeldNote, createExpressiveVoice } from "./expressive-voice.ts";

/** 最初の小節のコード。基本の進行（丸サ進行）の頭から始めて、序盤から合わせやすくする */
const START_CHORD = START_PROGRESSION.chords[0]!;
const BEATS_PER_BAR = 4;
/** 1小節に2つのコードを置くとき、後半のコードに切り替える拍（0始まり。3拍目） */
const SPLIT_BEAT = 2;
/**
 * コード選択の締切（小節の頭からの拍数）。4拍目の頭。
 * ここで次のコードを確定し、最後の1拍のソロとベースを次のコードへ向かわせる
 */
const DEADLINE_BEATS = 3;
/** 小節の終わりまでこれ以内に迫る音は、小節の終わりまで伸びる音として扱う（拍） */
const BAR_END_MARGIN_BEATS = 0.05;
/** これ以下の音程なら、小節をまたぐ2音をなめらかにつなぐ（半音数） */
const SLUR_INTERVAL = 4;
const SOLO_START_PITCH = 65;
const LOG_LIMIT = 24;
export const BPM_MIN = 60;
export const BPM_MAX = 240;
export const SOLO_DB_MIN = -24;
export const SOLO_DB_MAX = 6;

export type SessionStatus = "idle" | "starting" | "playing";

export type SessionSettings = {
  bpm: number;
  strategy: SoloStrategy;
  voice: SoloVoice;
  /** ソロの音量（dB） */
  soloDb: number;
  /** 管楽器の音に重ねる息の音の量（0〜1） */
  breath: number;
  /** 掛け合い。true なら、Jevとユーザーが2小節ずつ交代で弾く。false なら、Jevがずっとソロを取る */
  trade: boolean;
};

/** 自分で弾く音の高さ。自動の伴奏より1オクターブ上で、埋もれない音域 */
const JAM_TONE_BASE = 72;
/** 押さえたままコードが変わったときに、押さえ直す和音の強さ */
const REVOICE_VELOCITY = 0.6;
/** 押さえずに鳴らした音（コードの札や鍵盤）を、伸ばした長さとして数える秒数 */
const SHORT_PRESS_SECONDS = 0.2;
/** 合う音だけの鍵盤の、いちばん左の音のおおよその高さ（MIDIノート番号） */
export const PAD_LOW = 64;
/** 押さえている音の覚え書きで、合う音だけの鍵盤の分を12音の鍵盤と区別するための番号のずらし */
const PAD_HELD_OFFSET = 100;
/** 自分で弾く音を、自動の伴奏よりどれだけ大きくするか（dB）。8では大きすぎた */
const JAM_BOOST_DB = 4;

/** 音が実際に鳴るタイミングで届く通知。背景の演出などに使う */
export type SessionEvent =
  /**
   * 小節の頭と、小節の途中でコードが変わったところ。progression は、いま乗っている定番進行のID（あれば）。
   * section は、この小節から別の定番進行へ移ったときの、移った先の進行の名前
   */
  | { kind: "bar"; bar: number; chord: string; progression?: string; section?: string }
  /** beat は小節内の拍（0〜3） */
  | { kind: "beat"; beat: number }
  /** ソロの1音。velocity は強さ（0〜1） */
  | { kind: "note"; pitch: number; velocity: number; durationSeconds: number }
  /**
   * ユーザーが自分で鳴らした音（MIDIノート番号）。
   * held が true なら、離すまで鳴り続ける音。離したときに lift が届く
   */
  | { kind: "jam"; pitches: number[]; held?: boolean }
  /** 押さえていた音を離した */
  | { kind: "lift" };

export type BarLog = {
  bar: number;
  chord: string;
  /** start: 最初の小節 / auto: 選ばれず既定の候補に進んだ / chosen: ユーザーが選んだ */
  how: "start" | "auto" | "chosen";
  /** 掛け合いでの、その小節の番。掛け合いでなければ無い */
  turn?: Turn;
  /** ソロが小節の頭に間に合わなければ null。ユーザーの番の小節も null */
  solo: Pick<SoloBar, "summary" | "details" | "latencyMs" | "calls"> | null;
};

export type Session = {
  status: SessionStatus;
  start: () => void;
  stop: () => void;
  settings: SessionSettings;
  /** 設定の一部を変える。再生中でも反映される */
  updateSettings: (patch: Partial<SessionSettings>) => void;
  /** いま鳴っているコード。停止中は null */
  chord: string | null;
  /** 次の小節に選べるコード。先頭が、選ばなかったときの既定 */
  candidates: ChordCandidate[];
  /** 次の小節に進む予定のコード */
  nextChord: string | null;
  /** nextChord をユーザーが決めたか（false なら既定の候補へ自動で進む） */
  chosenByUser: boolean;
  /**
   * コードを弾く。押した瞬間にそのコードが鳴り、バンドは次の拍からそのコードへ切り替わる。
   * 次に進めるコード（candidates）のどれかを渡す。いつでも、何度でも弾ける。
   * 弾いた小節の次の小節は、自動では進まず、そのコードを続ける
   */
  choose: (chord: string) => void;
  /** choose で押さえたコードの音を止める。鍵やキーを離したときに呼ぶ */
  releaseChord: () => void;
  /** 次の小節のソロの準備にかかった時間。依頼中は null */
  readyMs: number | null;
  /** 接続先。jev か mock */
  clientName: string | null;
  error: string | null;
  /** 小節ごとの記録（新しい順） */
  log: BarLog[];
  /** 音に合わせた通知を受け取る。戻り値を呼ぶと解除する */
  subscribe: (listener: (event: SessionEvent) => void) => () => void;
  /** いまのコードを、押した瞬間に鳴らす（伴奏を自分で刻む）。刻んでいる間、自動の伴奏は黙る */
  /**
   * いまのコードを、押した瞬間に鳴らす。lift を呼ぶまで鳴り続ける。
   * step は五線の上で押した位置（真ん中のドを0とした線と間の段）。その位置の合う音をいちばん上にした和音が鳴る。
   * 省けば基本の押さえ方で鳴る
   */
  strike: (step?: number) => void;
  /** strike で押さえた和音を止める。指やキーを離したときに呼ぶ */
  lift: () => void;
  /**
   * 鍵盤の音を1つ鳴らす。pitchClass は 0=C … 11=B。いつでも、どの音でも、押した音がそのまま鳴る。
   * noteOff を呼ぶまで鳴り続ける
   */
  noteOn: (pitchClass: number) => void;
  noteOff: (pitchClass: number) => void;
  /**
   * 合う音だけの鍵盤を弾く。slot は左から何番目か（0始まり）。
   * 鳴る音は、押した時点のコードに合う音から決まる。padOff を呼ぶまで鳴り続ける
   */
  padOn: (slot: number) => void;
  padOff: (slot: number) => void;
  /** 掛け合いで、いまどちらの番の何小節目か（bar は1始まり）。掛け合いでないときや停止中は null */
  turn: { who: Turn; bar: number } | null;
  /** 掛け合いで、Jevが直前のあなたのフレーズにどう応えたか。odds はJevが返した確率 */
  reply: NonNullable<SoloBar["reply"]> | null;
  /** つまみの値に、ユーザーの叩き方を足した実際の盛り上がり。ソロと伴奏はこれに応える */
  liveEnergy: Energy;
  /** ユーザーが直近1小節にどれだけ叩いたか */
  touch: Touch;
};

/**
 * 1小節ぶんの演奏の計画。小節の頭で作り、1拍ごとにここから音を予約する。
 * 小節の途中でユーザーがコードを弾いたら、残りの拍のぶんを新しいコードで作り直す。
 */
type BarPlan = {
  bar: number;
  /** 吹き方の指定。伴奏がしっとりしていれば { mood: "sustained" }。小節の途中でコードが変わったときも同じ吹き方にする */
  mood: { mood?: "sustained" };
  /** いま鳴っているコード。小節の途中で変わりうる */
  chord: string;
  band: BandEvent[];
  solo: SoloBar | null;
  notes: SoloNote[];
  expressions: NoteExpression[];
  /** 伴奏の乱数。コードが変わっても同じリズムの型で続けるために、小節の頭で決めておく */
  seeds: number[];
  energy: Energy;
  voice: SoloVoice;
  /** ユーザーが前の小節で伴奏を刻んでいたか。そうなら自動のコード伴奏を黙らせる */
  userComping: boolean;
  /** 最初の音が、前の小節から持ち越した音か */
  tied: boolean;
};

/** 再生中だけ存在する、音源と進行の状態。描画に関係しないのでrefで持つ */
type Engine = {
  tone: typeof import("tone");
  /** ソロの音源。再生中に切り替えられるよう、すべて読み込んでおく */
  solos: Record<SoloVoice, ExpressiveVoice>;
  /** ソロの音源ごとの音量補正 */
  soloGains: import("tone").Gain[];
  /** ソロ全体の音量 */
  soloVolume: import("tone").Volume;
  /**
   * 息の音の音量。ソロの明るさを決めるフィルターを通さない別の経路にする。
   * 通すと、弱い音のときに息の音の高い成分が削られて、ほぼ聞こえなくなる
   */
  breathVolume: import("tone").Volume;
  /** 強く吹いた音ほど明るくするためのフィルター */
  soloFilter: import("tone").Filter;
  reverb: import("tone").Reverb;
  comp: import("tone").Sampler;
  /** ユーザーが自分で弾く音。自動の伴奏に埋もれないよう、別の音源にして大きく鳴らす */
  jam: import("tone").Sampler;
  bass: import("tone").Sampler;
  /**
   * シンバル。鳴らしっぱなしのノイズを、音量の包絡で短く切り出す。
   * NoiseSynth は1打ごとにノイズを止めるので、速いテンポで打が重なると時刻の順序エラーになる
   */
  rideNoise: import("tone").Noise;
  ride: import("tone").AmplitudeEnvelope;
  rideFilter: import("tone").Filter;
  /** 別の進行に入った小節の頭で鳴らす、余韻の長いシンバル。ride と同じく鳴らしっぱなしのノイズから切り出す */
  crashNoise: import("tone").Noise;
  crash: import("tone").AmplitudeEnvelope;
  crashFilter: import("tone").Filter;
  bar: number;
  /** これまでに鳴らしたコード（古い順） */
  history: string[];
  /** 次の小節の候補ごとの、用意できたソロ */
  prepared: Map<string, SoloBar | null>;
  selected: string | null;
  /** 古い応答を捨てるための通し番号 */
  requestToken: number;
  /** ユーザーが押した和音の、押した時刻と離した時刻（秒）。直近1小節ぶんだけ残す */
  presses: Press[];
  /** いま押さえている和音の記録。離したときに離した時刻を入れる */
  holding: Press | null;
  /** ユーザーが最後に伴奏を刻んだ小節。刻んでいる間は自動の伴奏を黙らせる */
  lastCompTapBar: number;
  /** 小節の終わりまで伸びて、まだ鳴っているソロの音。次の小節で持ち越すか切るかを決める */
  held: HeldNote | null;
  /** held の音の高さ */
  heldPitch: number;
  /**
   * この小節でユーザーがコードを弾いたか（同じコードにとどまる、も含む）。
   * 弾いていれば、次の小節の頭では自動で進まず、そのコードを続ける
   */
  heldOver: boolean;
  /** ユーザーが押さえている鍵盤の音（ピッチクラス → 周波数）。離したときに止める */
  heldNotes: Map<number, number>;
  /** 掛け合いで、ユーザーが自分の番に弾いた音。番が終わるときに要約してJevに渡す */
  callNotes: PlayedNote[];
  /** ユーザーの番が始まった時刻（performance.now のミリ秒） */
  turnStartedAt: number;
  /** 盛り上がりが変わって、次の小節のソロを作り直した小節の番号。同じ小節では二度作り直さない */
  repreparedBar: number;
  /** 次の小節のために用意できたソロのどれか1つ。用意していないコードへ進んだとき、同じフレーズをそのコードに乗せ直す */
  preparedAny: SoloBar | null;
  /** いまの小節の演奏の計画。1拍ごとに、ここから音を予約する */
  now: BarPlan | null;
  /** 再生を始めてからの拍の通し番号 */
  beatCount: number;
  /** ユーザーが弾いたコード。次の拍でバンドがこのコードへ切り替わる */
  pendingSwitch: string | null;
  /**
   * 自動で進んだ小節の後半（3拍目から）に置くコード。1小節に2つのコードを半分ずつ置く進行（Just the Two of Us など）で使う。
   * ユーザーがコードを弾いたら取りやめる
   */
  autoSplit: string | null;
  /** いま乗っている定番進行と、乗り始めた小節。自動で進むときは、この進行の続きを優先する */
  progression: { name: string; since: number } | null;
  /** 区切りの最後の小節でJevが選んだ移り先。導くコードを鳴らした次の小節（区切りの頭）から、この進行に入る */
  pendingMove: Progression | null;
  /** ユーザーが押さえているコードの音（周波数）。離したときに止める */
  pressed: number[] | null;
  /** 五線を押さえて鳴らしている和音（周波数）。離したときに止める */
  struck: number[] | null;
  /** 押さえている和音の、押した位置（段）と、どのコードの和音か。コードが変わったら押さえ直すのに使う */
  struckAt: { step: number | undefined; chord: string } | null;
  /** 次の小節を依頼するときに渡す、直前の小節の記録 */
  previous: { pitch: number; memo: SoloMemo };
  /** 次の小節のために最後に出した依頼。設定が変わったときに出し直す */
  lastRequest: {
    chords: string[];
    previousPitch: number;
    memo: SoloMemo;
    sustained: boolean;
    retargetable: boolean;
  } | null;
};

async function requestSolos(request: SoloRequest): Promise<SoloResponse> {
  const response = await fetch("/api/solo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    throw new Error(`ソロを取得できませんでした (${response.status})`);
  }
  return (await response.json()) as SoloResponse;
}

/** 決めておいた乱数を順に返す関数を作る。同じ並びを何度でも再現できる */
function replay(seeds: readonly number[]): () => number {
  let index = 0;
  return () => seeds[index++ % seeds.length]!;
}

/**
 * 用意してあるソロと同じフレーズを、別のコードの上に乗せ直す。
 * フレーズ（リズムと動き）はコードによらないので、Jevを呼び直さずに作れる。
 *
 * @param heldPitch 前の小節から鳴り続けている音の高さ。鳴っていなければ null
 */
function transplant(source: SoloBar | null, chord: string, heldPitch: number | null): SoloBar | null {
  if (!source?.plan) return null;
  const render = {
    ...source.plan.render,
    ...(heldPitch === null ? {} : { previousPitch: heldPitch }),
    // 鳴っている音がこのコードに合うときだけ持ち越す
    allowTie: heldPitch !== null && fitsChord(heldPitch, chord),
  };
  const notes = renderCells(source.plan.cells, chord, render);
  const history = source.memo.history?.map((bar, index, bars) => (index === bars.length - 1 ? { ...bar, chord } : bar));
  return {
    ...source,
    chord,
    notes,
    lastPitch: notes.at(-1)?.pitch ?? render.previousPitch,
    memo: { ...source.memo, ...(history ? { history } : {}) },
    plan: { cells: source.plan.cells, render },
  };
}

/** 小節の終わりまで伸びる音か */
function reachesBarEnd(note: SoloNote): boolean {
  return note.startBeats + note.durationBeats >= BEATS_PER_BAR - BAR_END_MARGIN_BEATS;
}

/** 音の高さを、オクターブ単位で動かして楽器の音域に収める */
function intoRange(pitch: number, range: { low: number; high: number }): number {
  let moved = pitch;
  while (moved < range.low) moved += 12;
  while (moved > range.high) moved -= 12;
  return moved;
}

/** 次に進めるコードの候補。いま乗っている定番進行があれば、その続きを先頭にする */
function candidatesOf(engine: Engine, history: readonly string[] = engine.history): ChordCandidate[] {
  return nextChordCandidates(history, engine.progression ? { prefer: engine.progression.name } : {});
}

/** 区切りの最後の小節で、Jevが「別の進行へ移る」を選んでいたら、その進行を返す */
function sectionMove(engine: Engine): Progression | null {
  const choice = engine.preparedAny?.section?.choice;
  if (!choice || choice === "stay") return null;
  return progressionById(choice) ?? null;
}

/** 区切りの前の小節で、Jevに「続けるか、どの進行へ移るか」を聞くための情報。移れる進行が無ければ聞かない */
function sectionQuestion(engine: Engine, target: number): SoloRequest["section"] {
  const current = engine.progression?.name ?? null;
  const options = sectionOptions(current).map((progression) => {
    const bias = sectionBias(progression);
    return { id: progression.id!, mood: progression.mood!, ...(bias === 1 ? {} : { bias }) };
  });
  if (options.length === 0) return undefined;
  const currentMood = current ? progressionByName(current)?.mood : undefined;
  return {
    current,
    ...(currentMood ? { currentMood } : {}),
    barsOn: engine.progression ? target - engine.progression.since : 0,
    options,
  };
}

/** 通知に添える、いま乗っている定番進行のID。画面の色を進行ごとに変えるのに使う */
function progressionIdOf(engine: Engine): { progression?: string } {
  const id = engine.progression ? progressionByName(engine.progression.name)?.id : undefined;
  return id ? { progression: id } : {};
}

/** 区切りでJevが返した確率を、画面の記録に出す短い文にする */
function describeSection(odds: Record<string, number>, moved: Progression | null): string {
  const total = Object.values(odds).reduce((sum, odd) => sum + odd, 0) || 1;
  const ranked = Object.entries(odds)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([id, odd]) => `${id === "stay" ? "続ける" : (progressionById(id)?.name ?? id)} ${Math.round((odd / total) * 100)}%`);
  return `進行 ${moved ? `→ ${moved.name}` : "このまま"}（${ranked.join(" / ")}）`;
}

/** 強さ（0〜1）に応じたフィルターの開き具合。弱い音はこもらせ、強い音は明るくする */
function brightnessHz(velocity: number): number {
  return 700 + velocity * velocity * 7300;
}

export function useSession(): Session {
  const engineRef = useRef<Engine | null>(null);
  const listenersRef = useRef(new Set<(event: SessionEvent) => void>());
  const [status, setStatus] = useState<SessionStatus>("idle");
  const [settings, setSettings] = useState<SessionSettings>({
    // 聴いた評価で、60〜90BPMが音楽としていちばん成り立った
    bpm: 80,
    strategy: "cells",
    voice: "sax-recorded",
    soloDb: 0,
    // 掛け合いは、旋律を弾くのが未経験者には難しすぎたので既定では使わない
    trade: false,
    breath: 0.6,
  });
  const [chord, setChord] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<ChordCandidate[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [readyMs, setReadyMs] = useState<number | null>(null);
  const [clientName, setClientName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<BarLog[]>([]);
  const [turn, setTurn] = useState<Session["turn"]>(null);
  const [reply, setReply] = useState<Session["reply"]>(null);
  /** ユーザーが直近1小節に叩いた回数 */
  /** 直前1小節の伴奏の質感 */
  const [touch, setTouch] = useState<Touch>("none");
  /** 叩いた回数から決まる、いまの盛り上がり */
  const [live, setLive] = useState<Energy>(RESTING_ENERGY);

  // 再生ループから最新の設定を読むためのref
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  /**
   * 直前1小節の伴奏の質感（押した回数と伸ばした長さ）を求め直し、古い記録を捨てる。
   * 少なく長く押さえればしっとり、連打すれば激しくなる
   */
  const countTaps = useCallback((engine: Engine) => {
    const beatSeconds = 60 / settingsRef.current.bpm;
    const now = performance.now() / 1000;
    engine.presses = engine.presses.filter((press) => (press.end ?? now) >= now - beatSeconds * 4);
    const touch = compTouch(engine.presses, now, beatSeconds * 4, beatSeconds);
    const energy = touchEnergy(touch);
    setTouch(touch);
    setLive(energy);
    return { energy, touch };
  }, []);

  const emit = useCallback((event: SessionEvent) => {
    for (const listener of listenersRef.current) {
      listener(event);
    }
  }, []);

  const subscribe = useCallback((listener: (event: SessionEvent) => void) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  /** 指定したコードすべての分のソロを、先に依頼しておく */
  const prepare = useCallback(
    (
      engine: Engine,
      chords: string[],
      previousPitch: number,
      memo: SoloMemo,
      { sustained, retargetable }: { sustained: boolean; retargetable: boolean },
      keepPrepared = false,
    ) => {
      const token = ++engine.requestToken;
      const requestedAt = performance.now();
      engine.lastRequest = { chords, previousPitch, memo, sustained, retargetable };
      // 出し直しのときは、新しい分が届くまで用意済みのソロを残しておく（間に合わなければそれを使う）
      if (!keepPrepared) {
        engine.prepared = new Map();
        engine.preparedAny = null;
      }
      setReadyMs(null);
      const { bpm, strategy, voice, trade: trading } = settingsRef.current;
      const { energy, touch } = countTaps(engine);
      const { range } = SOLO_INSTRUMENTS[voice];
      // 掛け合いでは、これから作る小節が応えの1小節目か2小節目かを伝える。
      // 1小節目なら、ユーザーが弾いた内容の要約も渡す
      const target = engine.bar + 1;
      const answering = target === 1 || turnOf(target - 1) === "you";
      const call = trading && answering ? summarizeCall(engine.callNotes) : null;
      const trade: SoloRequest["trade"] = trading ? { part: answering ? "answer" : "close", call } : undefined;
      // 次の小節が区切りの最後の小節なら、続けるか、どの定番進行へ移るかもJevに聞く（掛け合いの間は聞かない）。
      // 移るなら、その小節に移り先へ導くコードを置き、区切りの頭から移り先に入る
      const section = !trading && engine.bar > 0 && isSectionEnd(target) ? sectionQuestion(engine, target) : undefined;
      return requestSolos({
        chords,
        strategy,
        bpm,
        // ユーザーが弾き終えた音の近くから、Jevが弾き始める
        previousPitch: call ? intoRange(call.lastPitch, range) : previousPitch,
        range,
        energy,
        touch,
        // これから作るのは、いまの小節の次の小節。4小節のまとまりの中の位置を伝える
        barInPhrase: trade ? (answering ? 0 : 1) : engine.bar % 4,
        sustained: sustained && !(trade && answering),
        retargetable,
        // アドレスに ?mock=1 を付けて開くと、Jevを呼ばずにダミーで動かす（動作確認用）
        mock: new URLSearchParams(window.location.search).has("mock"),
        ...(trade ? { trade } : {}),
        ...(section ? { section } : {}),
        memo,
      })
        .then((response) => {
          if (engineRef.current !== engine || engine.requestToken !== token) return;
          engine.prepared = new Map(Object.entries(response.results));
        engine.preparedAny = Object.values(response.results).find((bar) => bar !== null) ?? null;
          setReadyMs(performance.now() - requestedAt);
          setClientName(response.client);
          setError(null);
        })
        .catch((cause: unknown) => {
          if (engineRef.current !== engine || engine.requestToken !== token) return;
          setError(cause instanceof Error ? cause.message : String(cause));
        });
    },
    [countTaps],
  );

  /**
   * 和音を押さえたままコードが変わったら、同じ位置のまま新しいコードの和音に押さえ直す。
   * そのままだと、前のコードの和音が次のコードの上で鳴り続けて、伴奏が進行から外れて聞こえる
   */
  const revoiceHeld = useCallback(
    (engine: Engine, chord: string, time: number) => {
      if (!engine.struck || !engine.struckAt || engine.struckAt.chord === chord) return;
      const { tone } = engine;
      const { step } = engine.struckAt;
      const voicing = step === undefined ? compVoicing(chord) : voicingUnder(pitchAtStep(step, chord), chord);
      const frequencies = voicing.map((pitch) => tone.Frequency(pitch, "midi").toFrequency());
      engine.jam.triggerRelease(engine.struck, time);
      // 押さえ直しは、新しく弾いたときより少し弱く鳴らす
      engine.jam.triggerAttack(frequencies, time, REVOICE_VELOCITY);
      engine.struck = frequencies;
      engine.struckAt = { step, chord };
      tone.getDraw().schedule(() => {
        if (engineRef.current === engine) emit({ kind: "jam", pitches: voicing, held: true });
      }, time);
    },
    [emit],
  );

  /** 小節の頭で呼ばれ、その小節の演奏の計画を作って、次の小節の準備を始める */
  const startBar = useCallback(
    (engine: Engine, time: number) => {
      const { tone } = engine;
      const first = engine.bar === 0;
      const draw = tone.getDraw();
      const bar = engine.bar + 1;
      engine.bar = bar;

      let current: string;
      let how: BarLog["how"];
      /** この小節から別の定番進行へ移ったなら、その進行 */
      let movedTo: Progression | null = null;
      // 区切りの頭なら、Jevが続けるか移るかを選んだ結果を記録に出す。
      // 用意済みのソロはこの後の次の小節の依頼で入れ替わるので、先に取っておく
      const sectionDecision = isSectionEnd(bar) ? engine.preparedAny?.section : undefined;
      /** この小節に置いた、移り先へ導くコードの行き先 */
      let leadingTo: Progression | null = null;
      if (first) {
        current = START_CHORD;
        how = "start";
        engine.history.push(current);
      } else if (engine.pendingSwitch !== null && engine.pendingSwitch !== engine.history.at(-1)) {
        // 前の小節の最後の拍で弾かれたコード。この小節の頭から切り替える
        current = engine.pendingSwitch;
        how = "chosen";
        engine.history.push(current);
      } else if (engine.heldOver) {
        // 前の小節でユーザーがコードを弾いた。自動では進まず、そのコードを続ける
        current = engine.history.at(-1)!;
        how = "chosen";
      } else {
        // 何も弾かれなかったので、既定の候補へ自動で進む。後半に置くコードがあれば、3拍目で切り替える。
        // 区切りの最後の小節でJevが移ると選んでいたら、移り先へ導くコードを置き、区切りの頭から移り先に入る
        const [first] = candidatesOf(engine);
        const move = isSectionEnd(bar) ? sectionMove(engine) : null;
        how = "auto";
        if (move) {
          // 移り先へ向かうツー・ファイブ。後半のコードがあれば3拍目で切り替える
          const leadIn = leadInFor(move);
          current = leadIn.chord;
          engine.autoSplit = leadIn.then ?? null;
          engine.pendingMove = move;
          leadingTo = move;
        } else if (isSectionStart(bar) && engine.pendingMove) {
          current = engine.pendingMove.chords[0]!;
          engine.autoSplit = null;
          engine.progression = { name: engine.pendingMove.name, since: bar };
          movedTo = engine.pendingMove;
          engine.pendingMove = null;
        } else {
          current = first!.chord;
          engine.autoSplit = first!.then ?? null;
          if (first!.progression && first!.progression !== engine.progression?.name) {
            engine.progression = { name: first!.progression, since: bar };
          }
        }
        engine.history.push(current);
      }
      if (how !== "auto") {
        engine.autoSplit = null;
        // ユーザーがコードを弾いたら、移る予定は取りやめる
        engine.pendingMove = null;
      }
      const trading = settingsRef.current.trade;
      const who: Turn = trading ? turnOf(bar) : "jev";
      if (trading && who === "you" && turnOf(bar - 1) === "jev") {
        // ユーザーの番が始まる。ここから弾かれた音を覚えておく
        engine.callNotes = [];
        engine.turnStartedAt = performance.now();
      }
      // ユーザーの番では、Jevは吹かない。
      // 用意していないコードへ進んだときは、同じフレーズをそのコードの上に乗せ直す
      const solo =
        who === "you"
          ? null
          : (engine.prepared.get(current) ?? transplant(engine.preparedAny, current, engine.held ? engine.heldPitch : null));
      engine.selected = null;
      engine.pendingSwitch = null;
      engine.heldOver = false;
      revoiceHeld(engine, current, time);
      // 次の小節の候補。後半のコードへ切り替える予定なら、切り替えた後の流れから求める
      const following = candidatesOf(engine, engine.autoSplit ? [...engine.history, engine.autoSplit] : engine.history);
      // 移る予定なら、移り先の最初のコードを候補の先頭に置く（次の小節のソロも、そのコードの分を用意する）
      const entry = engine.pendingMove?.chords[0];
      const next: ChordCandidate[] =
        entry === undefined
          ? following
          : [
              { chord: entry, adventure: 1, reason: `「${engine.pendingMove!.name}」へ移る`, progression: engine.pendingMove!.name },
              ...following.filter((candidate) => candidate.chord !== entry),
            ];

      const beat = tone.Time("4n").toSeconds();
      const ratio = swingRatioFor(settingsRef.current.bpm);
      const place = (beats: number, swing: boolean) => time + (swing ? swingBeats(beats, ratio) : beats) * beat;
      const { energy, touch } = countTaps(engine);
      const seeds = Array.from({ length: 8 }, () => Math.random());

      // 前の小節から鳴り続けている音を、この小節の入り方に合わせて処理する
      const held = engine.held;
      engine.held = null;
      const firstNote = solo?.notes[0];
      const tied = firstNote?.tie === true && held !== null;
      // スラー: 頭から新しい音が鳴るとき、近い音程なら前の音と少し重ねて、なめらかにつなぐ
      const slurred =
        held !== null && !tied && firstNote?.startBeats === 0 && Math.abs(firstNote.pitch - engine.heldPitch) <= SLUR_INTERVAL;
      if (held && tied && firstNote) {
        // 持ち越し: 新しく発音せず、鳴っている音をここまで伸ばす
        held.releaseAt(place(firstNote.startBeats + firstNote.durationBeats, firstNote.swing));
      } else if (held) {
        if (firstNote?.startBeats === 0) {
          held.releaseAt(time + (slurred ? 0.02 : 0), slurred ? 0.09 : 0.05);
        } else {
          // 余韻: この小節が遅れて入るとき、前の音を小節の頭で切らない。
          // このコードに合う音なら次の音が入るまで自然に消えていき、合わない音ならすぐ引っ込める
          const until = firstNote ? place(firstNote.startBeats, firstNote.swing) - time : beat * 2;
          held.releaseAt(time, fitsChord(engine.heldPitch, current) ? Math.min(until, beat * 1.5, 0.9) : 0.12);
        }
      }

      // 1音ごとの吹き方（しゃくり、音量の動き、ビブラート、フォール）をルールで決める
      const notes = solo?.notes ?? [];
      // 伴奏がしっとりしていれば、ビブラートを多く深くかける
      const mood = touch === "sustained" ? ({ mood: "sustained" } as const) : {};
      const expressions = planExpression(notes, { secondsPerBeat: beat, ...mood });
      if (slurred && expressions[0]) {
        // 前の音からなめらかにつなぐので、しゃくらず、やわらかく立ち上げる
        expressions[0] = { ...expressions[0], scoopSemitones: 0, scoopSeconds: 0, attackSeconds: 0.035 };
      }
      // 持ち越しの音は新しく発音しないので、表現の数には入れない
      const voiced = expressions.filter((_, index) => !notes[index]!.tie);
      const expressionSummary = [
        ["しゃくり", voiced.filter((expression) => expression.scoopSemitones > 0).length],
        ["音量の動き", voiced.filter((expression) => expression.shape !== "flat").length],
        ["ビブラート", voiced.filter((expression) => expression.vibrato).length],
        ["フォール", voiced.filter((expression) => expression.fall).length],
        ["持ち越し", tied ? 1 : 0],
        ["スラー", slurred ? 1 : 0],
      ]
        .filter(([, count]) => count !== 0)
        .map(([name, count]) => `${name}${count}`)
        .join(" ");

      engine.now = {
        bar,
        chord: current,
        // ベースの4拍目だけは、次のコードが決まるのを待って締切で決める
        // 進行が移る前の小節はフィルで予告し、移った小節の頭でシンバルを鳴らす
        band: accompaniment(
          current,
          { bar, energy, deferLastBass: true, fill: leadingTo !== null, crash: movedTo !== null },
          replay(seeds),
        ),
        solo,
        notes,
        expressions,
        seeds,
        energy,
        voice: settingsRef.current.voice,
        userComping: engine.lastCompTapBar >= bar - 1,
        mood,
        tied,
      };

      let sustained = false;
      let retargetable = false;
      if (solo) {
        const last = notes.at(-1);
        sustained = last !== undefined && reachesBarEnd(last);
        // 最後の音が締切より後に鳴り始めるなら、次のコードに合う音へ寄せられる
        retargetable = sustained && last !== undefined && !last.tie && last.startBeats >= DEADLINE_BEATS;
        engine.previous = { pitch: solo.lastPitch, memo: solo.memo };
      }
      if (!trading || (who === "jev" && turnOf(bar + 1) === "jev")) {
        void prepare(
          engine,
          next.map((candidate) => candidate.chord),
          engine.previous.pitch,
          engine.previous.memo,
          // この小節の最後の音が鳴り続けるなら、次の小節はそれを持ち越せる
          { sustained, retargetable },
        );
      } else {
        // 次の小節がユーザーの番なら、ソロは要らない（Jevを呼ばない）。
        // 次がJevの応えなら、ユーザーの演奏をできるだけ聴いてから聞くので、ここではまだ依頼しない（onBeat で依頼する）
        engine.requestToken++;
        engine.prepared = new Map();
        engine.preparedAny = null;
        engine.lastRequest = null;
      }

      const note = sectionDecision ? describeSection(sectionDecision.odds, leadingTo) : null;
      // 画面は、音が実際に鳴るタイミングに合わせて更新する
      draw.schedule(() => {
        if (engineRef.current !== engine) return;
        setChord(current);
        setCandidates(next);
        setSelected(engine.selected);
        setTurn(trading ? { who, bar: ((bar - 1) % TURN_BARS) + 1 } : null);
        // 応えの1小節目で、Jevがどう応えたかを出す。ユーザーの番の間も残して、次の応えで入れ替える
        if (!trading || (who === "jev" && turnOf(bar - 1) !== "jev")) setReply(solo?.reply ?? null);
        setLog((entries) =>
          [
            {
              bar,
              chord: current,
              how,
              ...(trading ? { turn: who } : {}),
              solo: solo && {
                summary: solo.summary,
                details: [solo.details, expressionSummary && `表現 ${expressionSummary}`, note]
                  .filter(Boolean)
                  .join(" / "),
                latencyMs: solo.latencyMs,
                calls: solo.calls,
              },
            },
            ...entries,
          ].slice(0, LOG_LIMIT),
        );
        emit({ kind: "bar", bar, chord: current, ...progressionIdOf(engine), ...(movedTo ? { section: movedTo.name } : {}) });
      }, time);
    },
    [countTaps, emit, prepare, revoiceHeld],
  );

  /**
   * ユーザーが弾いたコードへ、この拍からバンドを切り替える。
   * 伴奏は同じリズムの型のまま新しいコードで鳴らし、ソロは同じリズムと動きを新しいコードの上に乗せ直す。
   */
  const switchChord = useCallback(
    (engine: Engine, plan: BarPlan, target: string, time: number) => {
      plan.chord = target;
      engine.history.push(target);
      revoiceHeld(engine, target, time);
      const next = candidatesOf(engine);
      plan.band = accompaniment(target, { bar: plan.bar, energy: plan.energy, deferLastBass: true }, replay(plan.seeds));
      if (plan.solo?.plan) {
        const beat = engine.tone.Time("4n").toSeconds();
        plan.notes = renderCells(plan.solo.plan.cells, target, plan.solo.plan.render);
        plan.expressions = planExpression(plan.notes, { secondsPerBeat: beat, ...plan.mood });
      }
      // 伸ばしている音が新しいコードに合わなければ、すぐ引っ込める
      if (engine.held && !fitsChord(engine.heldPitch, target)) {
        engine.held.releaseAt(time, 0.12);
        engine.held = null;
      }
      engine.tone.getDraw().schedule(() => {
        if (engineRef.current !== engine) return;
        setChord(target);
        // 弾いたコードから進める先を、すぐ鍵盤に出す。続けて何度でも弾ける
        setCandidates(next);
        setSelected(target);
        emit({ kind: "bar", bar: plan.bar, chord: target, ...progressionIdOf(engine) });
      }, time);
    },
    [emit, revoiceHeld],
  );

  /** 次の小節の頭で鳴っているはずのコード。ユーザーがこの小節で弾いていればそのまま、弾いていなければ既定の候補 */
  const upcomingChord = (engine: Engine, plan: BarPlan): string =>
    engine.heldOver ? plan.chord : (engine.pendingMove?.chords[0] ?? candidatesOf(engine)[0]!.chord);

  /**
   * 4拍目の頭で、最後の1拍を次の小節のコードへ向かわせる。
   * この後の1拍のあいだにユーザーが別のコードを弾くこともあるが、そのときは向かった先とずれる。許容する
   */
  const aimLastBeat = useCallback((engine: Engine, plan: BarPlan) => {
    // 小節の終わりまで伸びる最後の音は、次のコードに合う音へ寄せる
    const last = plan.notes.at(-1);
    if (last && !last.tie && last.startBeats >= DEADLINE_BEATS && reachesBarEnd(last)) {
      plan.notes = [...plan.notes.slice(0, -1), { ...last, pitch: aimPitch(last.pitch, plan.chord, upcomingChord(engine, plan)) }];
    }
  }, []);

  /** 1拍ぶんの音を予約する */
  const scheduleBeat = useCallback(
    (engine: Engine, plan: BarPlan, beatIndex: number, time: number) => {
      const { tone } = engine;
      const draw = tone.getDraw();
      const beat = tone.Time("4n").toSeconds();
      const ratio = swingRatioFor(settingsRef.current.bpm);
      // この拍の頭（time）を基準に、小節内の拍の位置を時刻に直す
      const place = (beats: number, swing = true) => time + ((swing ? swingBeats(beats, ratio) : beats) - beatIndex) * beat;
      const midi = (pitch: number) => tone.Frequency(pitch, "midi").toFrequency();
      const inThisBeat = (startBeats: number) => startBeats >= beatIndex && startBeats < beatIndex + 1;

      // 伴奏
      for (const event of plan.band) {
        if (!inThisBeat(event.startBeats)) continue;
        if (plan.userComping && event.part === "comp") continue;
        const start = place(event.startBeats);
        const duration = Math.max(0.04, place(event.startBeats + event.durationBeats) - start);
        if (event.part === "bass") {
          engine.bass.triggerAttackRelease(midi(event.pitches[0]!), duration, start, event.velocity);
        } else if (event.part === "comp") {
          engine.comp.triggerAttackRelease(event.pitches.map(midi), duration, start, event.velocity);
        } else if (event.part === "crash") {
          engine.crash.triggerAttackRelease(0.05, start, event.velocity);
        } else {
          engine.ride.triggerAttackRelease(0.02, start, event.velocity);
        }
      }
      // ベースの4拍目は、次のコードのルートへ半音で寄る。静かなときは2分音符で弾いていて4拍目が無い
      if (beatIndex === DEADLINE_BEATS && plan.energy !== 1) {
        engine.bass.triggerAttackRelease(midi(bassApproach(plan.chord, upcomingChord(engine, plan))), beat * 0.9, time, 0.7);
      }
      draw.schedule(() => emit({ kind: "beat", beat: beatIndex }), time);

      // ソロ
      plan.notes.forEach((note, index) => {
        // 持ち越しの音は新しく発音しない（小節の頭で、鳴っている音を伸ばしてある）
        if (note.tie || !inThisBeat(note.startBeats)) return;
        const start = place(note.startBeats, note.swing);
        const end = place(note.startBeats + note.durationBeats, note.swing);
        // 小節の終わりまで伸びる音は、切らずに保留する。次の小節へ持ち越すかどうかは、次の小節の頭で決める
        const open = reachesBarEnd(note);
        const durationSeconds = Math.max(0.04, (end - start) * (open ? 1 : 0.92));
        engine.soloFilter.frequency.setTargetAtTime(brightnessHz(note.velocity), start, 0.01);
        const heldNote = engine.solos[plan.voice].play({
          pitch: note.pitch,
          time: start,
          duration: durationSeconds,
          velocity: note.velocity,
          expression: plan.expressions[index]!,
          open,
        });
        if (heldNote) {
          engine.held = heldNote;
          engine.heldPitch = note.pitch;
        }
        draw.schedule(() => emit({ kind: "note", pitch: note.pitch, velocity: note.velocity, durationSeconds }), start);
      });
    },
    [emit],
  );

  /** 1拍ごとに呼ばれる。小節の頭では計画を作り、毎拍その拍のぶんの音を予約する */
  const onBeat = useCallback(
    (engine: Engine, time: number) => {
      const beatIndex = engine.beatCount % BEATS_PER_BAR;
      engine.beatCount++;
      if (beatIndex === 0) {
        startBar(engine, time);
      }
      const plan = engine.now;
      if (!plan) return;
      // ユーザーがコードを弾いていたら、この拍から切り替える（小節の頭のぶんは startBar が処理した）
      const target = engine.pendingSwitch;
      engine.pendingSwitch = null;
      if (beatIndex > 0 && target !== null && target !== plan.chord) {
        switchChord(engine, plan, target, time);
      }
      // 1小節に2つのコードを置く小節では、3拍目で後半のコードへ切り替える
      if (beatIndex === SPLIT_BEAT && engine.autoSplit !== null) {
        const second = engine.autoSplit;
        engine.autoSplit = null;
        if (second !== plan.chord) switchChord(engine, plan, second, time);
      }
      if (beatIndex === DEADLINE_BEATS) {
        aimLastBeat(engine, plan);
      }
      // 掛け合い: ユーザーの番の最後の小節で、間に合ういちばん遅い拍まで聴いてから、Jevに応えを聞く
      const { trade: trading, bpm } = settingsRef.current;
      if (trading && turnOf(plan.bar) === "you" && turnOf(plan.bar + 1) === "jev" && beatIndex === prepareBeat(bpm)) {
        void prepare(
          engine,
          candidatesOf(engine).map((candidate) => candidate.chord),
          engine.previous.pitch,
          engine.previous.memo,
          { sustained: false, retargetable: false },
        );
      }
      scheduleBeat(engine, plan, beatIndex, time);
    },
    [aimLastBeat, prepare, scheduleBeat, startBar, switchChord],
  );

  const stop = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engineRef.current = null;
    const transport = engine.tone.getTransport();
    transport.stop();
    transport.cancel();
    for (const node of [
      ...Object.values(engine.solos),
      ...engine.soloGains,
      engine.soloVolume,
      engine.breathVolume,
      engine.soloFilter,
      engine.reverb,
      engine.comp,
      engine.jam,
      engine.bass,
      engine.rideNoise,
      engine.ride,
      engine.rideFilter,
      engine.crashNoise,
      engine.crash,
      engine.crashFilter,
    ]) {
      node.dispose();
    }
    setStatus("idle");
    setChord(null);
    setCandidates([]);
    setSelected(null);
    setReadyMs(null);
    setTouch("none");
    setTurn(null);
    setReply(null);
  }, []);

  const start = useCallback(async () => {
    if (engineRef.current) return;
    setStatus("starting");
    setError(null);
    try {
      // Tone.jsはブラウザでしか動かないので、開始時に読み込む
      const tone = await import("tone");
      await tone.start();

      // 全体に薄く残響をかけて、録音音源の継ぎ目をなじませる
      const reverb = new tone.Reverb({ decay: 1.6, wet: 0.16 }).toDestination();
      const soloFilter = new tone.Filter({ type: "lowpass", frequency: 4000, rolloff: -12 }).connect(reverb);
      const soloVolume = new tone.Volume(settingsRef.current.soloDb).connect(soloFilter);
      const breathVolume = new tone.Volume(settingsRef.current.soloDb).connect(reverb);
      const soloGains: Engine["soloGains"] = [];
      const solos = Object.fromEntries(
        SOLO_VOICES.map((voice) => {
          const instrument = SOLO_INSTRUMENTS[voice];
          const gain = new tone.Gain(tone.dbToGain(instrument.gainDb)).connect(soloVolume);
          const breathGain = new tone.Gain(tone.dbToGain(instrument.gainDb)).connect(breathVolume);
          soloGains.push(gain, breathGain);
          return [
            voice,
            createExpressiveVoice(tone, instrument.samples, gain, instrument.startOffset, {
              level: instrument.breath,
              amount: () => settingsRef.current.breath,
              output: breathGain,
            }),
          ];
        }),
      ) as Engine["solos"];
      const engine: Engine = {
        tone,
        solos,
        soloGains,
        soloVolume,
        breathVolume,
        soloFilter,
        reverb,
        comp: new tone.Sampler({ urls: COMP_SAMPLES, release: 0.6 }).connect(reverb),
        jam: new tone.Sampler({ urls: COMP_SAMPLES, release: 0.8 }).connect(reverb),
        bass: new tone.Sampler({ urls: BASS_SAMPLES, release: 0.3 }).toDestination(),
        rideNoise: new tone.Noise("white"),
        ride: new tone.AmplitudeEnvelope({ attack: 0.001, decay: 0.08, sustain: 0, release: 0.02 }),
        rideFilter: new tone.Filter({ type: "highpass", frequency: 7000 }).connect(reverb),
        crashNoise: new tone.Noise("pink"),
        crash: new tone.AmplitudeEnvelope({ attack: 0.002, decay: 1.6, sustain: 0, release: 0.4 }),
        crashFilter: new tone.Filter({ type: "highpass", frequency: 3500 }).connect(reverb),
        bar: 0,
        history: [],
        prepared: new Map(),
        selected: null,
        requestToken: 0,
        held: null,
        heldPitch: SOLO_START_PITCH,
        heldOver: false,
        heldNotes: new Map(),
        callNotes: [],
        turnStartedAt: 0,
        repreparedBar: 0,
        preparedAny: null,
        now: null,
        beatCount: 0,
        pendingSwitch: null,
        autoSplit: null,
        // 最初から基本の進行に乗る
        progression: { name: START_PROGRESSION.name, since: 1 },
        pendingMove: null,
        pressed: null,
        struck: null,
        struckAt: null,
        previous: { pitch: SOLO_START_PITCH, memo: {} },
        presses: [],
        holding: null,
        lastCompTapBar: -1,
        lastRequest: null,
      };
      engine.rideNoise.chain(engine.ride, engine.rideFilter);
      engine.rideNoise.volume.value = -10;
      engine.rideNoise.start();
      engine.crashNoise.chain(engine.crash, engine.crashFilter);
      engine.crashNoise.volume.value = -12;
      engine.crashNoise.start();
      engine.comp.volume.value = COMP_GAIN_DB;
      engine.jam.volume.value = COMP_GAIN_DB + JAM_BOOST_DB;
      engine.bass.volume.value = BASS_GAIN_DB;
      engineRef.current = engine;

      // 裏で読み込む楽器が失敗しても、画面に未処理のエラーを出さない（その楽器は鳴らないだけ）
      for (const voice of Object.values(solos)) voice.loaded.catch(() => {});
      // 音源ファイルと残響の準備、最初の小節のソロの取得が終わってから始める
      await Promise.all([
        tone.loaded(),
        // 選んでいる楽器だけを待つ。ほかの楽器は裏で読み込み、終わるまでは切り替えても鳴らない
        solos[settingsRef.current.voice].loaded,
        reverb.ready,
        prepare(engine, [START_CHORD], SOLO_START_PITCH, {}, { sustained: false, retargetable: false }),
      ]);
      if (engineRef.current !== engine) return;

      setLog([]);
      // 画面の処理が一瞬止まっても、コードや候補の表示の更新を捨てない。
      // 既定（0.25秒）のままだと、遅れた小節の表示が飛んで、古い候補が画面に残る
      tone.getDraw().expiration = 2;
      const transport = tone.getTransport();
      transport.bpm.value = settingsRef.current.bpm;
      transport.scheduleRepeat(
        (time) => {
          try {
            onBeat(engine, time);
          } catch (cause) {
            // 1拍の失敗でセッション全体が黙って止まらないよう、画面に出して次の拍へ進む
            console.error("音の予約に失敗しました", cause);
            setError(cause instanceof Error ? cause.message : String(cause));
          }
        },
        "4n",
        0,
      );
      transport.start("+0.1");
      setStatus("playing");
    } catch (cause) {
      stop();
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [onBeat, prepare, stop]);

  /**
   * ユーザーが弾いたことを記録する。held が true なら、離したとき（releasePress）に長さが決まる。
   * 伴奏の質感が変われば、盛り上がりが変わってソロの作り直しが走る
   */
  const recordTap = useCallback(
    (engine: Engine, held = false) => {
      const at = performance.now() / 1000;
      const press: Press = { at, end: held ? null : at + SHORT_PRESS_SECONDS };
      engine.presses.push(press);
      if (held) engine.holding = press;
      countTaps(engine);
    },
    [countTaps],
  );

  /** 押さえていた和音を離した時刻を記録する */
  const releasePress = useCallback(
    (engine: Engine) => {
      if (!engine.holding) return;
      engine.holding.end = performance.now() / 1000;
      engine.holding = null;
      countTaps(engine);
    },
    [countTaps],
  );

  const releaseChord = useCallback(() => {
    const engine = engineRef.current;
    if (!engine?.pressed) return;
    engine.jam.triggerRelease(engine.pressed, engine.tone.immediate());
    engine.pressed = null;
  }, []);

  const choose = useCallback(
    (candidate: string) => {
      const engine = engineRef.current;
      const plan = engine?.now;
      if (!engine || !plan) return;
      const { tone } = engine;

      // いまのコードから進める先だけを弾ける。進行として成り立たせるための柵
      if (!candidatesOf(engine).some((option) => option.chord === candidate)) return;
      // バンドは次の拍から付いてくる。この小節で弾いたので、次の小節の頭では自動で進まない
      engine.pendingSwitch = candidate;
      engine.heldOver = true;
      engine.selected = candidate;
      // ユーザーが弾いたので、自動の後半のコードへの切り替えは取りやめる
      engine.autoSplit = null;
      setSelected(candidate);

      // 押した瞬間に、自分の手でコードを鳴らす。離すまで鳴り続ける
      releaseChord();
      const voicing = compVoicing(candidate);
      const frequencies = [...voicing, voicing.at(-1)! + 12].map((pitch) => tone.Frequency(pitch, "midi").toFrequency());
      engine.jam.triggerAttack(frequencies, tone.immediate(), 0.9);
      engine.pressed = frequencies;
      emit({ kind: "jam", pitches: voicing });
      // コードを弾くのも、叩いたことに数える
      recordTap(engine);
    },
    [emit, recordTap, releaseChord],
  );

  /** 掛け合いで、ユーザーが自分の番に弾いた音を覚える */
  const recordCall = useCallback((engine: Engine, pitch: number) => {
    const { trade: trading, bpm } = settingsRef.current;
    if (!trading || !engine.now || turnOf(engine.now.bar) !== "you") return;
    engine.callNotes.push({ pitch, beat: (performance.now() - engine.turnStartedAt) / (60_000 / bpm) });
  }, []);

  const lift = useCallback(() => {
    const engine = engineRef.current;
    if (!engine?.struck) return;
    engine.jam.triggerRelease(engine.struck, engine.tone.immediate());
    engine.struck = null;
    engine.struckAt = null;
    releasePress(engine);
    emit({ kind: "lift" });
  }, [emit, releasePress]);

  const strike = useCallback(
    (step?: number) => {
      const engine = engineRef.current;
      const current = engine?.history.at(-1);
      if (!engine || current === undefined) return;
      const { tone } = engine;
      // 前に押さえていた和音は止める（同時に押さえられるのは1つ）
      lift();
      // 押した位置の音をいちばん上にした和音。位置を変えるたびに、同じコードでも違う響きになる
      const voicing = step === undefined ? compVoicing(current) : voicingUnder(pitchAtStep(step, current), current);
      const frequencies = voicing.map((pitch) => tone.Frequency(pitch, "midi").toFrequency());
      // 離すまで伸ばす
      engine.jam.triggerAttack(frequencies, tone.immediate(), 0.9);
      engine.struck = frequencies;
      engine.struckAt = { step, chord: current };
      emit({ kind: "jam", pitches: voicing, held: true });
      engine.lastCompTapBar = engine.bar;
      recordTap(engine, true);
    },
    [emit, lift, recordTap],
  );

  const noteOn = useCallback(
    (pitchClass: number) => {
      const engine = engineRef.current;
      if (!engine || !engine.now || engine.heldNotes.has(pitchClass)) return;
      const { tone } = engine;
      const pitch = JAM_TONE_BASE + pitchClass;
      const frequency = tone.Frequency(pitch, "midi").toFrequency();
      // 押した音をそのまま鳴らす。コードに合わない音でも、寄せたり黙らせたりしない
      engine.jam.triggerAttack(frequency, tone.immediate(), 0.95);
      engine.heldNotes.set(pitchClass, frequency);
      emit({ kind: "jam", pitches: [pitch] });
      recordTap(engine);
      recordCall(engine, pitch);
    },
    [emit, recordCall, recordTap],
  );

  const noteOff = useCallback((pitchClass: number) => {
    const engine = engineRef.current;
    const frequency = engine?.heldNotes.get(pitchClass);
    if (!engine || frequency === undefined) return;
    engine.jam.triggerRelease(frequency, engine.tone.immediate());
    engine.heldNotes.delete(pitchClass);
  }, []);

  const padOn = useCallback(
    (slot: number) => {
      const engine = engineRef.current;
      const current = engine?.history.at(-1);
      const held = PAD_HELD_OFFSET + slot;
      if (!engine || !engine.now || current === undefined || engine.heldNotes.has(held)) return;
      const pitch = padPitches(current, PAD_LOW)[slot];
      if (pitch === undefined) return;
      const { tone } = engine;
      const frequency = tone.Frequency(pitch, "midi").toFrequency();
      engine.jam.triggerAttack(frequency, tone.immediate(), 0.95);
      engine.heldNotes.set(held, frequency);
      emit({ kind: "jam", pitches: [pitch] });
      recordTap(engine);
      recordCall(engine, pitch);
    },
    [emit, recordCall, recordTap],
  );

  const padOff = useCallback((slot: number) => noteOff(PAD_HELD_OFFSET + slot), [noteOff]);

  const updateSettings = useCallback((patch: Partial<SessionSettings>) => {
    setSettings((current) => ({ ...current, ...patch }));
  }, []);

  // テンポと音量の変更は再生中にも反映する
  useEffect(() => {
    const engine = engineRef.current;
    if (engine) {
      engine.tone.getTransport().bpm.value = settings.bpm;
      engine.soloVolume.volume.value = settings.soloDb;
      engine.breathVolume.volume.value = settings.soloDb;
    }
  }, [settings.bpm, settings.soloDb]);


  // 盛り上がりの段階が変わったら（つまみを動かした、または叩いて段階が上がった）、次の小節のソロを作り直す。
  // 効くのを1小節早めるため。作り直しはJevを呼ぶので、1小節に1回までにする。
  // 以前は叩き方が変わるたびに作り直していて、鍵盤を弾くだけで依頼が倍に増えていた
  useEffect(() => {
    const engine = engineRef.current;
    // 掛け合いでは作り直さない。応えの音数は応え方で決まるので、作り直してもJevを呼ぶ回数が増えるだけになる
    if (settingsRef.current.trade) return;
    if (engine?.lastRequest && engine.bar > 0 && engine.repreparedBar !== engine.bar) {
      engine.repreparedBar = engine.bar;
      const { chords, previousPitch, memo, sustained, retargetable } = engine.lastRequest;
      void prepare(engine, chords, previousPitch, memo, { sustained, retargetable }, true);
    }
  }, [live, prepare]);

  // 画面を離れるときに音を止める
  useEffect(() => stop, [stop]);

  return useMemo(
    () => ({
      status,
      start: () => void start(),
      stop,
      settings,
      updateSettings,
      chord,
      candidates,
      nextChord: selected ?? candidates[0]?.chord ?? null,
      chosenByUser: selected !== null,
      choose,
      releaseChord,
      readyMs,
      clientName,
      error,
      log,
      subscribe,
      strike,
      lift,
      noteOn,
      noteOff,
      padOn,
      padOff,
      turn,
      reply,
      liveEnergy: live,
      touch,
    }),
    [
      status,
      start,
      stop,
      settings,
      updateSettings,
      chord,
      candidates,
      selected,
      choose,
      releaseChord,
      readyMs,
      clientName,
      error,
      log,
      subscribe,
      strike,
      lift,
      noteOn,
      noteOff,
      padOn,
      padOff,
      turn,
      reply,
      live,
      touch,
    ],
  );
}
