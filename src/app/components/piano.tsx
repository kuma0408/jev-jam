"use client";

// 次のコードを選ぶ鍵盤。1オクターブぶんの鍵の上に、そのルートから始まる候補を1〜2個並べる。
import type { CSSProperties } from "react";
import { NOTE_NAMES, parseChord } from "../../lib/music/chord.ts";
import type { Session } from "../session/use-session.ts";
import { BarTimer } from "./bar-timer.tsx";

type Candidate = Session["candidates"][number];
type Adventure = Candidate["adventure"];

/** 白鍵は左から何番目か、黒鍵は何番目の白鍵の右肩に乗るか */
const LAYOUT: readonly { black: boolean; slot: number }[] = [
  { black: false, slot: 1 },
  { black: true, slot: 1 },
  { black: false, slot: 2 },
  { black: true, slot: 2 },
  { black: false, slot: 3 },
  { black: false, slot: 4 },
  { black: true, slot: 4 },
  { black: false, slot: 5 },
  { black: true, slot: 5 },
  { black: false, slot: 6 },
  { black: true, slot: 6 },
  { black: false, slot: 7 },
];

export const ADVENTURE_LABELS: Record<Adventure, string> = { 1: "定番", 2: "ひねり", 3: "大胆" };

/** 冒険度の印。色だけに頼らないよう、形（丸・ひし形・三角）と個数でも区別する */
export function AdventureMark({ level }: { level: Adventure }) {
  const shapes = Array.from({ length: level }, (_, index) => index);
  return (
    <svg className="adventure-mark" data-adventure={level} viewBox={`0 0 ${level * 12} 12`} width={level * 12} height={12} aria-hidden="true">
      {shapes.map((index) => {
        const x = index * 12;
        if (level === 1) return <circle key={index} cx={x + 6} cy={6} r={4.5} />;
        if (level === 2) return <path key={index} d={`M${x + 6} 0.5 L${x + 11.5} 6 L${x + 6} 11.5 L${x + 0.5} 6 Z`} />;
        return <path key={index} d={`M${x + 6} 1 L${x + 11.5} 11 L${x + 0.5} 11 Z`} />;
      })}
    </svg>
  );
}

type Props = Pick<Session, "candidates" | "nextChord" | "chosenByUser" | "locked" | "choose" | "subscribe"> & {
  /** いま鳴っているコード。停止中は null */
  currentChord: string | null;
  bpm: number;
  playing: boolean;
};

export function Piano({
  candidates,
  nextChord,
  chosenByUser,
  locked,
  choose,
  subscribe,
  currentChord,
  bpm,
  playing,
}: Props) {
  const currentRoot = currentChord === null ? null : parseChord(currentChord).root;

  return (
    // 4拍目に入ると次のコードが確定する。確定後は、進む先だけを残して鍵盤全体を沈める
    <div className="piano" data-locked={locked}>
      <div className="piano-rail">
        <span className="piano-rail-label" aria-live="off">
          {locked && nextChord ? `つぎは ${nextChord}` : "3拍目のうちに選ぶ"}
        </span>
        <BarTimer subscribe={subscribe} bpm={bpm} active={playing} />
      </div>
      <div className="piano-keys">
        {NOTE_NAMES.map((note, pitchClass) => {
          const { black, slot } = LAYOUT[pitchClass]!;
          // 同じルートに複数のコードが並ぶことがある（例: Am7 と A7）
          const options = candidates
            .map((candidate, index) => ({ candidate, index }))
            .filter(({ candidate }) => parseChord(candidate.chord).root === pitchClass);
          const next = options.find(({ candidate }) => candidate.chord === nextChord);
          const isCurrent = currentRoot === pitchClass;
          return (
            <div
              key={note}
              className={`piano-note ${black ? "is-black" : "is-white"}`}
              style={{ "--slot": slot } as CSSProperties}
              data-open={options.length > 0}
              data-next={next ? next.candidate.adventure : undefined}
            >
              <div className="piano-options">
                {options.map(({ candidate, index }) => {
                  const isNext = candidate.chord === nextChord;
                  const state = !isNext ? "open" : chosenByUser ? "chosen" : "auto";
                  return (
                    <button
                      key={candidate.chord}
                      type="button"
                      className="chip"
                      data-adventure={candidate.adventure}
                      data-state={state}
                      aria-pressed={isNext}
                      // 確定後は選び直せない。進む先のコードは、読み上げで分かるよう押せる見た目のまま残す
                      disabled={locked && !isNext}
                      aria-label={`${candidate.chord}、${ADVENTURE_LABELS[candidate.adventure]}${index === 0 ? "、既定" : ""}、${candidate.reason}`}
                      aria-keyshortcuts={String(index + 1)}
                      title={candidate.reason}
                      onClick={() => choose(candidate.chord)}
                    >
                      <span className="chip-number">{index + 1}</span>
                      <span className="chip-chord">{candidate.chord}</span>
                      <span className="chip-meta">
                        <AdventureMark level={candidate.adventure} />
                        <span className="chip-level">{ADVENTURE_LABELS[candidate.adventure]}</span>
                      </span>
                      {state !== "open" && <span className="chip-flag">{state === "chosen" ? "✓ 選択" : "自動"}</span>}
                    </button>
                  );
                })}
              </div>
              <span className="piano-name" data-current={isCurrent}>
                {note}
                {isCurrent && <span className="visually-hidden">（いまのコードのルート）</span>}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
