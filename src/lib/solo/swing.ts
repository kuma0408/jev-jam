/**
 * 楽譜上の拍の位置を、スウィングさせた位置に変換する。
 * 各拍の前半（表の8分音符）を引き伸ばし、後半（裏の8分音符）を縮める。16分音符もそれに合わせて動く。
 *
 * @param ratio 裏の8分音符を拍のどの位置に置くか。0.5で均等、2/3で3連符のスウィング
 */
export function swingBeats(position: number, ratio: number): number {
  const beat = Math.floor(position);
  const fraction = position - beat;
  const swung = fraction < 0.5 ? fraction * (ratio / 0.5) : ratio + (fraction - 0.5) * ((1 - ratio) / 0.5);
  return beat + swung;
}

const SLOW_BPM = 120;
const FAST_BPM = 240;
const SLOW_RATIO = 2 / 3;
const FAST_RATIO = 0.54;

/** テンポに合ったスウィングの比率を返す。速い曲ほど均等な8分音符に近づけるのがジャズの慣習 */
export function swingRatioFor(bpm: number): number {
  const t = Math.min(1, Math.max(0, (bpm - SLOW_BPM) / (FAST_BPM - SLOW_BPM)));
  return SLOW_RATIO + (FAST_RATIO - SLOW_RATIO) * t;
}
