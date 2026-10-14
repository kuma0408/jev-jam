// 押したときなどに画面に出すエフェクトの描き方。どれも経過の割合 t（0〜1）を受け取り、その瞬間の姿を描く。
// patatap（https://patatap.com/）のエッセンスを借りた: 押すたびに、平たい色の図形が画面いっぱいに弾ける。
import type { Flourish, ReleaseFlourish } from "../../lib/visual/flourish.ts";
import { type Hsl, type Theme, css } from "../../lib/visual/palette.ts";

/** 画面に出すエフェクトの種類。押したとき・離したときのものに、進行が移るときの幕と、Jevの音の光を足す */
export type EffectKind = Flourish | ReleaseFlourish | "wipe" | "spark";

export type Effect = {
  kind: EffectKind;
  /** 出す位置（画面の座標） */
  x: number;
  y: number;
  /** 大きさの倍率 */
  scale: number;
  /** 出した時刻（秒） */
  start: number;
  /** 形や向きを決める乱数の種 */
  seed: number;
};

/** エフェクトごとの長さ（秒） */
export const DURATIONS: Record<EffectKind, number> = {
  ring: 0.8,
  "cut-in": 0.75,
  sweep: 0.6,
  confetti: 1.1,
  spinner: 0.9,
  veil: 0.9,
  wipe: 1.0,
  spark: 0.5,
};

type Canvas = { context: CanvasRenderingContext2D; width: number; height: number; theme: Theme; reducedMotion: boolean };

const easeOut = (t: number) => 1 - (1 - t) ** 3;
const easeIn = (t: number) => t ** 3;
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

/** 種から決まる乱数。同じエフェクトは、描くたびに同じ形になる */
function seeded(seed: number): () => number {
  let state = Math.floor(seed * 2 ** 31) || 1;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

/** 輪が広がる */
function ring({ context, theme }: Canvas, effect: Effect, t: number) {
  for (let index = 0; index < 3; index++) {
    const local = clamp01((t - index * 0.12) / 0.88);
    if (local <= 0) continue;
    context.globalAlpha = (1 - local) * 0.9;
    context.strokeStyle = css(index === 1 ? theme.secondary : theme.primary);
    context.lineWidth = (10 - index * 3) * effect.scale * (1 - local) + 1;
    context.beginPath();
    context.arc(effect.x, effect.y, effect.scale * (30 + 260 * easeOut(local)), 0, Math.PI * 2);
    context.stroke();
  }
}

/** 大きな図形が、画面の端から押した位置を通って、反対側へ抜けていく */
function cutIn({ context, width, height, theme }: Canvas, effect: Effect, t: number) {
  const random = seeded(effect.seed);
  const size = Math.min(width, height) * 0.32 * effect.scale;
  const fromLeft = random() < 0.5;
  const startX = fromLeft ? -size : width + size;
  const endX = fromLeft ? width + size : -size;
  // 真ん中あたりでゆっくりになるよう、速く入ってゆっくり見せ、速く抜ける
  const travel = t < 0.5 ? easeOut(t * 2) * 0.5 : 0.5 + easeIn((t - 0.5) * 2) * 0.5;
  const x = startX + (endX - startX) * travel;
  const y = effect.y + (random() - 0.5) * size * 0.6;
  const shape = Math.floor(random() * 3);
  context.save();
  context.translate(x, y);
  context.rotate(random() * Math.PI + t * 0.8);
  context.globalAlpha = 0.85;
  context.fillStyle = css(random() < 0.5 ? theme.primary : theme.secondary);
  context.beginPath();
  if (shape === 0) {
    // 三角
    for (let corner = 0; corner < 3; corner++) {
      const angle = (corner / 3) * Math.PI * 2;
      context.lineTo(Math.cos(angle) * size * 0.6, Math.sin(angle) * size * 0.6);
    }
    context.closePath();
  } else if (shape === 1) {
    // 半円
    context.arc(0, 0, size * 0.5, 0, Math.PI);
    context.closePath();
  } else {
    // 細長い長方形
    context.rect(-size * 0.7, -size * 0.12, size * 1.4, size * 0.24);
  }
  context.fill();
  context.restore();
}

/** 押した高さで、平行線が画面を横切る */
function sweep({ context, width, theme }: Canvas, effect: Effect, t: number) {
  const gap = 14 * effect.scale;
  const head = easeOut(clamp01(t * 1.4)) * width;
  const tail = easeIn(t) * width;
  for (let index = -2; index <= 2; index++) {
    context.globalAlpha = 0.9 - Math.abs(index) * 0.18;
    context.fillStyle = css(index % 2 === 0 ? theme.primary : theme.secondary);
    const thickness = (index === 0 ? 6 : 3) * effect.scale;
    // 1本ずつ少しずらして走らせる
    const lag = Math.abs(index) * 0.06 * width;
    context.fillRect(tail - lag, effect.y + index * gap - thickness / 2, Math.max(0, head - tail), thickness);
  }
}

/** 紙吹雪が弾ける */
function confetti({ context, theme }: Canvas, effect: Effect, t: number) {
  const random = seeded(effect.seed);
  const colors: Hsl[] = [theme.primary, theme.secondary, theme.deep, theme.glow];
  const count = Math.round(22 * effect.scale);
  for (let index = 0; index < count; index++) {
    const angle = random() * Math.PI * 2;
    const speed = (180 + random() * 320) * effect.scale;
    const x = effect.x + Math.cos(angle) * speed * easeOut(t);
    // 重力で少し落ちる
    const y = effect.y + Math.sin(angle) * speed * easeOut(t) + 260 * t * t;
    const size = 5 + random() * 9;
    context.save();
    context.translate(x, y);
    context.rotate(random() * Math.PI + t * (random() - 0.5) * 12);
    context.globalAlpha = 1 - t * t;
    context.fillStyle = css(colors[index % colors.length]!);
    if (index % 3 === 0) {
      context.beginPath();
      context.arc(0, 0, size / 2, 0, Math.PI * 2);
      context.fill();
    } else {
      context.fillRect(-size / 2, -size / 4, size, size / 2);
    }
    context.restore();
  }
}

/** 多角形が回りながら広がる */
function spinner({ context, theme }: Canvas, effect: Effect, t: number) {
  const random = seeded(effect.seed);
  const sides = 3 + Math.floor(random() * 4);
  const radius = effect.scale * (24 + 230 * easeOut(t));
  const polygon = (r: number, turn: number) => {
    context.beginPath();
    for (let corner = 0; corner < sides; corner++) {
      const angle = turn + (corner / sides) * Math.PI * 2;
      context.lineTo(effect.x + Math.cos(angle) * r, effect.y + Math.sin(angle) * r);
    }
    context.closePath();
  };
  context.globalAlpha = (1 - t) * 0.18;
  context.fillStyle = css(theme.secondary);
  polygon(radius * 0.7, -t * 1.5);
  context.fill();
  context.globalAlpha = 1 - t;
  context.strokeStyle = css(theme.primary);
  context.lineWidth = 4 * effect.scale * (1 - t) + 1;
  polygon(radius, t * 2.4);
  context.stroke();
}

/** 長く押さえて離したとき、押した位置から地がその色に染まって引いていく */
function veil({ context, width, height, theme }: Canvas, effect: Effect, t: number) {
  const reach = Math.hypot(width, height);
  const gradient = context.createRadialGradient(effect.x, effect.y, 0, effect.x, effect.y, reach * easeOut(t) + 1);
  gradient.addColorStop(0, css(theme.primary, 0));
  gradient.addColorStop(0.7, css(theme.primary, 0.22 * (1 - t)));
  gradient.addColorStop(1, css(theme.primary, 0));
  context.globalAlpha = 1;
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
}

/** 進行が移るとき、新しい色の幕が画面を斜めに横切る */
function wipe({ context, width, height, theme }: Canvas, _effect: Effect, t: number) {
  const span = width + height;
  const lead = easeOut(t) * (span + width * 0.6) - width * 0.3;
  const band = width * 0.35;
  const parallelogram = (from: number, to: number) => {
    context.beginPath();
    context.moveTo(from, 0);
    context.lineTo(to, 0);
    context.lineTo(to - height, height);
    context.lineTo(from - height, height);
    context.closePath();
  };
  context.globalAlpha = 0.28 * (1 - t * 0.6);
  context.fillStyle = css(theme.primary);
  parallelogram(lead - band, lead);
  context.fill();
  context.globalAlpha = 0.5 * (1 - t);
  context.fillStyle = css(theme.secondary);
  parallelogram(lead - band - 40, lead - band - 16);
  context.fill();
}

/** Jevの音: 小さな光が一瞬またたく */
function spark({ context, theme }: Canvas, effect: Effect, t: number) {
  const size = (6 + 10 * easeOut(t)) * effect.scale;
  context.globalAlpha = (1 - t) * 0.8;
  context.strokeStyle = css(theme.secondary);
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(effect.x - size, effect.y);
  context.lineTo(effect.x + size, effect.y);
  context.moveTo(effect.x, effect.y - size);
  context.lineTo(effect.x, effect.y + size);
  context.stroke();
}

const DRAWERS: Record<EffectKind, (canvas: Canvas, effect: Effect, t: number) => void> = {
  ring,
  "cut-in": cutIn,
  sweep,
  confetti,
  spinner,
  veil,
  wipe,
  spark,
};

/**
 * エフェクトを1つ描く。動きを減らす設定のときは、動かさずにその場で薄い円が消えるだけにする
 * （進行が移るときの幕は、画面全体が薄く色づいて引くだけにする）
 */
export function drawEffect(canvas: Canvas, effect: Effect, now: number) {
  const t = clamp01((now - effect.start) / DURATIONS[effect.kind]);
  const { context } = canvas;
  context.save();
  if (canvas.reducedMotion) {
    context.globalAlpha = 0.25 * (1 - t);
    context.fillStyle = css(canvas.theme.primary);
    if (effect.kind === "wipe") {
      context.fillRect(0, 0, canvas.width, canvas.height);
    } else {
      context.beginPath();
      context.arc(effect.x, effect.y, 60 * effect.scale, 0, Math.PI * 2);
      context.fill();
    }
  } else {
    DRAWERS[effect.kind](canvas, effect, t);
  }
  context.restore();
}

/** もう描き終えたエフェクトか */
export function isFinished(effect: Effect, now: number): boolean {
  return now - effect.start >= DURATIONS[effect.kind];
}
