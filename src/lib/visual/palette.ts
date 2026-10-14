// 画面の色を、いま乗っている定番進行（曲調）と、いまのコードから決めるルール。
// 進行ごとに基準の色相を持たせ、進行が移ると全体の色が大きく変わる。
// その中で、コードが変わるたびに色相を少しずらして、色が移ろうようにする。
import { parseChord } from "../music/chord.ts";

export type Hsl = { h: number; s: number; l: number };

/**
 * 背景の表情。
 * sand: 細かい粒が、うねる流れに乗って流れる / swarm: 粒が拍で集まり、小節の頭で散る / shards: 細い線と三角が漂う
 */
export type Scene = "sand" | "swarm" | "shards";

export type Theme = {
  /** 地ににじませる色。ほぼ白 */
  wash: Hsl;
  /** あなたの和音の色 */
  primary: Hsl;
  /** Jevの旋律の色。あなたの色の反対側に近い色相 */
  secondary: Hsl;
  /** 文字や線の深い色 */
  deep: Hsl;
  /** 光の芯の色。白に近い */
  glow: Hsl;
  scene: Scene;
};

/** 進行のIDごとの、基準の色相（度）と背景の表情。雰囲気の説明（library.ts の mood）に合わせて選んだ */
export const LOOKS: Record<string, { hue: number; scene: Scene }> = {
  // 夜の街の青
  marusa: { hue: 228, scene: "shards" },
  // 夕暮れの橙
  "just-the-two": { hue: 22, scene: "sand" },
  // 落ち着いた緑。スタンダードの温かさ
  "i-vi-ii-v": { hue: 160, scene: "swarm" },
  // ブルージーな水色
  "i-vi7-ii-v": { hue: 195, scene: "swarm" },
  // 明るく切ない桃色
  "royal-road": { hue: 335, scene: "sand" },
  // 劇的な紫
  komuro: { hue: 265, scene: "shards" },
  // 冒険的な若葉色
  ladybird: { hue: 125, scene: "shards" },
  // 夢見るような藤色
  "one-four": { hue: 290, scene: "sand" },
  // ほろ苦い薔薇色
  "minor-iv": { hue: 0, scene: "swarm" },
  // ビバップの真鍮の黄
  "ii-v-i-vi7": { hue: 45, scene: "shards" },
};

const DEFAULT_LOOK = "marusa";
/** コードによる色相のずれの最大（度） */
const MAX_CHORD_SHIFT = 20;
/** Jevの色を、あなたの色からどれだけ回すか（度） */
const SECONDARY_TURN = 150;

/**
 * コードによる色相のずれ（度）。5度圏の位置で決める。C を0に、G・D…と5度上へ進むほど正、F・B♭…と下へ進むほど負。
 * 隣り合うコードほど近い色になるので、進行に沿って色がなめらかに移ろう
 */
export function chordShift(chord: string): number {
  const { root } = parseChord(chord);
  const position = (root * 7) % 12;
  const centered = position > 6 ? position - 12 : position;
  return (centered / 6) * MAX_CHORD_SHIFT;
}

const wrap = (hue: number) => ((hue % 360) + 360) % 360;

/** 進行のIDといまのコードから、画面の色を決める。どちらも分からなければ、基本の丸サ進行の見た目にする */
export function themeFor(progressionId: string | null, chord: string | null): Theme {
  const look = LOOKS[progressionId ?? DEFAULT_LOOK] ?? LOOKS[DEFAULT_LOOK]!;
  const hue = look.hue;
  const primaryHue = wrap(hue + (chord ? chordShift(chord) : 0));
  return {
    wash: { h: hue, s: 70, l: 96 },
    primary: { h: primaryHue, s: 82, l: 52 },
    secondary: { h: wrap(primaryHue + SECONDARY_TURN), s: 85, l: 52 },
    deep: { h: hue, s: 45, l: 15 },
    glow: { h: primaryHue, s: 100, l: 88 },
    scene: look.scene,
  };
}

/** 色相を近い向きに回しながら混ぜる */
function mixHue(from: number, to: number, t: number): number {
  const delta = ((to - from + 540) % 360) - 180;
  return wrap(from + delta * t);
}

function mixHsl(from: Hsl, to: Hsl, t: number): Hsl {
  return { h: mixHue(from.h, to.h, t), s: from.s + (to.s - from.s) * t, l: from.l + (to.l - from.l) * t };
}

/** 2つの色の間を t（0〜1）で混ぜる。背景の表情は、半分を過ぎたら行き先に切り替える */
export function mixTheme(from: Theme, to: Theme, t: number): Theme {
  return {
    wash: mixHsl(from.wash, to.wash, t),
    primary: mixHsl(from.primary, to.primary, t),
    secondary: mixHsl(from.secondary, to.secondary, t),
    deep: mixHsl(from.deep, to.deep, t),
    glow: mixHsl(from.glow, to.glow, t),
    scene: t < 0.5 ? from.scene : to.scene,
  };
}

/** HSL を 0〜255 の RGB に直す */
export function hslToRgb({ h, s, l }: Hsl): [number, number, number] {
  const saturation = s / 100;
  const lightness = l / 100;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const part = (offset: number) => {
    const k = (offset + h / 30) % 12;
    return lightness - (chroma / 2) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [part(0), part(8), part(4)].map((value) => Math.round(value * 255)) as [number, number, number];
}

/** canvas や CSS に渡す色の文字列 */
export function css(color: Hsl, alpha = 1): string {
  return `hsl(${color.h.toFixed(1)} ${color.s.toFixed(1)}% ${color.l.toFixed(1)}% / ${alpha})`;
}

/** 2つの色の明暗差（WCAG のコントラスト比、1〜21） */
export function contrastRatio(a: readonly number[], b: readonly number[]): number {
  const luminance = (rgb: readonly number[]) => {
    const [r, g, bl] = rgb.map((value) => {
      const channel = value / 255;
      return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
  };
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light! + 0.05) / (dark! + 0.05);
}
