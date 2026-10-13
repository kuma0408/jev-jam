"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { NOTE_NAMES, chordTones, parseChord, pitchClassOf } from "../lib/music/chord.ts";
import { type ChordCandidate, nextChordCandidates } from "../lib/progression/candidates.ts";
import type { SoloRequest, SoloResponse } from "../lib/solo/api.ts";
import type { BarResult, Strategy } from "../lib/solo/generate.ts";
import { type SlotChoice, toNoteEvents } from "../lib/solo/phrase.ts";

const START_CHORD = "Cmaj7";
const SOLO_RANGE = { low: 60, high: 86 };
const LOG_LIMIT = 24;
const BLACK_KEYS = new Set(["Db", "Eb", "Gb", "Ab", "Bb"]);

type LogEntry = {
  bar: number;
  chord: string;
  /** ユーザーが選ばず、既定の候補に自動で進んだ */
  auto: boolean;
  /** ソロが小節の頭に間に合わなかった */
  missed: boolean;
  result: BarResult | null;
};

/** 再生中だけ存在する、音源と進行の状態。描画に関係しないのでrefで持つ */
type Engine = {
  tone: typeof import("tone");
  solo: import("tone").Synth;
  comp: import("tone").PolySynth;
  bass: import("tone").Synth;
  hat: import("tone").NoiseSynth;
  bar: number;
  chord: string;
  /** 次の小節の候補ごとの、用意できたソロ */
  prepared: Map<string, BarResult | null>;
  selected: string | null;
  previousPitch: number;
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
    throw new Error(`ソロの取得に失敗しました (${response.status})`);
  }
  return (await response.json()) as SoloResponse;
}

function formatChoices(choices: readonly SlotChoice[]): string {
  return choices.map((choice) => (choice === "rest" ? "." : choice === "hold" ? "-" : choice).padEnd(2)).join(" ");
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export default function Page() {
  const engineRef = useRef<Engine | null>(null);
  const [playing, setPlaying] = useState(false);
  const [starting, setStarting] = useState(false);
  const [bpm, setBpm] = useState(90);
  const [strategy, setStrategy] = useState<Strategy>("batch");
  const [chord, setChord] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<ChordCandidate[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [readyMs, setReadyMs] = useState<number | null>(null);
  const [clientName, setClientName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);

  // 再生ループから最新の設定を読むためのref
  const settingsRef = useRef({ bpm, strategy });
  settingsRef.current = { bpm, strategy };

  /** 次の小節で選べる候補すべての分のソロを、先に依頼しておく */
  const prepareNext = useCallback((engine: Engine, chords: string[], previousBar: SlotChoice[]) => {
    const token = ++engine.requestToken;
    const requestedAt = performance.now();
    engine.prepared = new Map();
    setReadyMs(null);
    return requestSolos({ chords, previousBar, ...settingsRef.current })
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
    (engine: Engine, time: number) => {
      const { tone } = engine;
      const options = engine.bar === 0 ? [] : nextChordCandidates(engine.chord);
      const auto = engine.bar > 0 && engine.selected === null;
      const current = engine.bar === 0 ? START_CHORD : (engine.selected ?? options[0]!.chord);
      const result = engine.prepared.get(current) ?? null;
      const bar = engine.bar + 1;

      // 伴奏: ベースがルート、その上に構成音
      const root = parseChord(current).root;
      const beat = tone.Time("4n").toSeconds();
      const slot = beat / 2;
      engine.bass.triggerAttackRelease(tone.Frequency(36 + root, "midi").toFrequency(), beat * 3.5, time, 0.6);
      engine.comp.triggerAttackRelease(
        chordTones(current).map((note) => tone.Frequency(48 + pitchClassOf(note), "midi").toFrequency()),
        beat * 3.8,
        time,
        0.25,
      );
      for (let i = 0; i < 4; i++) {
        engine.hat.triggerAttackRelease("32n", time + i * beat, i === 0 ? 0.25 : 0.12);
      }

      // ソロ
      if (result) {
        for (const event of toNoteEvents(result.choices, { previousPitch: engine.previousPitch, ...SOLO_RANGE })) {
          engine.solo.triggerAttackRelease(
            tone.Frequency(event.pitch, "midi").toFrequency(),
            event.lengthSlots * slot * 0.9,
            time + event.startSlot * slot,
            0.8,
          );
          engine.previousPitch = event.pitch;
        }
      }

      engine.bar = bar;
      engine.chord = current;
      engine.selected = null;
      const next = nextChordCandidates(current);
      void prepareNext(
        engine,
        next.map((candidate) => candidate.chord),
        result?.choices ?? [],
      );

      // 画面は、音が実際に鳴るタイミングに合わせて更新する
      tone.getDraw().schedule(() => {
        if (engineRef.current !== engine) return;
        setChord(current);
        setCandidates(next);
        setSelected(engine.selected);
        setLog((entries) => [{ bar, chord: current, auto, missed: result === null, result }, ...entries].slice(0, LOG_LIMIT));
      }, time);
    },
    [prepareNext],
  );

  const stop = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engineRef.current = null;
    const transport = engine.tone.getTransport();
    transport.stop();
    transport.cancel();
    engine.comp.releaseAll();
    for (const synth of [engine.solo, engine.comp, engine.bass, engine.hat]) {
      synth.dispose();
    }
    setPlaying(false);
    setCandidates([]);
    setSelected(null);
    setReadyMs(null);
  }, []);

  const start = useCallback(async () => {
    setStarting(true);
    setError(null);
    try {
      // Tone.jsはブラウザでしか動かないので、開始時に読み込む
      const tone = await import("tone");
      await tone.start();

      const engine: Engine = {
        tone,
        solo: new tone.Synth({
          oscillator: { type: "triangle" },
          envelope: { attack: 0.01, decay: 0.15, sustain: 0.5, release: 0.2 },
        }).toDestination(),
        comp: new tone.PolySynth(tone.Synth, {
          oscillator: { type: "sine" },
          envelope: { attack: 0.05, decay: 0.3, sustain: 0.6, release: 0.6 },
        }).toDestination(),
        bass: new tone.Synth({
          oscillator: { type: "sine" },
          envelope: { attack: 0.02, decay: 0.2, sustain: 0.7, release: 0.3 },
        }).toDestination(),
        hat: new tone.NoiseSynth({ envelope: { attack: 0.001, decay: 0.04, sustain: 0 } }).toDestination(),
        bar: 0,
        chord: START_CHORD,
        prepared: new Map(),
        selected: null,
        previousPitch: 72,
        requestToken: 0,
      };
      engine.hat.volume.value = -14;
      engineRef.current = engine;

      // 最初の小節のソロを取ってから始める
      await prepareNext(engine, [START_CHORD], []);
      if (engineRef.current !== engine) return;

      setLog([]);
      const transport = tone.getTransport();
      transport.bpm.value = settingsRef.current.bpm;
      transport.scheduleRepeat((time) => onBar(engine, time), "1m", 0);
      transport.start("+0.1");
      setPlaying(true);
    } catch (cause) {
      stop();
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setStarting(false);
    }
  }, [onBar, prepareNext, stop]);

  const choose = useCallback((candidate: string) => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.selected = candidate;
    setSelected(candidate);
  }, []);

  // テンポの変更は再生中にも反映する
  useEffect(() => {
    const engine = engineRef.current;
    if (engine) {
      engine.tone.getTransport().bpm.value = bpm;
    }
  }, [bpm]);

  // 数字キーで候補を選べるようにする
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
      const candidate = candidates[Number(event.key) - 1];
      if (candidate) {
        choose(candidate.chord);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [candidates, choose]);

  useEffect(() => stop, [stop]);

  const byRoot = new Map(candidates.map((candidate, index) => [parseChord(candidate.chord).root, { candidate, index }]));
  const nextChord = selected ?? candidates[0]?.chord ?? null;

  return (
    <main>
      <h1>Jev Session（確認用）</h1>

      <div className="controls">
        <button type="button" className="primary" onClick={playing ? stop : start} disabled={starting}>
          {starting ? "準備中…" : playing ? "停止" : "開始"}
        </button>
        <label>
          テンポ
          <input
            type="range"
            min={60}
            max={140}
            step={2}
            value={bpm}
            onChange={(event) => setBpm(Number(event.target.value))}
          />
          <output>{bpm} BPM</output>
        </label>
        <label>
          Jevへの聞き方
          <select value={strategy} onChange={(event) => setStrategy(event.target.value as Strategy)}>
            <option value="batch">一括（1回で8音）</option>
            <option value="two-stage">2段階（方針→8音）</option>
          </select>
        </label>
      </div>

      <div className="now">
        <div className="now-chord" aria-live="polite" aria-label={chord ? `現在のコード ${chord}` : "停止中"}>
          {chord ?? "—"}
        </div>
        <div className="status">
          次の小節: <strong>{nextChord ?? "—"}</strong>
          {nextChord && selected === null ? "（未選択なら自動）" : ""}
        </div>
        <div className="status">
          次のソロの準備: <strong>{!playing ? "—" : readyMs === null ? "依頼中…" : `完了（${Math.round(readyMs)}ms）`}</strong>
        </div>
        <div className="status">
          接続先: <strong>{clientName === null ? "—" : clientName === "jev" ? "Jev" : "ダミー（キー未設定）"}</strong>
        </div>
      </div>
      {error && (
        <p className="warning" role="alert">
          {error}
        </p>
      )}

      <h2 id="keyboard-heading">次のコードを選ぶ</h2>
      <div className="keyboard" role="group" aria-labelledby="keyboard-heading">
        {NOTE_NAMES.map((note, pitchClass) => {
          const entry = byRoot.get(pitchClass);
          const isSelected = entry !== undefined && nextChord === entry.candidate.chord;
          return (
            <button
              key={note}
              type="button"
              className={`key ${BLACK_KEYS.has(note) ? "black" : "white"}`}
              disabled={!entry}
              aria-pressed={entry ? isSelected : undefined}
              aria-label={
                entry
                  ? `${entry.candidate.chord}、冒険度${entry.candidate.adventure}、${entry.candidate.reason}`
                  : `${note}（選択不可）`
              }
              title={entry?.candidate.reason}
              onClick={() => entry && choose(entry.candidate.chord)}
            >
              {entry && (
                <>
                  <span className="tag">[{entry.index + 1}]</span>
                  <span className="chord">{entry.candidate.chord}</span>
                  <span className="tag">{"★".repeat(entry.candidate.adventure)}</span>
                </>
              )}
              <span>{note}</span>
            </button>
          );
        })}
      </div>
      <p className="hint">
        光っている鍵が次に進めるコードです。★が多いほど冒険的な進行です。数字キーでも選べます。小節の終わりまでに選ばなければ[1]に進みます。
      </p>

      <h2 id="log-heading">小節ごとの記録（新しい順）</h2>
      <div className="table-wrap">
        <table aria-labelledby="log-heading">
          <thead>
            <tr>
              <th scope="col">小節</th>
              <th scope="col">コード</th>
              <th scope="col">選び方</th>
              <th scope="col">ソロ（. 休符 / - 伸ばす）</th>
              <th scope="col">Jevの応答</th>
              <th scope="col">最上位</th>
              <th scope="col">休符</th>
              <th scope="col">伸ばす</th>
              <th scope="col">方針</th>
            </tr>
          </thead>
          <tbody>
            {log.map((entry) => (
              <tr key={entry.bar}>
                <td>{entry.bar}</td>
                <td>{entry.chord}</td>
                <td>{entry.bar === 1 ? "開始" : entry.auto ? "自動" : "選択"}</td>
                {entry.result ? (
                  <>
                    <td className="notes">{formatChoices(entry.result.choices)}</td>
                    <td>
                      {Math.round(entry.result.latencyMs)}ms（{entry.result.calls}回）
                    </td>
                    <td>{percent(entry.result.stats.top)}</td>
                    <td>{percent(entry.result.stats.rest)}</td>
                    <td>{percent(entry.result.stats.hold)}</td>
                    <td>{entry.result.plan ? Object.values(entry.result.plan).join(", ") : "—"}</td>
                  </>
                ) : (
                  <td colSpan={6} className="warning">
                    ソロが間に合いませんでした（伴奏のみ）
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
