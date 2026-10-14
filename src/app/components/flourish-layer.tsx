"use client";

// 画面全体に重ねる、エフェクトの層。押すたびに図形や線が弾け、進行が移るときは色の幕が横切る。
// クリックは下の演奏面へ通す（pointer-events: none）。音に頼らない表示ではなく飾りなので、読み上げからは隠す。
import { useEffect, useRef } from "react";
import { flourishOnRelease, flourishScale, pickFlourish } from "../../lib/visual/flourish.ts";
import type { Session, SessionEvent } from "../session/use-session.ts";
import { type Effect, drawEffect, isFinished } from "../visual/flourishes.ts";
import { lastPress } from "../visual/pointer.ts";
import { currentTheme } from "../visual/theme-store.ts";

/** 押した位置の通知が、これより前のものなら使わない（キーボードで弾いたとき）。ミリ秒 */
const PRESS_FRESH_MS = 200;
/** 同時に描くエフェクトの上限。連打しても重くならないようにする */
const MAX_EFFECTS = 24;
/** Jevの音のまたたきは、この割合の音にだけ出す（全部に出すとうるさい） */
const SPARK_CHANCE = 0.35;

export function FlourishLayer({ subscribe }: Pick<Session, "subscribe">) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let effects: Effect[] = [];
    let frame = 0;
    let width = 0;
    let height = 0;
    let presses = 0;
    let holdStartedAt: number | null = null;
    let holdAt = { x: 0, y: 0, height: 0.5 };

    const now = () => performance.now() / 1000;

    const draw = () => {
      const at = now();
      effects = effects.filter((effect) => !isFinished(effect, at));
      context.clearRect(0, 0, width, height);
      const view = { context, width, height, theme: currentTheme(), reducedMotion: motionQuery.matches };
      for (const effect of effects) drawEffect(view, effect, at);
    };
    const tick = () => {
      draw();
      frame = effects.length > 0 ? requestAnimationFrame(tick) : 0;
    };
    const add = (effect: Omit<Effect, "start" | "seed">) => {
      effects.push({ ...effect, start: now(), seed: Math.random() });
      if (effects.length > MAX_EFFECTS) effects.shift();
      if (frame === 0) frame = requestAnimationFrame(tick);
    };

    /** 演奏面の中で、音の高さに応じた位置。キーボードで弾いたときや、Jevの音に使う */
    const placeOfPitch = (pitch: number) => {
      const rect = document.querySelector(".score-surface")?.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (pitch - 40) / 48));
      if (!rect) return { x: width * 0.7, y: height * (1 - ratio), height: ratio };
      return { x: rect.left + rect.width * 0.84, y: rect.top + rect.height * (1 - ratio), height: ratio };
    };

    const onEvent = (event: SessionEvent) => {
      if (event.kind === "jam") {
        const fresh = performance.now() - lastPress.at < PRESS_FRESH_MS;
        const place = fresh ? lastPress : placeOfPitch(Math.max(...event.pitches));
        add({ kind: pickFlourish(presses++), x: place.x, y: place.y, scale: flourishScale(place.height) });
        holdStartedAt = event.held ? now() : null;
        holdAt = { x: place.x, y: place.y, height: place.height };
      } else if (event.kind === "lift") {
        // 長く押さえて離したら、地をその色に染める
        const release = holdStartedAt === null ? null : flourishOnRelease(now() - holdStartedAt);
        if (release) add({ kind: release, x: holdAt.x, y: holdAt.y, scale: flourishScale(holdAt.height) });
        holdStartedAt = null;
      } else if (event.kind === "bar" && event.section) {
        add({ kind: "wipe", x: 0, y: 0, scale: 1 });
      } else if (event.kind === "note" && Math.random() < SPARK_CHANCE) {
        const place = placeOfPitch(event.pitch);
        add({ kind: "spark", x: place.x - Math.random() * 60, y: place.y, scale: 0.6 + event.velocity * 0.6 });
      }
    };

    const resize = () => {
      // 高精細な画面でもぼけないようにする。描画の負荷を抑えるため2倍まで
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      draw();
    };
    resize();
    window.addEventListener("resize", resize);
    const unsubscribe = subscribe(onEvent);
    return () => {
      unsubscribe();
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(frame);
    };
  }, [subscribe]);

  return <canvas ref={canvasRef} className="flourish-layer" aria-hidden="true" />;
}
