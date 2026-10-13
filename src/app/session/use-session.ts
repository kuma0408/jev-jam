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
import { accompaniment, bassApproach, compVoicing } from "../../lib/band/accompaniment.ts";
import { chordTones, pitchClassOf } from "../../lib/music/chord.ts";
import { type ChordCandidate, nextChordCandidates } from "../../lib/progression/candidates.ts";
import { aimPitch, fitsChord } from "../../lib/solo/aim.ts";
import type { SoloBar, SoloMemo, SoloNote, SoloRequest, SoloResponse, SoloStrategy } from "../../lib/solo/api.ts";
import { type Energy, type Touch, liveEnergy, touchOf } from "../../lib/solo/energy.ts";
import { type NoteExpression, planExpression } from "../../lib/solo/expression.ts";
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

/** 鍵盤とは別に、ユーザーが自分で弾ける「いまのコードの音」の数 */
export const JAM_TONE_COUNT = 4;
/** 自分で弾く音の高さ。自動の伴奏より1オクターブ上で、埋もれない音域 */
const JAM_TONE_BASE = 72;
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
  /** nextChord をユーザーが選んだか（false なら既定の候補） */
  chosenByUser: boolean;
  /** 締切（4拍目の頭）を過ぎて、次のコードが確定しているか。確定後は choose しても変わらない */
  locked: boolean;
  choose: (chord: string) => void;
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
  /** いまのコードの構成音を1つ鳴らす（合いの手を自分で入れる）。index は 0〜JAM_TONE_COUNT-1 */
  playTone: (index: number) => void;
  /** playTone で鳴る音の名前。停止中は空 */
  tones: string[];
  /** つまみの値に、ユーザーの叩き方を足した実際の盛り上がり。ソロと伴奏はこれに応える */
  liveEnergy: Energy;
  /** ユーザーが直近1小節にどれだけ叩いたか */
  touch: Touch;
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
  /** 締切で確定した次のコード。締切の前は null */
  locked: { chord: string; byUser: boolean } | null;
  /** この小節のソロのうち、締切より後に鳴らす音。次のコードが決まってから予約する */
  tail: { notes: SoloNote[]; expressions: NoteExpression[]; schedule: (note: SoloNote, expression: NoteExpression) => void } | null;
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
  /** 締切を過ぎて、次のコードが確定しているか */
  const [locked, setLocked] = useState(false);

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
        memo,
      })
        .then((response) => {
          if (engineRef.current !== engine || engine.requestToken !== token) return;
          engine.prepared = new Map(Object.entries(response.results));
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

  /** 小節の頭ごとに呼ばれ、その小節の音を予約して次の小節の準備を始める */
  const onBar = useCallback(
    (engine: Engine, time: number, previous: { pitch: number; memo: SoloMemo }) => {
      const { tone } = engine;
      const first = engine.bar === 0;
      const options = first ? [] : nextChordCandidates(engine.history);
      // 次のコードは、前の小節の締切（4拍目の頭）で確定している。
      // 確定していなければ（テンポを変えた直後など）、ここで決める
      const picked = options.find((candidate) => candidate.chord === engine.selected)?.chord;
      const decided = engine.locked ?? { chord: picked ?? options[0]?.chord ?? START_CHORD, byUser: picked !== undefined };
      const current = first ? START_CHORD : decided.chord;
      const how: BarLog["how"] = first ? "start" : decided.byUser ? "chosen" : "auto";
      const solo = engine.prepared.get(current) ?? null;
      const bar = engine.bar + 1;
      const draw = tone.getDraw();

      engine.bar = bar;
      engine.history.push(current);
      engine.selected = null;
      engine.locked = null;
      engine.tail = null;
      const next = nextChordCandidates(engine.history);

      const beat = tone.Time("4n").toSeconds();
      const ratio = swingRatioFor(settingsRef.current.bpm);
      const at = (beats: number) => time + swingBeats(beats, ratio) * beat;
      const midi = (pitch: number) => tone.Frequency(pitch, "midi").toFrequency();

      // 伴奏。ベースの4拍目だけは、次のコードが決まるのを待って onLastBeat で鳴らす。
      // ユーザーが前の小節で伴奏を刻んでいたら、コードは任せて自動の伴奏を黙らせる
      const energy = liveEnergy(settingsRef.current.energy, countTaps(engine));
      const userComping = engine.lastCompTapBar >= bar - 1;
      for (const event of accompaniment(current, { bar, energy, deferLastBass: true })) {
        if (userComping && event.part === "comp") continue;
        const start = at(event.startBeats);
        const duration = Math.max(0.04, at(event.startBeats + event.durationBeats) - start);
        if (event.part === "bass") {
          engine.bass.triggerAttackRelease(midi(event.pitches[0]!), duration, start, event.velocity);
        } else if (event.part === "comp") {
          engine.comp.triggerAttackRelease(event.pitches.map(midi), duration, start, event.velocity);
        } else {
          engine.ride.triggerAttackRelease(0.02, start, event.velocity);
        }
      }
      for (let i = 0; i < 4; i++) {
        draw.schedule(() => emit({ kind: "beat", beat: i }), time + i * beat);
      }

      const { voice } = settingsRef.current;
      const place = (beats: number, swing: boolean) => (swing ? at(beats) : time + beats * beat);
      const reachesBarEnd = (note: SoloNote) => note.startBeats + note.durationBeats >= BEATS_PER_BAR - BAR_END_MARGIN_BEATS;

      // 前の小節から鳴り続けている音を、この小節の入り方に合わせて処理する
      const held = engine.held;
      engine.held = null;
      const firstNote = solo?.notes[0];
      const tied = firstNote?.tie === true && held !== null;
      // スラー: 頭から新しい音が鳴るとき、近い音程なら前の音と少し重ねて、なめらかにつなぐ
      const slurred =
        held !== null && !tied && firstNote?.startBeats === 0 && Math.abs(firstNote.pitch - engine.heldPitch) <= SLUR_INTERVAL;
      if (held && !tied) {
        if (firstNote?.startBeats === 0) {
          held.releaseAt(time + (slurred ? 0.02 : 0), slurred ? 0.09 : 0.05);
        } else {
          // 余韻: この小節が遅れて入るとき、前の音を小節の頭で切らない。
          // このコードに合う音なら次の音が入るまで自然に消えていき、合わない音ならすぐ引っ込める
          const until = firstNote ? place(firstNote.startBeats, firstNote.swing) - time : beat * 2;
          held.releaseAt(time, fitsChord(engine.heldPitch, current) ? Math.min(until, beat * 1.5, 0.9) : 0.12);
        }
      }

      // ソロ
      let expressionSummary = "";
      let sustained = false;
      let retargetable = false;
      if (solo) {
        // 1音ごとの吹き方（しゃくり、音量の動き、ビブラート、フォール）をルールで決める
        const expressions = planExpression(solo.notes, { secondsPerBeat: beat });
        if (slurred) {
          // 前の音からなめらかにつなぐので、しゃくらず、やわらかく立ち上げる
          expressions[0] = { ...expressions[0]!, scoopSemitones: 0, scoopSeconds: 0, attackSeconds: 0.035 };
        }
        // 持ち越しの音は新しく発音しないので、表現の数には入れない
        const voiced = expressions.filter((_, index) => !solo.notes[index]!.tie);
        expressionSummary = [
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

        const schedule = (note: SoloNote, expression: NoteExpression) => {
          const start = place(note.startBeats, note.swing);
          const end = place(note.startBeats + note.durationBeats, note.swing);
          // 小節の終わりまで伸びる音は、切らずに保留する。次の小節へ持ち越すかどうかは、次の小節の頭で決める
          const open = reachesBarEnd(note);
          const durationSeconds = Math.max(0.04, (end - start) * (open ? 1 : 0.92));
          engine.soloFilter.frequency.setTargetAtTime(brightnessHz(note.velocity), start, 0.01);
          const heldNote = engine.solos[voice].play({
            pitch: note.pitch,
            time: start,
            duration: durationSeconds,
            velocity: note.velocity,
            expression,
            open,
          });
          if (heldNote) {
            engine.held = heldNote;
            engine.heldPitch = note.pitch;
          }
          draw.schedule(() => emit({ kind: "note", pitch: note.pitch, velocity: note.velocity, durationSeconds }), start);
        };

        const tail: NonNullable<Engine["tail"]> = { notes: [], expressions: [], schedule };
        solo.notes.forEach((note, index) => {
          if (note.tie) {
            // 持ち越しの音は新しく発音せず、鳴っている音をここまで伸ばす。鳴っている音が無ければ何もしない
            if (index === 0 && tied) held?.releaseAt(place(note.startBeats + note.durationBeats, note.swing));
          } else if (note.startBeats >= DEADLINE_BEATS) {
            // 締切より後に鳴る音は、次のコードが決まってから予約する
            tail.notes.push(note);
            tail.expressions.push(expressions[index]!);
          } else {
            schedule(note, expressions[index]!);
          }
        });
        engine.tail = tail.notes.length > 0 ? tail : null;

        const last = solo.notes.at(-1);
        sustained = last !== undefined && reachesBarEnd(last);
        // 最後の音が締切より後に鳴り始めるなら、次のコードに合う音へ寄せられる
        retargetable = sustained && last !== undefined && !last.tie && last.startBeats >= DEADLINE_BEATS;
        previous.pitch = solo.lastPitch;
        previous.memo = solo.memo;
      }

      void prepare(
        engine,
        next.map((candidate) => candidate.chord),
        previous.pitch,
        previous.memo,
        // この小節の最後の音が鳴り続けるなら、次の小節はそれを持ち越せる
        { sustained, retargetable },
      );

      // 画面は、音が実際に鳴るタイミングに合わせて更新する
      draw.schedule(() => {
        if (engineRef.current !== engine) return;
        setChord(current);
        setCandidates(next);
        setSelected(engine.selected);
        setLocked(false);
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
    [emit, prepare],
  );

  /**
   * コード選択の締切（4拍目の頭）で呼ばれる。次のコードを確定し、最後の1拍をそのコードへ向かわせる。
   * ユーザーがこの時点までに選んでいればそのコードへ、選んでいなければ既定の候補へ進む。
   */
  const onDeadline = useCallback((engine: Engine, time: number) => {
    const current = engine.history.at(-1);
    if (current === undefined) return;
    const options = nextChordCandidates(engine.history);
    const picked = options.find((candidate) => candidate.chord === engine.selected)?.chord;
    const target = picked ?? options[0]!.chord;
    engine.locked = { chord: target, byUser: picked !== undefined };
    // ここから先は選び直せない。鍵盤をすぐに押せなくする
    setSelected(picked ?? null);
    setLocked(true);

    // ソロ: 締切より後に鳴らす音を、ここで予約する。小節の終わりまで伸びる最後の音は、次のコードに合う音へ寄せる
    const tail = engine.tail;
    engine.tail = null;
    tail?.notes.forEach((note, index) => {
      const isLast = index === tail.notes.length - 1;
      const reachesBarEnd = note.startBeats + note.durationBeats >= BEATS_PER_BAR - BAR_END_MARGIN_BEATS;
      const pitch = isLast && reachesBarEnd ? aimPitch(note.pitch, current, target) : note.pitch;
      tail.schedule({ ...note, pitch }, tail.expressions[index]!);
    });

    // ベース: 次のコードのルートへ半音で寄る。静かなときは2分音符で弾いていて4拍目が無い
    if (liveEnergy(settingsRef.current.energy, engine.taps.length) === 1) return;
    const { tone } = engine;
    const beat = tone.Time("4n").toSeconds();
    engine.bass.triggerAttackRelease(
      tone.Frequency(bassApproach(current, target), "midi").toFrequency(),
      beat * 0.9,
      time,
      0.7,
    );
  }, []);

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
    setLocked(false);
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
        locked: null,
        tail: null,
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
      const previous = { pitch: SOLO_START_PITCH, memo: {} as SoloMemo };
      const transport = tone.getTransport();
      transport.bpm.value = settingsRef.current.bpm;
      transport.scheduleRepeat(
        (time) => {
          try {
            onBar(engine, time, previous);
          } catch (cause) {
            // 1小節の失敗でセッション全体が黙って止まらないよう、画面に出して次の小節へ進む
            console.error("小節の予約に失敗しました", cause);
            setError(cause instanceof Error ? cause.message : String(cause));
          }
        },
        "1m",
        0,
      );
      transport.scheduleRepeat(
        (time) => {
          try {
            onDeadline(engine, time);
          } catch (cause) {
            console.error("締切の処理に失敗しました", cause);
          }
        },
        "1m",
        `0:${DEADLINE_BEATS}:0`,
      );
      transport.start("+0.1");
      setStatus("playing");
    } catch (cause) {
      stop();
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [onBar, onDeadline, prepare, stop]);

  const choose = useCallback((candidate: string) => {
    const engine = engineRef.current;
    // 締切を過ぎたら、次のコードは確定している
    if (!engine || engine.locked !== null) return;
    engine.selected = candidate;
    setSelected(candidate);
    // 押した手応えとして、選んだコードを高い音域で短く鳴らす
    const { tone } = engine;
    engine.comp.triggerAttackRelease(
      compVoicing(candidate).map((pitch) => tone.Frequency(pitch + 12, "midi").toFrequency()),
      0.35,
      tone.immediate(),
      0.3,
    );
  }, []);

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

  const playTone = useCallback(
    (index: number) => {
      const engine = engineRef.current;
      const current = engine?.history.at(-1);
      if (!engine || current === undefined) return;
      const note = chordTones(current)[index];
      if (note === undefined) return;
      const { tone } = engine;
      emit({ kind: "jam", pitches: [JAM_TONE_BASE + pitchClassOf(note)] });
      engine.jam.triggerAttackRelease(
        tone.Frequency(JAM_TONE_BASE + pitchClassOf(note), "midi").toFrequency(),
        0.6,
        tone.immediate(),
        0.95,
      );
      recordTap(engine);
    },
    [emit, recordTap],
  );

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

  // 盛り上がりが変わったら（つまみを動かした、または叩き方が変わった）、次の小節のソロを作り直す。
  // 効くのを1小節早めるため
  useEffect(() => {
    const engine = engineRef.current;
    if (engine?.lastRequest && engine.bar > 0) {
      const { chords, previousPitch, memo, sustained, retargetable } = engine.lastRequest;
      void prepare(engine, chords, previousPitch, memo, { sustained, retargetable }, true);
    }
  }, [live, touch, prepare]);

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
      locked,
      choose,
      readyMs,
      clientName,
      error,
      log,
      subscribe,
      tap,
      playTone,
      tones: chord === null ? [] : chordTones(chord).slice(0, JAM_TONE_COUNT),
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
      locked,
      choose,
      readyMs,
      clientName,
      error,
      log,
      subscribe,
      tap,
      playTone,
      live,
      touch,
    ],
  );
}
