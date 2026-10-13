"use client";

import { useEffect } from "react";
import { SOLO_INSTRUMENTS, SOLO_VOICES, type SoloVoice } from "../lib/audio/instruments.ts";
import { NOTE_NAMES, parseChord } from "../lib/music/chord.ts";
import type { SoloStrategy } from "../lib/solo/api.ts";
import { BPM_MAX, BPM_MIN, SOLO_DB_MAX, SOLO_DB_MIN, useSession } from "./session/use-session.ts";

const BLACK_KEYS = new Set(["Db", "Eb", "Gb", "Ab", "Bb"]);

const STRATEGY_LABELS: Record<SoloStrategy, string> = {
  cells: "フレーズの型から選ぶ",
  batch: "1音ずつ（1回で8音）",
  "two-stage": "1音ずつ（方針→8音）",
};

const HOW_LABELS = { start: "開始", auto: "自動", chosen: "選択" } as const;

export default function Page() {
  const session = useSession();
  const { status, settings, candidates, nextChord, choose } = session;
  const playing = status === "playing";

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

  return (
    <main>
      <h1>Jev Session（確認用）</h1>

      <div className="controls">
        <button
          type="button"
          className="primary"
          onClick={playing ? session.stop : session.start}
          disabled={status === "starting"}
        >
          {status === "starting" ? "準備中…" : playing ? "停止" : "開始"}
        </button>
        <label>
          テンポ
          <input
            type="range"
            min={BPM_MIN}
            max={BPM_MAX}
            step={2}
            value={settings.bpm}
            onChange={(event) => session.updateSettings({ bpm: Number(event.target.value) })}
          />
          <output>{settings.bpm} BPM</output>
        </label>
        <label>
          ソロの楽器
          <select
            value={settings.voice}
            onChange={(event) => session.updateSettings({ voice: event.target.value as SoloVoice })}
          >
            {SOLO_VOICES.map((voice) => (
              <option key={voice} value={voice}>
                {SOLO_INSTRUMENTS[voice].label}
              </option>
            ))}
          </select>
        </label>
        <label>
          ソロの音量
          <input
            type="range"
            min={SOLO_DB_MIN}
            max={SOLO_DB_MAX}
            step={1}
            value={settings.soloDb}
            onChange={(event) => session.updateSettings({ soloDb: Number(event.target.value) })}
          />
          <output>{settings.soloDb} dB</output>
        </label>
        <label>
          ソロの作り方
          <select
            value={settings.strategy}
            onChange={(event) => session.updateSettings({ strategy: event.target.value as SoloStrategy })}
          >
            {(Object.keys(STRATEGY_LABELS) as SoloStrategy[]).map((strategy) => (
              <option key={strategy} value={strategy}>
                {STRATEGY_LABELS[strategy]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="now">
        <div
          className="now-chord"
          aria-live="polite"
          aria-label={session.chord ? `現在のコード ${session.chord}` : "停止中"}
        >
          {session.chord ?? "—"}
        </div>
        <div className="status">
          次の小節: <strong>{nextChord ?? "—"}</strong>
          {nextChord && !session.chosenByUser ? "（未選択なら自動）" : ""}
        </div>
        <div className="status">
          次のソロの準備:{" "}
          <strong>
            {!playing ? "—" : session.readyMs === null ? "依頼中…" : `完了（${Math.round(session.readyMs)}ms）`}
          </strong>
        </div>
        <div className="status">
          接続先:{" "}
          <strong>
            {session.clientName === null ? "—" : session.clientName === "jev" ? "Jev" : "ダミー（キー未設定）"}
          </strong>
        </div>
      </div>
      {session.error && (
        <p className="warning" role="alert">
          {session.error}
        </p>
      )}

      <h2 id="keyboard-heading">次のコードを選ぶ</h2>
      <div className="keyboard" role="group" aria-labelledby="keyboard-heading">
        {NOTE_NAMES.map((note, pitchClass) => {
          // 同じルートに複数のコードが並ぶことがある（例: Am7 と A7）
          const options = candidates
            .map((candidate, index) => ({ candidate, index }))
            .filter(({ candidate }) => parseChord(candidate.chord).root === pitchClass);
          return (
            <div
              key={note}
              className={`key ${BLACK_KEYS.has(note) ? "black" : "white"}`}
              data-empty={options.length === 0}
            >
              {options.map(({ candidate, index }) => (
                <button
                  key={candidate.chord}
                  type="button"
                  className="key-option"
                  aria-pressed={nextChord === candidate.chord}
                  aria-label={`${candidate.chord}、冒険度${candidate.adventure}、${candidate.reason}`}
                  title={candidate.reason}
                  onClick={() => choose(candidate.chord)}
                >
                  <span className="tag">[{index + 1}]</span>
                  <span className="chord">{candidate.chord}</span>
                  <span className="tag">{"★".repeat(candidate.adventure)}</span>
                </button>
              ))}
              <span className="key-name">{note}</span>
            </div>
          );
        })}
      </div>
      <p className="hint">
        次に進めるコードが鍵の上に出ます。★が多いほど冒険的な進行です。数字キーでも選べます。小節の終わりまでに選ばなければ[1]に進みます。
      </p>

      <h2 id="log-heading">小節ごとの記録（新しい順）</h2>
      <div className="table-wrap">
        <table aria-labelledby="log-heading">
          <thead>
            <tr>
              <th scope="col">小節</th>
              <th scope="col">コード</th>
              <th scope="col">選び方</th>
              <th scope="col">ソロ</th>
              <th scope="col">Jevの応答</th>
              <th scope="col">補足</th>
            </tr>
          </thead>
          <tbody>
            {session.log.map((entry) => (
              <tr key={entry.bar}>
                <td>{entry.bar}</td>
                <td>{entry.chord}</td>
                <td>{HOW_LABELS[entry.how]}</td>
                {entry.solo ? (
                  <>
                    <td className="notes">{entry.solo.summary}</td>
                    <td>
                      {Math.round(entry.solo.latencyMs)}ms（{entry.solo.calls}回）
                    </td>
                    <td>{entry.solo.details}</td>
                  </>
                ) : (
                  <td colSpan={3} className="warning">
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
