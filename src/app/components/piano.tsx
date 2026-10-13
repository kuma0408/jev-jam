"use client";

// 次のコードを選ぶ鍵盤。1オクターブぶんの鍵の上に、そのルートから始まる候補を1〜2個並べる。
import { type CSSProperties, useEffect, useState } from "react";
import { NOTE_NAMES, chordTones, parseChord, pitchClassOf } from "../../lib/music/chord.ts";
import { fitsChord } from "../../lib/solo/aim.ts";
import type { Session } from "../session/use-session.ts";
import { BarTimer } from "./bar-timer.tsx";

/** 自分で鳴らした鍵を光らせておく長さ（ミリ秒） */
const HIT_FLASH_MS = 220;

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

/**
 * 鍵盤の12音を弾く、パソコンのキー（物理的な位置）。左から C, C#, D … B。
 * 音楽ソフトでよくある並びで、白鍵が A S D F G H J、黒鍵がその上の段の W E T Y U
 */
export const NOTE_KEY_CODES = ["KeyA", "KeyW", "KeyS", "KeyE", "KeyD", "KeyF", "KeyT", "KeyG", "KeyY", "KeyH", "KeyU", "KeyJ"] as const;

type Props = Pick<
  Session,
  "candidates" | "nextChord" | "chosenByUser" | "choose" | "releaseChord" | "subscribe" | "noteOn" | "noteOff"
> & {
  /** いま鳴っているコード。停止中は null */
  currentChord: string | null;
  bpm: number;
  playing: boolean;
  /** 鍵に、その音を弾くパソコンのキーを書くか。合う音だけの鍵盤を使っている間は、キーがそちらに割り当たるので書かない */
  showNoteKeys: boolean;
};

/** いまのコードに対する、その鍵の音の立ち位置。押せば、どれもそのままの音で鳴る */
type Fit = "chord" | "scale" | "outside";

const FIT_LABELS: Record<Fit, string> = { chord: "コードの音", scale: "合う音", outside: "コードの外の音" };

export function Piano({
  candidates,
  nextChord,
  chosenByUser,
  choose,
  releaseChord,
  subscribe,
  noteOn,
  noteOff,
  currentChord,
  bpm,
  playing,
  showNoteKeys,
}: Props) {
  const currentRoot = currentChord === null ? null : parseChord(currentChord).root;
  const chordClasses = currentChord === null ? [] : chordTones(currentChord).map(pitchClassOf);

  // 自分で鳴らした音の鍵を、短く光らせる
  const [hits, setHits] = useState<ReadonlySet<number>>(new Set());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = subscribe((event) => {
      if (event.kind !== "jam") return;
      setHits(new Set(event.pitches.map((pitch) => pitch % 12)));
      clearTimeout(timer);
      timer = setTimeout(() => setHits(new Set()), HIT_FLASH_MS);
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [subscribe]);

  return (
    <div className="piano">
      <div className="piano-rail">
        <span className="piano-rail-label">コードも音も、いつでも弾ける</span>
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
          const fit: Fit =
            currentChord === null || chordClasses.includes(pitchClass)
              ? "chord"
              : fitsChord(pitchClass, currentChord)
                ? "scale"
                : "outside";
          const keyLabel = NOTE_KEY_CODES[pitchClass]!.slice(3);
          return (
            <div
              key={note}
              className={`piano-note ${black ? "is-black" : "is-white"}`}
              style={{ "--slot": slot } as CSSProperties}
              data-open={options.length > 0}
              data-next={next ? next.candidate.adventure : undefined}
              data-hit={hits.has(pitchClass)}
              // 鍵そのものを押しても鳴る。コードの札（下のボタン）を押したときは、札の操作を優先する
              onPointerDown={(event) => {
                if (!playing || (event.target as HTMLElement).closest(".chip")) return;
                event.preventDefault();
                noteOn(pitchClass);
              }}
              onPointerUp={() => noteOff(pitchClass)}
              onPointerLeave={() => noteOff(pitchClass)}
              onPointerCancel={() => noteOff(pitchClass)}
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
                      aria-label={`${candidate.chord}、${ADVENTURE_LABELS[candidate.adventure]}${index === 0 ? "、既定" : ""}、${candidate.reason}`}
                      aria-keyshortcuts={String(index + 1)}
                      title={candidate.reason}
                      // 鍵盤として弾く: 押した瞬間に鳴り、離すと止まる。クリック（押して離す）を待たない
                      onPointerDown={(event) => {
                        event.preventDefault();
                        choose(candidate.chord);
                      }}
                      onPointerUp={releaseChord}
                      onPointerLeave={releaseChord}
                      onPointerCancel={releaseChord}
                      onKeyDown={(event) => {
                        if ((event.key === "Enter" || event.key === " ") && !event.repeat) {
                          event.preventDefault();
                          choose(candidate.chord);
                        }
                      }}
                      onKeyUp={(event) => {
                        if (event.key === "Enter" || event.key === " ") releaseChord();
                      }}
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
              {/* この鍵を弾くパソコンのキー。いまのコードに合う音かどうかを、塗り・枠・破線で示す（押せばどれも鳴る） */}
              <button
                type="button"
                className="piano-jam"
                data-fit={fit}
                disabled={!playing}
                aria-label={`${note} の音を弾く（${showNoteKeys ? `${keyLabel}キー、` : ""}${FIT_LABELS[fit]}）`}
                onKeyDown={(event) => {
                  if ((event.key === "Enter" || event.key === " ") && !event.repeat) {
                    event.preventDefault();
                    noteOn(pitchClass);
                  }
                }}
                onKeyUp={(event) => {
                  if (event.key === "Enter" || event.key === " ") noteOff(pitchClass);
                }}
              >
                {showNoteKeys ? keyLabel : ""}
              </button>
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
