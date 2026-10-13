"use client";

// 小節の残り時間を、4つの拍のマスが順に埋まっていく形で見せる。
// 拍の通知を直接購読して要素を動かすので、拍ごとにReactの再描画は起きない。
import { useEffect, useRef } from "react";
import type { Session } from "../session/use-session.ts";

const BEATS = [0, 1, 2, 3] as const;

type Props = {
  subscribe: Session["subscribe"];
  bpm: number;
  /** 再生中か。止まったらマスを空に戻す */
  active: boolean;
};

export function BarTimer({ subscribe, bpm, active }: Props) {
  const fillsRef = useRef<(HTMLSpanElement | null)[]>([]);
  // 購読をやり直さずに最新のテンポを読むためのref
  const bpmRef = useRef(bpm);
  bpmRef.current = bpm;

  useEffect(() => {
    const fills = fillsRef.current;
    const clear = () => {
      for (const fill of fills) {
        for (const animation of fill?.getAnimations() ?? []) animation.cancel();
        if (fill) fill.style.transform = "scaleX(0)";
      }
    };
    if (!active) {
      clear();
      return;
    }

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const unsubscribe = subscribe((event) => {
      if (event.kind !== "beat") return;
      const beatMs = 60000 / bpmRef.current;
      fills.forEach((fill, index) => {
        if (!fill) return;
        for (const animation of fill.getAnimations()) animation.cancel();
        if (index !== event.beat || motionQuery.matches) {
          // 動きを減らす設定では、拍ごとに1マスずつ埋める
          fill.style.transform = index <= event.beat && (index < event.beat || motionQuery.matches) ? "scaleX(1)" : "scaleX(0)";
          return;
        }
        fill.style.transform = "scaleX(1)";
        fill.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], { duration: beatMs, easing: "linear" });
      });
    });
    return () => {
      unsubscribe();
      clear();
    };
  }, [active, subscribe]);

  // 残り時間は視覚的な補助。読み上げでは毎拍の通知がかえって邪魔になるので隠す
  return (
    <div className="bar-timer" aria-hidden="true">
      {BEATS.map((beat) => (
        <span key={beat} className="bar-timer-beat">
          <span
            className="bar-timer-fill"
            ref={(element) => {
              fillsRef.current[beat] = element;
            }}
          />
        </span>
      ))}
    </div>
  );
}
