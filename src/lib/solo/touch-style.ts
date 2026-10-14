// 伴奏の質感（しっとり〜激しい）で、ソロの音の大きさと音域を変える。
// 盛り上がり（音数）だけでは「伴奏に合わせて変わった」と感じにくかったので、音量と高さの幅も広げる。
import type { Touch } from "./energy.ts";

const VELOCITY_BY_TOUCH: Record<Touch, number> = { sustained: 0.7, none: 1, light: 1, active: 1.12, busy: 1.3 };

/** ソロの音の大きさの倍率。しっとりなら小さく、激しいほど大きい */
export function touchVelocity(touch: Touch): number {
  return VELOCITY_BY_TOUCH[touch];
}

/** 音域の中のどのあたりを目指すか（0=いちばん下、1=いちばん上） */
const REGISTER_BY_TOUCH: Partial<Record<Touch, number>> = { sustained: 0.4, busy: 0.88 };

/**
 * ソロが目指す音の高さ（MIDIノート番号）。激しいときは高い音域、しっとりは真ん中より少し下。
 * それ以外は指定しない（4小節の高さの流れに任せる）
 */
export function touchRegister(touch: Touch, range: { low: number; high: number }): number | undefined {
  const position = REGISTER_BY_TOUCH[touch];
  return position === undefined ? undefined : Math.round(range.low + position * (range.high - range.low));
}
