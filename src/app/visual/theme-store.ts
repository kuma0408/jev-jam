// いまの画面の色を持つ場所。演奏面・背景・エフェクトの canvas は、描くたびに currentTheme() を読む。
// 色の切り替えは、行き先を決めて一定時間かけて移ろわせる（moveThemeTo）。
import { type Theme, css, mixTheme, themeFor } from "../../lib/visual/palette.ts";

let from: Theme = themeFor(null, null);
let to: Theme = from;
let startedAt = 0;
let seconds = 1;

const nowSeconds = () => performance.now() / 1000;

/** いまの色。移ろっている途中なら、その途中の色 */
export function currentTheme(at = nowSeconds()): Theme {
  const progress = Math.min(1, Math.max(0, (at - startedAt) / seconds));
  // 始まりと終わりをゆるやかにする
  return mixTheme(from, to, progress * progress * (3 - 2 * progress));
}

/** 色が移ろっている途中か。途中なら canvas を描き続ける */
export function isThemeMoving(at = nowSeconds()): boolean {
  return at - startedAt < seconds;
}

/**
 * overSeconds 秒かけて、theme へ移ろわせる。
 * CSS で使う色（地の色など）も、同じ時間で移ろうよう CSS 変数に書く
 */
export function moveThemeTo(theme: Theme, overSeconds: number) {
  from = currentTheme();
  to = theme;
  startedAt = nowSeconds();
  seconds = Math.max(0.01, overSeconds);
  const style = document.documentElement.style;
  style.setProperty("--wash", css(theme.wash));
  style.setProperty("--theme-primary", css(theme.primary));
  style.setProperty("--theme-secondary", css(theme.secondary));
  style.setProperty("--theme-deep", css(theme.deep));
  style.setProperty("--theme-seconds", `${overSeconds}s`);
}
