"use client";

// 合う音だけの鍵盤。いまのコードに合う音だけを左から低い順に並べるので、どれを叩いても外れない。
// 弾けない人でも、「いつ叩くか」と「右へ行くか左へ行くか」だけで旋律を作れるようにする。
import { type CSSProperties, useEffect, useState } from "react";
import { NOTE_NAMES } from "../../lib/music/chord.ts";
import { PAD_COUNT, padPitches } from "../../lib/music/pads.ts";
import { PAD_LOW, type Session } from "../session/use-session.ts";

/** 合う音だけの鍵盤を弾く、パソコンのキー（物理的な位置）。左から順に低い音 */
export const PAD_KEY_CODES = ["KeyA", "KeyS", "KeyD", "KeyF", "KeyG", "KeyH", "KeyJ", "KeyK"] as const;

/** 自分で鳴らした鍵を光らせておく長さ（ミリ秒） */
const HIT_FLASH_MS = 220;

type Props = Pick<Session, "padOn" | "padOff" | "subscribe"> & {
  /** いま鳴っているコード。停止中は null */
  currentChord: string | null;
  playing: boolean;
};

export function MelodyPads({ padOn, padOff, subscribe, currentChord, playing }: Props) {
  const pitches = currentChord === null ? null : padPitches(currentChord, PAD_LOW);

  // 鳴らした音の鍵を、短く光らせる
  const [hit, setHit] = useState<number | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = subscribe((event) => {
      if (event.kind !== "jam" || event.pitches.length !== 1) return;
      setHit(event.pitches[0]!);
      clearTimeout(timer);
      timer = setTimeout(() => setHit(null), HIT_FLASH_MS);
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [subscribe]);

  return (
    <div className="pads" role="group" aria-label="合う音だけの鍵盤。左ほど低く、右ほど高い">
      {Array.from({ length: PAD_COUNT }, (_, slot) => {
        const pitch = pitches?.[slot];
        const note = pitch === undefined ? "—" : NOTE_NAMES[pitch % 12]!;
        const keyLabel = PAD_KEY_CODES[slot]!.slice(3);
        return (
          <button
            key={slot}
            type="button"
            className="pad"
            // 右ほど背を高くして、音の高さを形でも示す
            style={{ "--step": slot } as CSSProperties}
            data-hit={pitch !== undefined && pitch === hit}
            disabled={!playing}
            aria-label={`${note} の音を弾く（${keyLabel}キー、左から${slot + 1}番目）`}
            // 押した瞬間に鳴り、離すと止まる
            onPointerDown={(event) => {
              event.preventDefault();
              padOn(slot);
            }}
            onPointerUp={() => padOff(slot)}
            onPointerLeave={() => padOff(slot)}
            onPointerCancel={() => padOff(slot)}
            onKeyDown={(event) => {
              if ((event.key === "Enter" || event.key === " ") && !event.repeat) {
                event.preventDefault();
                padOn(slot);
              }
            }}
            onKeyUp={(event) => {
              if (event.key === "Enter" || event.key === " ") padOff(slot);
            }}
          >
            <span className="pad-note">{note}</span>
            <kbd className="jam-kbd">{keyLabel}</kbd>
          </button>
        );
      })}
    </div>
  );
}
