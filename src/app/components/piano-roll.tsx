"use client";

// ソロの音と、自分で鳴らした音を、右から左へ流れる帯として並べて見せる。
// 自分の音がJevの音と同じ場所に並ぶことで、一緒に演奏していることが目で分かるようにする。
import { useEffect, useRef } from "react";
import type { Session, SessionEvent } from "../session/use-session.ts";

/** 画面に収める時間の幅（秒） */
const WINDOW_SECONDS = 7;
/** 「いま」の線を、左から何割の位置に置くか。右側は、鳴り始めた音の残りの長さが見える */
const NOW_POSITION = 0.8;
/** 表示する音の高さの範囲（MIDIノート番号） */
const PITCH_LOW = 46;
const PITCH_HIGH = 88;
const NOTE_HEIGHT = 5;
/** 自分で鳴らした音の、帯の長さ（秒）。押した長さは分からないので一定にする */
const JAM_SECONDS = 0.28;

const COLORS = { solo: "#17132e", jam: "#2a62f2", grid: "#dcdae6", label: "#55516b", now: "#cf2e25" };

type Mark =
  | { kind: "note"; at: number; pitch: number; seconds: number; by: "solo" | "jam"; strength: number }
  | { kind: "bar"; at: number; chord: string }
  | { kind: "beat"; at: number };

export function PianoRoll({ subscribe, playing }: Pick<Session, "subscribe"> & { playing: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let marks: Mark[] = [];
    let frame = 0;
    let width = 0;
    let height = 0;

    const draw = () => {
      const now = performance.now() / 1000;
      // 画面の左へ流れ去ったものは捨てる
      marks = marks.filter((mark) => now - mark.at < WINDOW_SECONDS + 3);
      const pixelsPerSecond = (width * NOW_POSITION) / WINDOW_SECONDS;
      const nowX = width * NOW_POSITION;
      const xAt = (at: number) => nowX - (now - at) * pixelsPerSecond;
      const yOf = (pitch: number) =>
        height - 14 - ((Math.min(PITCH_HIGH, Math.max(PITCH_LOW, pitch)) - PITCH_LOW) / (PITCH_HIGH - PITCH_LOW)) * (height - 34);

      context.clearRect(0, 0, width, height);
      context.font = '700 12px "Helvetica Neue", Arial, sans-serif';
      context.textBaseline = "top";

      for (const mark of marks) {
        const x = xAt(mark.at);
        if (mark.kind === "beat") {
          context.fillStyle = COLORS.grid;
          context.fillRect(x, 18, 1, height - 18);
        } else if (mark.kind === "bar") {
          // 小節の頭とコードが変わったところに、線とコード名を出す
          context.fillStyle = COLORS.label;
          context.fillRect(x, 0, 1.5, height);
          context.fillText(mark.chord, x + 5, 2);
        }
      }
      for (const mark of marks) {
        if (mark.kind !== "note") continue;
        const x = xAt(mark.at);
        const length = Math.max(4, mark.seconds * pixelsPerSecond - 2);
        context.globalAlpha = 0.45 + 0.55 * mark.strength;
        context.fillStyle = COLORS[mark.by];
        context.beginPath();
        context.roundRect(x, yOf(mark.pitch) - NOTE_HEIGHT / 2, length, NOTE_HEIGHT, NOTE_HEIGHT / 2);
        context.fill();
      }
      context.globalAlpha = 1;
      context.fillStyle = COLORS.now;
      context.fillRect(nowX, 0, 1.5, height);
    };

    const tick = () => {
      draw();
      // 流れるものが無くなったら止める
      frame = marks.length > 0 && !motionQuery.matches ? requestAnimationFrame(tick) : 0;
    };
    const wake = () => {
      if (motionQuery.matches) {
        draw();
      } else if (frame === 0) {
        frame = requestAnimationFrame(tick);
      }
    };

    const onEvent = (event: SessionEvent) => {
      const at = performance.now() / 1000;
      if (event.kind === "note") {
        marks.push({ kind: "note", at, pitch: event.pitch, seconds: event.durationSeconds, by: "solo", strength: event.velocity });
      } else if (event.kind === "jam") {
        for (const pitch of event.pitches) {
          marks.push({ kind: "note", at, pitch, seconds: JAM_SECONDS, by: "jam", strength: 1 });
        }
      } else if (event.kind === "bar") {
        marks.push({ kind: "bar", at, chord: event.chord });
      } else {
        marks.push({ kind: "beat", at });
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
    const unsubscribe = subscribe(onEvent);
    return () => {
      unsubscribe();
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [subscribe]);

  return (
    <section className="roll" aria-label="演奏の流れ">
      <div className="roll-head">
        <ul className="roll-legend">
          <li>
            <span className="roll-swatch" data-by="solo" aria-hidden="true" />
            Jevのソロ
          </li>
          <li>
            <span className="roll-swatch" data-by="jam" aria-hidden="true" />
            あなたの音
          </li>
        </ul>
        <span className="roll-hint">{playing ? "右の赤い線が「いま」です" : "開始すると、音が右から左へ流れます"}</span>
      </div>
      {/* 音の流れは飾りではなく演奏の記録だが、同じ内容を文字で読み上げる手段は「小節ごとの記録」にある */}
      <canvas ref={canvasRef} className="roll-canvas" aria-hidden="true" />
    </section>
  );
}
