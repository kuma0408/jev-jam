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
import { aimPitch, fitsChord } from "../../lib/solo/aim.ts";
import type { SoloBar, SoloMemo, SoloNote, SoloRequest, SoloResponse, SoloStrategy } from "../../lib/solo/api.ts";
import { padPitches } from "../../lib/music/pads.ts";
import { type Energy, type Touch, liveEnergy, touchOf } from "../../lib/solo/energy.ts";
import { type NoteExpression, planExpression } from "../../lib/solo/expression.ts";
import { renderCells } from "../../lib/solo/render-cells.ts";
import { swingBeats, swingRatioFor } from "../../lib/solo/swing.ts";
import { type ExpressiveVoice, type HeldNote, createExpressiveVoice } from "./expressive-voice.ts";

const START_CHORD = "Cmaj7";
const BEATS_PER_BAR = 4;
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
  /** 盛り上がりのつまみ。ソロの音数と強さ、伴奏の刻みに効く */
  energy: Energy;
};

/** 自分で弾く音の高さ。自動の伴奏より1オクターブ上で、埋もれない音域 */
const JAM_TONE_BASE = 72;
/** 合う音だけの鍵盤の、いちばん左の音のおおよその高さ（MIDIノート番号） */
export const PAD_LOW = 64;
/** 押さえている音の覚え書きで、合う音だけの鍵盤の分を12音の鍵盤と区別するための番号のずらし */
const PAD_HELD_OFFSET = 100;
/** 自分で弾く音を、自動の伴奏よりどれだけ大きくするか（dB）。8では大きすぎた */
const JAM_BOOST_DB = 4;

/** 音が実際に鳴るタイミングで届く通知。背景の演出などに使う */
export type SessionEvent =
  | { kind: "bar"; bar: number; chord: string }
  /** beat は小節内の拍（0〜3） */
  | { kind: "beat"; beat: number }
  /** ソロの1音。velocity は強さ（0〜1） */
  | { kind: "note"; pitch: number; velocity: number; durationSeconds: number }
  /** ユーザーが自分で鳴らした音（MIDIノート番号） */
  | { kind: "jam"; pitches: number[] };

export type BarLog = {
  bar: number;
  chord: string;
  /** start: 最初の小節 / auto: 選ばれず既定の候補に進んだ / chosen: ユーザーが選んだ */
  how: "start" | "auto" | "chosen";
  /** ソロが小節の頭に間に合わなければ null */
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
  tap: () => void;
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
  bar: number;
  /** これまでに鳴らしたコード（古い順） */
  history: string[];
  /** 次の小節の候補ごとの、用意できたソロ */
  prepared: Map<string, SoloBar | null>;
  selected: string | null;
  /** 古い応答を捨てるための通し番号 */
  requestToken: number;
  /** ユーザーが叩いた時刻（performance.now のミリ秒）。直近1小節ぶんだけ残す */
  taps: number[];
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
  /** ユーザーが押さえているコードの音（周波数）。離したときに止める */
  pressed: number[] | null;
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
    energy: 2,
  });
  const [chord, setChord] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<ChordCandidate[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [readyMs, setReadyMs] = useState<number | null>(null);
  const [clientName, setClientName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<BarLog[]>([]);
  /** ユーザーが直近1小節に叩いた回数 */
  const [tapCount, setTapCount] = useState(0);

  // 再生ループから最新の設定を読むためのref
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  /** 直近1小節に叩いた回数を数え直し、古い記録を捨てる */
  const countTaps = useCallback((engine: Engine) => {
    const barMs = (60_000 / settingsRef.current.bpm) * 4;
    const since = performance.now() - barMs;
    engine.taps = engine.taps.filter((at) => at >= since);
    setTapCount(engine.taps.length);
    return engine.taps.length;
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
      const { bpm, strategy, voice, energy: dial } = settingsRef.current;
      const taps = engine.taps.length;
      return requestSolos({
        chords,
        strategy,
        bpm,
        previousPitch,
        range: SOLO_INSTRUMENTS[voice].range,
        energy: liveEnergy(dial, taps),
        touch: touchOf(taps),
        // これから作るのは、いまの小節の次の小節。4小節のまとまりの中の位置を伝える
        barInPhrase: engine.bar % 4,
        sustained,
        retargetable,
        // アドレスに ?mock=1 を付けて開くと、Jevを呼ばずにダミーで動かす（動作確認用）
        mock: new URLSearchParams(window.location.search).has("mock"),
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
    [],
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
        // 何も弾かれなかったので、既定の候補へ自動で進む
        current = nextChordCandidates(engine.history)[0]!.chord;
        how = "auto";
        engine.history.push(current);
      }
      // 用意していないコードへ進んだときは、同じフレーズをそのコードの上に乗せ直す
      const solo = engine.prepared.get(current) ?? transplant(engine.preparedAny, current, engine.held ? engine.heldPitch : null);
      engine.selected = null;
      engine.pendingSwitch = null;
      engine.heldOver = false;
      const next = nextChordCandidates(engine.history);

      const beat = tone.Time("4n").toSeconds();
      const ratio = swingRatioFor(settingsRef.current.bpm);
      const place = (beats: number, swing: boolean) => time + (swing ? swingBeats(beats, ratio) : beats) * beat;
      const energy = liveEnergy(settingsRef.current.energy, countTaps(engine));
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
      const expressions = planExpression(notes, { secondsPerBeat: beat });
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
        band: accompaniment(current, { bar, energy, deferLastBass: true }, replay(seeds)),
        solo,
        notes,
        expressions,
        seeds,
        energy,
        voice: settingsRef.current.voice,
        userComping: engine.lastCompTapBar >= bar - 1,
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
      void prepare(
        engine,
        next.map((candidate) => candidate.chord),
        engine.previous.pitch,
        engine.previous.memo,
        // この小節の最後の音が鳴り続けるなら、次の小節はそれを持ち越せる
        { sustained, retargetable },
      );

      // 画面は、音が実際に鳴るタイミングに合わせて更新する
      draw.schedule(() => {
        if (engineRef.current !== engine) return;
        setChord(current);
        setCandidates(next);
        setSelected(engine.selected);
        setLog((entries) =>
          [
            {
              bar,
              chord: current,
              how,
              solo: solo && {
                summary: solo.summary,
                details: expressionSummary ? `${solo.details} / 表現 ${expressionSummary}` : solo.details,
                latencyMs: solo.latencyMs,
                calls: solo.calls,
              },
            },
            ...entries,
          ].slice(0, LOG_LIMIT),
        );
        emit({ kind: "bar", bar, chord: current });
      }, time);
    },
    [countTaps, emit, prepare],
  );

  /**
   * ユーザーが弾いたコードへ、この拍からバンドを切り替える。
   * 伴奏は同じリズムの型のまま新しいコードで鳴らし、ソロは同じリズムと動きを新しいコードの上に乗せ直す。
   */
  const switchChord = useCallback(
    (engine: Engine, plan: BarPlan, target: string, time: number) => {
      plan.chord = target;
      engine.history.push(target);
      const next = nextChordCandidates(engine.history);
      plan.band = accompaniment(target, { bar: plan.bar, energy: plan.energy, deferLastBass: true }, replay(plan.seeds));
      if (plan.solo?.plan) {
        const beat = engine.tone.Time("4n").toSeconds();
        plan.notes = renderCells(plan.solo.plan.cells, target, plan.solo.plan.render);
        plan.expressions = planExpression(plan.notes, { secondsPerBeat: beat });
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
        emit({ kind: "bar", bar: plan.bar, chord: target });
      }, time);
    },
    [emit],
  );

  /** 次の小節の頭で鳴っているはずのコード。ユーザーがこの小節で弾いていればそのまま、弾いていなければ既定の候補 */
  const upcomingChord = (engine: Engine, plan: BarPlan): string =>
    engine.heldOver ? plan.chord : nextChordCandidates(engine.history)[0]!.chord;

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
      if (beatIndex === DEADLINE_BEATS) {
        aimLastBeat(engine, plan);
      }
      scheduleBeat(engine, plan, beatIndex, time);
    },
    [aimLastBeat, scheduleBeat, startBar, switchChord],
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
      engine.soloFilter,
      engine.reverb,
      engine.comp,
      engine.jam,
      engine.bass,
      engine.rideNoise,
      engine.ride,
      engine.rideFilter,
    ]) {
      node.dispose();
    }
    setStatus("idle");
    setChord(null);
    setCandidates([]);
    setSelected(null);
    setReadyMs(null);
    setTapCount(0);
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
      const soloGains: Engine["soloGains"] = [];
      const solos = Object.fromEntries(
        SOLO_VOICES.map((voice) => {
          const instrument = SOLO_INSTRUMENTS[voice];
          const gain = new tone.Gain(tone.dbToGain(instrument.gainDb)).connect(soloVolume);
          soloGains.push(gain);
          return [voice, createExpressiveVoice(tone, instrument.samples, gain, instrument.startOffset)];
        }),
      ) as Engine["solos"];
      const engine: Engine = {
        tone,
        solos,
        soloGains,
        soloVolume,
        soloFilter,
        reverb,
        comp: new tone.Sampler({ urls: COMP_SAMPLES, release: 0.6 }).connect(reverb),
        jam: new tone.Sampler({ urls: COMP_SAMPLES, release: 0.8 }).connect(reverb),
        bass: new tone.Sampler({ urls: BASS_SAMPLES, release: 0.3 }).toDestination(),
        rideNoise: new tone.Noise("white"),
        ride: new tone.AmplitudeEnvelope({ attack: 0.001, decay: 0.08, sustain: 0, release: 0.02 }),
        rideFilter: new tone.Filter({ type: "highpass", frequency: 7000 }).connect(reverb),
        bar: 0,
        history: [],
        prepared: new Map(),
        selected: null,
        requestToken: 0,
        held: null,
        heldPitch: SOLO_START_PITCH,
        heldOver: false,
        heldNotes: new Map(),
        repreparedBar: 0,
        preparedAny: null,
        now: null,
        beatCount: 0,
        pendingSwitch: null,
        pressed: null,
        previous: { pitch: SOLO_START_PITCH, memo: {} },
        taps: [],
        lastCompTapBar: -1,
        lastRequest: null,
      };
      engine.rideNoise.chain(engine.ride, engine.rideFilter);
      engine.rideNoise.volume.value = -10;
      engine.rideNoise.start();
      engine.comp.volume.value = COMP_GAIN_DB;
      engine.jam.volume.value = COMP_GAIN_DB + JAM_BOOST_DB;
      engine.bass.volume.value = BASS_GAIN_DB;
      engineRef.current = engine;

      // 音源ファイルと残響の準備、最初の小節のソロの取得が終わってから始める
      await Promise.all([
        tone.loaded(),
        ...Object.values(solos).map((voice) => voice.loaded),
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
      if (!nextChordCandidates(engine.history).some((option) => option.chord === candidate)) return;
      // バンドは次の拍から付いてくる。この小節で弾いたので、次の小節の頭では自動で進まない
      engine.pendingSwitch = candidate;
      engine.heldOver = true;
      engine.selected = candidate;
      setSelected(candidate);

      // 押した瞬間に、自分の手でコードを鳴らす。離すまで鳴り続ける
      releaseChord();
      const voicing = compVoicing(candidate);
      const frequencies = [...voicing, voicing.at(-1)! + 12].map((pitch) => tone.Frequency(pitch, "midi").toFrequency());
      engine.jam.triggerAttack(frequencies, tone.immediate(), 0.9);
      engine.pressed = frequencies;
      emit({ kind: "jam", pitches: voicing });
      // コードを弾くのも、叩いた回数に数える（盛り上がりに効く）
      engine.taps.push(performance.now());
      countTaps(engine);
    },
    [countTaps, emit, releaseChord],
  );

  /** ユーザーが叩いたことを記録する。盛り上がりが変わればソロの作り直しが走る */
  const recordTap = useCallback(
    (engine: Engine) => {
      engine.taps.push(performance.now());
      countTaps(engine);
    },
    [countTaps],
  );

  const tap = useCallback(() => {
    const engine = engineRef.current;
    const current = engine?.history.at(-1);
    if (!engine || current === undefined) return;
    const { tone } = engine;
    // いちばん上の音を1オクターブ上にも重ねて、輪郭をはっきりさせる
    const voicing = compVoicing(current);
    emit({ kind: "jam", pitches: voicing });
    engine.jam.triggerAttackRelease(
      [...voicing, voicing.at(-1)! + 12].map((pitch) => tone.Frequency(pitch, "midi").toFrequency()),
      0.4,
      tone.immediate(),
      0.9,
    );
    engine.lastCompTapBar = engine.bar;
    recordTap(engine);
  }, [emit, recordTap]);

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
    },
    [emit, recordTap],
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
    },
    [emit, recordTap],
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
    }
  }, [settings.bpm, settings.soloDb]);

  const live = liveEnergy(settings.energy, tapCount);
  const touch = touchOf(tapCount);

  // 盛り上がりの段階が変わったら（つまみを動かした、または叩いて段階が上がった）、次の小節のソロを作り直す。
  // 効くのを1小節早めるため。作り直しはJevを呼ぶので、1小節に1回までにする。
  // 以前は叩き方が変わるたびに作り直していて、鍵盤を弾くだけで依頼が倍に増えていた
  useEffect(() => {
    const engine = engineRef.current;
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
      tap,
      noteOn,
      noteOff,
      padOn,
      padOff,
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
      tap,
      noteOn,
      noteOff,
      padOn,
      padOff,
      live,
      touch,
    ],
  );
}
