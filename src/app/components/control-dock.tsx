"use client";

// テンポやソロの楽器など、演奏の設定をまとめた操作パネル。
import { SOLO_INSTRUMENTS, SOLO_VOICES, type SoloVoice } from "../../lib/audio/instruments.ts";
import type { Decider, SoloStrategy } from "../../lib/solo/api.ts";
import { BPM_MAX, BPM_MIN, SOLO_DB_MAX, SOLO_DB_MIN, type Session } from "../session/use-session.ts";

const STRATEGY_LABELS: Record<SoloStrategy, string> = {
  cells: "リズムと動きを選ぶ",
  batch: "1音ずつ（1回で8音）",
  "two-stage": "1音ずつ（方針→8音）",
};

const DECIDER_LABELS: Record<Decider, string> = {
  jev: "Jev",
  rules: "ルール（Jevを呼ばない）",
};

export function ControlDock({ settings, updateSettings }: Pick<Session, "settings" | "updateSettings">) {
  return (
    <section className="dock" aria-label="演奏の設定">
      <label className="field">
        <span className="field-head">
          <span className="field-label">テンポ</span>
          <output className="field-value">{settings.bpm} BPM</output>
        </span>
        <input
          type="range"
          min={BPM_MIN}
          max={BPM_MAX}
          step={2}
          value={settings.bpm}
          onChange={(event) => updateSettings({ bpm: Number(event.target.value) })}
        />
      </label>
      <label className="field">
        <span className="field-head">
          <span className="field-label">ソロの音量</span>
          <output className="field-value">
            {settings.soloDb > 0 ? "+" : ""}
            {settings.soloDb} dB
          </output>
        </span>
        <input
          type="range"
          min={SOLO_DB_MIN}
          max={SOLO_DB_MAX}
          step={1}
          value={settings.soloDb}
          onChange={(event) => updateSettings({ soloDb: Number(event.target.value) })}
        />
      </label>
      <label className="field">
        <span className="field-head">
          <span className="field-label">息の音</span>
          <output className="field-value">{Math.round(settings.breath * 100)}%</output>
        </span>
        {/* 管楽器の音に重ねる息づかい。録音だけでは機械っぽく聞こえるのを和らげる */}
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={settings.breath}
          onChange={(event) => updateSettings({ breath: Number(event.target.value) })}
        />
      </label>
      <label className="field">
        <span className="field-label">ソロの楽器</span>
        <select value={settings.voice} onChange={(event) => updateSettings({ voice: event.target.value as SoloVoice })}>
          {SOLO_VOICES.map((voice) => (
            <option key={voice} value={voice}>
              {SOLO_INSTRUMENTS[voice].label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="field-label">判断する人</span>
        {/* Jevとルールで、ソロがどう変わるかを聴き比べる。ルールはJevを呼ばないので課金されない */}
        <select value={settings.decider} onChange={(event) => updateSettings({ decider: event.target.value as Decider })}>
          {(Object.keys(DECIDER_LABELS) as Decider[]).map((decider) => (
            <option key={decider} value={decider}>
              {DECIDER_LABELS[decider]}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="field-label">ソロの作り方</span>
        <select
          value={settings.strategy}
          onChange={(event) => updateSettings({ strategy: event.target.value as SoloStrategy })}
        >
          {(Object.keys(STRATEGY_LABELS) as SoloStrategy[]).map((strategy) => (
            <option key={strategy} value={strategy}>
              {STRATEGY_LABELS[strategy]}
            </option>
          ))}
        </select>
      </label>
      <label className="field field-check">
        <input type="checkbox" checked={settings.trade} onChange={(event) => updateSettings({ trade: event.target.checked })} />
        <span>
          <span className="field-label">掛け合い</span>
          <span className="field-note">Jevとあなたが2小節ずつ交代で弾く。外すと、Jevがずっとソロを取る</span>
        </span>
      </label>
    </section>
  );
}
