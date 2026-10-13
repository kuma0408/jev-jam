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
  bassPitch,
} from "../../lib/audio/instruments.ts";
import { chordTones, parseChord, pitchClassOf } from "../../lib/music/chord.ts";
import { type ChordCandidate, nextChordCandidates } from "../../lib/progression/candidates.ts";
import type { SoloBar, SoloMemo, SoloRequest, SoloResponse, SoloStrategy } from "../../lib/solo/api.ts";
import { swingBeats, swingRatioFor } from "../../lib/solo/swing.ts";

const START_CHORD = "Cmaj7";
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
};

/** 音が実際に鳴るタイミングで届く通知。背景の演出などに使う */
export type SessionEvent =
  | { kind: "bar"; bar: number; chord: string }
  /** beat は小節内の拍（0〜3） */
  | { kind: "beat"; beat: number }
  /** ソロの1音。velocity は強さ（0〜1） */
  | { kind: "note"; pitch: number; velocity: number; durationSeconds: number };

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
};

/** 再生中だけ存在する、音源と進行の状態。描画に関係しないのでrefで持つ */
type Engine = {
  tone: typeof import("tone");
  /** ソロの音源。再生中に切り替えられるよう、すべて読み込んでおく */
  solos: Record<SoloVoice, import("tone").Sampler>;
  /** ソロ全体の音量 */
  soloVolume: import("tone").Volume;
  /** 強く吹いた音ほど明るくするためのフィルター */
  soloFilter: import("tone").Filter;
  reverb: import("tone").Reverb;
  comp: import("tone").Sampler;
  bass: import("tone").Sampler;
  hat: import("tone").NoiseSynth;
  bar: number;
  /** これまでに鳴らしたコード（古い順） */
  history: string[];
  /** 次の小節の候補ごとの、用意できたソロ */
  prepared: Map<string, SoloBar | null>;
  selected: string | null;
  /** 古い応答を捨てるための通し番号 */
  requestToken: number;
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
    bpm: 120,
    strategy: "cells",
    voice: "sax-recorded",
    soloDb: 0,
  });
  const [chord, setChord] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<ChordCandidate[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [readyMs, setReadyMs] = useState<number | null>(null);
  const [clientName, setClientName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<BarLog[]>([]);

  // 再生ループから最新の設定を読むためのref
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

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
  const prepare = useCallback((engine: Engine, chords: string[], previousPitch: number, memo: SoloMemo) => {
    const token = ++engine.requestToken;
    const requestedAt = performance.now();
    engine.prepared = new Map();
    setReadyMs(null);
    const { bpm, strategy, voice } = settingsRef.current;
    return requestSolos({ chords, strategy, bpm, previousPitch, range: SOLO_INSTRUMENTS[voice].range, memo })
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
  }, []);

  /** 小節の頭ごとに呼ばれ、その小節の音を予約して次の小節の準備を始める */
  const onBar = useCallback(
    (engine: Engine, time: number, previous: { pitch: number; memo: SoloMemo }) => {
      const { tone } = engine;
      const first = engine.bar === 0;
      const options = first ? [] : nextChordCandidates(engine.history);
      const current = first ? START_CHORD : (engine.selected ?? options[0]!.chord);
      const how: BarLog["how"] = first ? "start" : engine.selected === null ? "auto" : "chosen";
      const solo = engine.prepared.get(current) ?? null;
      const bar = engine.bar + 1;
      const draw = tone.getDraw();

      // 伴奏: ベースがルート、その上に構成音
      const root = parseChord(current).root;
      const beat = tone.Time("4n").toSeconds();
      engine.bass.triggerAttackRelease(tone.Frequency(bassPitch(root), "midi").toFrequency(), beat * 3.5, time, 0.8);
      engine.comp.triggerAttackRelease(
        chordTones(current).map((note) => tone.Frequency(48 + pitchClassOf(note), "midi").toFrequency()),
        beat * 3.8,
        time,
        0.45,
      );
      for (let i = 0; i < 4; i++) {
        engine.hat.triggerAttackRelease("32n", time + i * beat, i === 0 ? 0.25 : 0.12);
        draw.schedule(() => emit({ kind: "beat", beat: i }), time + i * beat);
      }

      // ソロ
      if (solo) {
        const { voice, bpm } = settingsRef.current;
        const ratio = swingRatioFor(bpm);
        const place = (beats: number, swing: boolean) => (swing ? swingBeats(beats, ratio) : beats);
        for (const note of solo.notes) {
          const start = time + place(note.startBeats, note.swing) * beat;
          const end = time + place(note.startBeats + note.durationBeats, note.swing) * beat;
          const durationSeconds = Math.max(0.04, (end - start) * 0.92);
          engine.soloFilter.frequency.setTargetAtTime(brightnessHz(note.velocity), start, 0.01);
          engine.solos[voice].triggerAttackRelease(
            tone.Frequency(note.pitch, "midi").toFrequency(),
            durationSeconds,
            start,
            note.velocity,
          );
          draw.schedule(() => emit({ kind: "note", pitch: note.pitch, velocity: note.velocity, durationSeconds }), start);
        }
        previous.pitch = solo.lastPitch;
        previous.memo = solo.memo;
      }

      engine.bar = bar;
      engine.history.push(current);
      engine.selected = null;
      const next = nextChordCandidates(engine.history);
      void prepare(
        engine,
        next.map((candidate) => candidate.chord),
        previous.pitch,
        previous.memo,
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
              solo: solo && { summary: solo.summary, details: solo.details, latencyMs: solo.latencyMs, calls: solo.calls },
            },
            ...entries,
          ].slice(0, LOG_LIMIT),
        );
        emit({ kind: "bar", bar, chord: current });
      }, time);
    },
    [emit, prepare],
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
      engine.soloVolume,
      engine.soloFilter,
      engine.reverb,
      engine.comp,
      engine.bass,
      engine.hat,
    ]) {
      node.dispose();
    }
    setStatus("idle");
    setChord(null);
    setCandidates([]);
    setSelected(null);
    setReadyMs(null);
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
      const solos = Object.fromEntries(
        SOLO_VOICES.map((voice) => {
          const instrument = SOLO_INSTRUMENTS[voice];
          const sampler = new tone.Sampler({ urls: instrument.samples, release: 0.25 }).connect(soloVolume);
          sampler.volume.value = instrument.gainDb;
          return [voice, sampler];
        }),
      ) as Engine["solos"];
      const engine: Engine = {
        tone,
        solos,
        soloVolume,
        soloFilter,
        reverb,
        comp: new tone.Sampler({ urls: COMP_SAMPLES, release: 0.6 }).connect(reverb),
        bass: new tone.Sampler({ urls: BASS_SAMPLES, release: 0.3 }).toDestination(),
        hat: new tone.NoiseSynth({ envelope: { attack: 0.001, decay: 0.04, sustain: 0 } }).toDestination(),
        bar: 0,
        history: [],
        prepared: new Map(),
        selected: null,
        requestToken: 0,
      };
      engine.hat.volume.value = -18;
      engine.comp.volume.value = COMP_GAIN_DB;
      engine.bass.volume.value = BASS_GAIN_DB;
      engineRef.current = engine;

      // 音源ファイルと残響の準備、最初の小節のソロの取得が終わってから始める
      await Promise.all([tone.loaded(), reverb.ready, prepare(engine, [START_CHORD], SOLO_START_PITCH, {})]);
      if (engineRef.current !== engine) return;

      setLog([]);
      const previous = { pitch: SOLO_START_PITCH, memo: {} as SoloMemo };
      const transport = tone.getTransport();
      transport.bpm.value = settingsRef.current.bpm;
      transport.scheduleRepeat((time) => onBar(engine, time, previous), "1m", 0);
      transport.start("+0.1");
      setStatus("playing");
    } catch (cause) {
      stop();
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [onBar, prepare, stop]);

  const choose = useCallback((candidate: string) => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.selected = candidate;
    setSelected(candidate);
  }, []);

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
      readyMs,
      clientName,
      error,
      log,
      subscribe,
    }),
    [status, start, stop, settings, updateSettings, chord, candidates, selected, choose, readyMs, clientName, error, log, subscribe],
  );
}
