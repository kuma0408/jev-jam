"use client";

// 演奏する面。このアプリの演奏はすべてここで行う。
// 押した位置の高さで和音が鳴り、離すまで伸びる。その様子とJevのソロが、右から左へ流れていく。
import { useEffect, useRef } from "react";
import { ENERGY, type Energy } from "../../lib/solo/energy.ts";
import type { Session, SessionEvent, SessionStatus } from "../session/use-session.ts";
import { type Frame, type Mark, type YouMark, drawScore } from "./score-draw.ts";

/**
 * 押して弾ける位置の範囲（真ん中のドを0とした段）。1オクターブ下のド（C3）から2オクターブ上のド（C6）まで。
 * 最初は真ん中のドからにしていたが、「低い音も弾きたい」と言われて広げた
 */
export const TAP_STEP_LOW = -7;
export const TAP_STEP_HIGH = 14;
/** 画面に描く位置の範囲。Jevのソロが五線の外に出ても描けるよう、上下に余裕を持たせる */
// トロンボーンの低い音（ド、C3）まで描けるよう、下に余裕を取る
const VIEW_STEP_LOW = -8;
const VIEW_STEP_HIGH = 17;
const ROWS = VIEW_STEP_HIGH - VIEW_STEP_LOW + 2;

/** 画面に収める時間の幅（秒）。狭い画面では短くして、詰まりすぎないようにする */
const WINDOW_SECONDS = 8;
const MIN_WINDOW_SECONDS = 3.5;
/** 1秒ぶんに使う幅の目安（px）。これより狭くなる画面では、収める時間を短くする */
const PIXELS_PER_SECOND = 110;
/** 「いま」の線を、左から何割の位置に置くか */
const NOW_POSITION = 0.84;
/** 1段の高さの上限を、幅の何分の1にするか。狭い画面で記号が大きくなりすぎないようにする */
const WIDTH_PER_HALF_GAP = 32;
/** 押さえずに鳴らした音（コードの札など）を描く長さ（秒） */
const SHORT_SECONDS = 0.3;

/** 押した位置の縦の位置から、段を求める。描くときと同じ寸法で計算する */
function geometry(width: number, height: number) {
  const half = Math.min(height / ROWS, width / WIDTH_PER_HALF_GAP);
  const top = (height - half * ROWS) / 2;
  return { half, yOf: (step: number) => top + (VIEW_STEP_HIGH + 1 - step) * half, stepAt: (y: number) => Math.round(VIEW_STEP_HIGH + 1 - (y - top) / half) };
}

type Props = Pick<Session, "subscribe"> & {
  status: SessionStatus;
  energy: Energy;
  /** キーボード（スペース）で押すときの位置。上下キーで動かす */
  keyboardStep: number;
  onStart: () => void;
  onPress: (step: number) => void;
  onRelease: () => void;
};

export function Score({ subscribe, status, energy, keyboardStep, onStart, onPress, onRelease }: Props) {
  const playing = status === "playing";
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // 描画のループから最新の値を読むための ref
  const cursorRef = useRef<number | null>(null);
  cursorRef.current = playing ? keyboardStep : null;
  const redrawRef = useRef<() => void>(() => {});

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    // canvas の文字は CSS の変数を読めないので、書体の名前をここで取り出す
    const rootStyle = getComputedStyle(document.documentElement);
    const musicFont = rootStyle.getPropertyValue("--font-music").trim() || "serif";
    const displayFont = rootStyle.getPropertyValue("--font-display").trim() || "sans-serif";
    let marks: Mark[] = [];
    /** いま押さえている和音。離したときに終わりの時刻を入れる */
    let holding: YouMark | null = null;
    let frame = 0;
    let width = 0;
    let height = 0;

    const draw = () => {
      const now = performance.now() / 1000;
      const { half, yOf } = geometry(width, height);
      const leftEdge = half * 5;
      const seconds = Math.max(MIN_WINDOW_SECONDS, Math.min(WINDOW_SECONDS, width / PIXELS_PER_SECOND));
      const nowX = leftEdge + (width - leftEdge) * NOW_POSITION;
      const pixelsPerSecond = (nowX - leftEdge) / seconds;
      // 画面の左へ流れ去ったものは捨てる（押さえている和音は残す）
      marks = marks.filter((mark) => {
        const last = mark.kind === "you" ? (mark.end ?? now) : mark.kind === "jev" ? mark.start + mark.seconds : mark.at;
        return now - last < seconds + 2;
      });
      const view: Frame = {
        context,
        width,
        height,
        now,
        nowX,
        leftEdge,
        half,
        xAt: (time) => nowX - (now - time) * pixelsPerSecond,
        yOf,
        musicFont,
        displayFont,
        reducedMotion: motionQuery.matches,
      };
      context.clearRect(0, 0, width, height);
      drawScore(view, marks);

      // スペースキーで押す位置の印
      const cursor = cursorRef.current;
      if (cursor !== null) {
        context.strokeStyle = "#2a62f2";
        context.lineWidth = 2;
        context.beginPath();
        context.ellipse(nowX, yOf(cursor), half * 1.6, half * 1.2, 0, 0, Math.PI * 2);
        context.stroke();
      }
    };
    redrawRef.current = draw;

    const tick = () => {
      draw();
      frame = marks.length > 0 && !motionQuery.matches ? requestAnimationFrame(tick) : 0;
    };
    const wake = () => {
      if (motionQuery.matches) draw();
      else if (frame === 0) frame = requestAnimationFrame(tick);
    };

    const onEvent = (event: SessionEvent) => {
      const at = performance.now() / 1000;
      if (event.kind === "note") {
        marks.push({ kind: "jev", start: at, seconds: event.durationSeconds, pitch: event.pitch, strength: event.velocity });
      } else if (event.kind === "jam") {
        if (holding) holding.end = at;
        const mark: YouMark = { kind: "you", start: at, end: event.held ? null : at + SHORT_SECONDS, pitches: event.pitches };
        holding = event.held ? mark : null;
        marks.push(mark);
      } else if (event.kind === "lift") {
        if (holding) holding.end = at;
        holding = null;
      } else if (event.kind === "bar") {
        marks.push({ kind: "bar", at, chord: event.chord, ...(event.section ? { section: event.section } : {}) });
      } else {
        return;
      }
      wake();
    };

    const resize = () => {
      // 高精細な画面でもぼけないようにする。描画の負荷を抑えるため2倍まで
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      draw();
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    // 楽譜記号の書体を読み込んでから描き直す（読み込み前はト音記号が出ない）
    document.fonts.load(`40px ${musicFont}`, "𝄞").then(draw, draw);
    const unsubscribe = subscribe(onEvent);
    return () => {
      unsubscribe();
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [subscribe]);

  // キーボードの位置を変えたら、描き直す
  useEffect(() => {
    redrawRef.current();
  }, [keyboardStep, playing]);

  return (
    <section className="score" aria-label="演奏する面。押して和音を鳴らす">
      <button
        type="button"
        className="score-surface"
        aria-label={
          playing
            ? "押して和音を鳴らす。押している間は伸び、上の方ほど高い音になります（スペースキーで押し、上下キーで高さを変えられます）"
            : "押して、セッションをはじめる"
        }
        aria-describedby="score-status"
        disabled={status === "starting"}
        // 押した瞬間に鳴らし、離すまで伸ばす
        onPointerDown={(event) => {
          event.preventDefault();
          if (!playing) {
            onStart();
            return;
          }
          // 押したまま面の外へ指が出ても、離したことが届くようにする
          event.currentTarget.setPointerCapture(event.pointerId);
          const rect = event.currentTarget.getBoundingClientRect();
          const step = geometry(rect.width, rect.height).stepAt(event.clientY - rect.top);
          onPress(Math.min(TAP_STEP_HIGH, Math.max(TAP_STEP_LOW, step)));
        }}
        onPointerUp={onRelease}
        onPointerCancel={onRelease}
        // 押さえている途中で、ほかの窓へ移るなどして指の追跡が外れたときも、音を止める
        onLostPointerCapture={onRelease}
        // スペースとエンターは、ページ全体のキー操作（page.tsx）で扱う
        onKeyDown={(event) => {
          if (event.key === " " || event.key === "Enter") event.preventDefault();
        }}
      >
        <canvas ref={canvasRef} className="score-canvas" aria-hidden="true" />
        {!playing && <span className="score-start">{status === "starting" ? "じゅんび中…" : "押して、はじめる"}</span>}
      </button>
      <div className="score-foot">
        <p id="score-status" className="score-status" role="status">
          {playing
            ? `盛り上がり「${ENERGY[energy].label}」。上の方ほど高い和音。長く押さえるとしっとり、連打すると激しくなります。`
            : "押すと、バンドとJevのソロが始まります。"}
        </p>
      </div>
    </section>
  );
}
