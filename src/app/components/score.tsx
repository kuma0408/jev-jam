"use client";

// 五線譜。このアプリの演奏はすべてここで行う。
// 叩いた位置（線と間）の高さで和音が鳴り、その音符が五線に書き込まれて、右から左へ流れていく。
// Jevのソロも同じ五線に流れるので、一緒に1枚の楽譜を書いているように見える。
import { useEffect, useRef } from "react";
import { stepOf } from "../../lib/music/staff.ts";
import { ENERGY, type Energy } from "../../lib/solo/energy.ts";
import type { Session, SessionEvent, SessionStatus } from "../session/use-session.ts";

/** 叩いて弾ける位置の範囲（真ん中のドを0とした段）。ド（C4）から2オクターブ上のド（C6）まで */
export const TAP_STEP_LOW = 0;
export const TAP_STEP_HIGH = 14;
/** 画面に描く位置の範囲。Jevのソロが五線の外に出ても描けるよう、上下に余裕を持たせる */
const VIEW_STEP_LOW = -5;
const VIEW_STEP_HIGH = 17;
/** ト音記号の五線の5本の線の位置（ミ・ソ・シ・レ・ファ） */
const STAFF_LINES = [2, 4, 6, 8, 10];

/** 画面に収める時間の幅（秒）。狭い画面では短くして、音符が詰まりすぎないようにする */
const WINDOW_SECONDS = 8;
const MIN_WINDOW_SECONDS = 3.5;
/** 1秒ぶんに使う幅の目安（px）。これより狭くなる画面では、収める時間を短くする */
const PIXELS_PER_SECOND = 110;
/** 「いま」の線を、左から何割の位置に置くか */
const NOW_POSITION = 0.84;
/** 1段の高さの上限を、幅の何分の1にするか。狭い画面で音符が大きくなりすぎないようにする */
const WIDTH_PER_HALF_GAP = 32;
/** これより長く伸ばす音は、白抜きの音符（2分音符のような形）にする（拍） */
const HOLLOW_BEATS = 1.5;

const COLORS = {
  line: "#7b7890",
  ink: "#17132e",
  you: "#2a62f2",
  label: "#55516b",
  now: "#cf2e25",
  cursor: "#2a62f2",
};

type Mark =
  /** lead は、あなたの和音のいちばん上の音（叩いた位置の音）か。下に重ねた音は小さく薄く描く */
  | { kind: "note"; at: number; pitch: number; beats: number; by: "jev" | "you"; strength: number; lead: boolean }
  | { kind: "bar"; at: number; chord: string };

type Props = Pick<Session, "subscribe"> & {
  status: SessionStatus;
  bpm: number;
  energy: Energy;
  /** キーボード（スペース）で叩くときの位置。上下キーで動かす */
  keyboardStep: number;
  onStart: () => void;
  onTap: (step: number) => void;
};

export function Score({ subscribe, status, bpm, energy, keyboardStep, onStart, onTap }: Props) {
  const playing = status === "playing";
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // 描画のループから最新の値を読むための ref
  const bpmRef = useRef(bpm);
  bpmRef.current = bpm;
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
    let frame = 0;
    let width = 0;
    let height = 0;

    /** 1段（線と間の半分）の高さ。狭い画面では幅に合わせて小さくし、五線を縦の真ん中に置く */
    const halfGap = () => Math.min(height / (VIEW_STEP_HIGH - VIEW_STEP_LOW + 2), width / WIDTH_PER_HALF_GAP);
    const yOf = (step: number) => {
      const half = halfGap();
      const top = (height - half * (VIEW_STEP_HIGH - VIEW_STEP_LOW + 2)) / 2;
      return top + (VIEW_STEP_HIGH + 1 - step) * half;
    };
    /** 左端のト音記号の欄の幅。音符はここに隠れて消えていく */
    const clefWidth = () => halfGap() * 5;

    /** 五線の外の音に、短い加線を引く */
    const ledgers = (x: number, step: number, half: number) => {
      context.fillStyle = COLORS.line;
      const lines = step <= 0 ? range(step % 2 === 0 ? step : step + 1, 0) : step >= 12 ? range(12, step % 2 === 0 ? step : step - 1) : [];
      for (const line of lines) context.fillRect(x - half * 1.9, yOf(line) - 0.5, half * 3.8, 1);
    };

    const noteHead = (x: number, step: number, half: number, color: string, hollow: boolean, scale = 1) => {
      context.save();
      context.translate(x, yOf(step));
      context.rotate(-0.35);
      context.beginPath();
      context.ellipse(0, 0, half * 1.2 * scale, half * 0.82 * scale, 0, 0, Math.PI * 2);
      if (hollow) {
        context.lineWidth = Math.max(1.5, half * 0.35);
        context.strokeStyle = color;
        context.stroke();
      } else {
        context.fillStyle = color;
        context.fill();
      }
      context.restore();
    };

    const draw = () => {
      const now = performance.now() / 1000;
      marks = marks.filter((mark) => now - mark.at < WINDOW_SECONDS + 2);
      const half = halfGap();
      const CLEF_WIDTH = clefWidth();
      const seconds = Math.max(MIN_WINDOW_SECONDS, Math.min(WINDOW_SECONDS, width / PIXELS_PER_SECOND));
      const pixelsPerSecond = ((width - CLEF_WIDTH) * NOW_POSITION) / seconds;
      const nowX = CLEF_WIDTH + (width - CLEF_WIDTH) * NOW_POSITION;
      const xAt = (at: number) => nowX - (now - at) * pixelsPerSecond;

      context.clearRect(0, 0, width, height);

      // 五線
      context.fillStyle = COLORS.line;
      for (const line of STAFF_LINES) context.fillRect(8, yOf(line) - 0.5, width - 16, 1);

      // 小節線とコード名。コード名は楽譜のコードネームのように五線の上に書く
      context.font = `800 ${Math.round(half * 2.2)}px ${displayFont}, "Helvetica Neue", Arial, sans-serif`;
      context.textBaseline = "alphabetic";
      for (const mark of marks) {
        if (mark.kind !== "bar") continue;
        const x = xAt(mark.at);
        if (x < CLEF_WIDTH) continue;
        context.fillStyle = COLORS.ink;
        context.fillRect(x, yOf(10), 1.5, yOf(2) - yOf(10));
        context.fillStyle = COLORS.label;
        context.fillText(mark.chord, x + 6, yOf(VIEW_STEP_HIGH - 1));
      }

      // 音符。Jevの音は黒い音符に棒を付け、あなたの音は青い音符を重ねて和音として書く
      for (const mark of marks) {
        if (mark.kind !== "note") continue;
        const x = xAt(mark.at);
        if (x < CLEF_WIDTH) continue;
        const { step, accidental } = stepOf(mark.pitch);
        if (step < VIEW_STEP_LOW || step > VIEW_STEP_HIGH) continue;
        const color = mark.by === "jev" ? COLORS.ink : COLORS.you;
        const fade = Math.min(1, (x - CLEF_WIDTH) / 40);
        context.globalAlpha = (mark.lead ? 0.45 + 0.55 * mark.strength : 0.3) * fade;
        if (mark.lead) ledgers(x, step, half);
        noteHead(x, step, half, color, mark.beats >= HOLLOW_BEATS, mark.lead ? 1 : 0.6);
        if (accidental && mark.lead) {
          context.fillStyle = color;
          context.font = `${Math.round(half * 3)}px ${musicFont}, serif`;
          context.textBaseline = "middle";
          context.fillText("♭", x - half * 3.4, yOf(step) - half * 0.4);
        }
        if (mark.by === "jev") {
          // 棒は、五線の真ん中より下の音なら上向き、上の音なら下向きに付ける
          context.fillStyle = color;
          const up = step < 6;
          const stemX = up ? x + half * 1.15 : x - half * 1.15;
          context.fillRect(stemX - 0.75, up ? yOf(step + 7) : yOf(step), 1.5, half * 7);
        }
      }
      context.globalAlpha = 1;

      // ト音記号。左端に置く。流れてきた音符は、この手前で薄くなって消える
      context.fillStyle = COLORS.ink;
      context.font = `${Math.round(half * 8.6)}px ${musicFont}, serif`;
      context.textBaseline = "alphabetic";
      context.fillText("𝄞", half * 0.6, yOf(-0.6));

      // いま
      context.fillStyle = COLORS.now;
      context.globalAlpha = 0.5;
      context.fillRect(nowX, yOf(12), 1.5, yOf(0) - yOf(12));
      context.globalAlpha = 1;

      // スペースキーで叩く位置の印
      const cursor = cursorRef.current;
      if (cursor !== null) {
        context.strokeStyle = COLORS.cursor;
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
      const secondsPerBeat = 60 / bpmRef.current;
      if (event.kind === "note") {
        marks.push({
          kind: "note",
          at,
          pitch: event.pitch,
          beats: event.durationSeconds / secondsPerBeat,
          by: "jev",
          strength: event.velocity,
          lead: true,
        });
      } else if (event.kind === "jam") {
        const top = Math.max(...event.pitches);
        for (const pitch of event.pitches) {
          marks.push({ kind: "note", at, pitch, beats: 0.5, by: "you", strength: 1, lead: pitch === top });
        }
      } else if (event.kind === "bar") {
        marks.push({ kind: "bar", at, chord: event.chord });
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

  // キーボードの位置を動かしたら、印を描き直す
  useEffect(() => {
    redrawRef.current();
  }, [keyboardStep, playing]);

  return (
    <section className="score" aria-label="五線譜。叩いて演奏する">
      <button
        type="button"
        className="score-surface"
        aria-label={
          playing
            ? "五線を叩いて和音を鳴らす。上の方ほど高い音になります（スペースキーで叩き、上下キーで高さを変えられます）"
            : "五線を叩いて、セッションをはじめる"
        }
        aria-describedby="score-status"
        disabled={status === "starting"}
        // 押した瞬間に鳴らしたいので、離したときではなく押したときに反応させる
        onPointerDown={(event) => {
          event.preventDefault();
          if (!playing) {
            onStart();
            return;
          }
          const rect = event.currentTarget.getBoundingClientRect();
          const rows = VIEW_STEP_HIGH - VIEW_STEP_LOW + 2;
          const halfGap = Math.min(rect.height / rows, rect.width / WIDTH_PER_HALF_GAP);
          const top = (rect.height - halfGap * rows) / 2;
          const step = Math.round(VIEW_STEP_HIGH + 1 - (event.clientY - rect.top - top) / halfGap);
          onTap(Math.min(TAP_STEP_HIGH, Math.max(TAP_STEP_LOW, step)));
        }}
        // スペースとエンターは、ページ全体のキー操作（page.tsx）で扱う
        onKeyDown={(event) => {
          if (event.key === " " || event.key === "Enter") event.preventDefault();
        }}
      >
        <canvas ref={canvasRef} className="score-canvas" aria-hidden="true" />
        {!playing && <span className="score-start">{status === "starting" ? "じゅんび中…" : "五線を叩いて、はじめる"}</span>}
      </button>
      <div className="score-foot">
        <ul className="score-legend">
          <li>
            <span className="score-swatch" data-by="you" aria-hidden="true" />
            あなたの和音
          </li>
          <li>
            <span className="score-swatch" data-by="jev" aria-hidden="true" />
            Jevのソロ
          </li>
        </ul>
        <p id="score-status" className="score-status" role="status">
          {playing
            ? `盛り上がり「${ENERGY[energy].label}」。上の方を叩くと高い和音、下の方だと低い和音。たくさん叩くほど盛り上がります。`
            : "叩くと、バンドとJevのソロが始まります。"}
        </p>
      </div>
    </section>
  );
}

/** from から to まで、2つおき（線の位置だけ）の数 */
function range(from: number, to: number): number[] {
  const values: number[] = [];
  for (let value = from; value <= to; value += 2) values.push(value);
  return values;
}
