// 伴奏の質感（しっとり〜激しい）で、ソロの音の大きさと音域を変える。
// 盛り上がり（音数）だけでは「伴奏に合わせて変わった」と感じにくかったので、音量と高さの幅も広げる。
import type { Touch } from "./energy.ts";

/**
 * 最初はしっとりを 0.7、激しいを 1.3 にしたが、「しっとりはほとんど聞こえない」「激しいところはもっと大きく」と言われて変えた
 */
const VELOCITY_BY_TOUCH: Record<Touch, number> = { sustained: 1, none: 1, light: 1, active: 1.15, busy: 1.5 };

/** ソロの音の大きさの倍率。激しいほど大きい（しっとりでも下げない。下げると伴奏に埋もれて聞こえなくなる） */
export function touchVelocity(touch: Touch): number {
  return VELOCITY_BY_TOUCH[touch];
}

/** テンポによる音量の底上げが始まるテンポと、上限に達するテンポ、その倍率 */
const TEMPO_BOOST_FROM = 140;
const TEMPO_BOOST_FULL = 220;
const TEMPO_BOOST_MAX = 1.2;

/**
 * テンポによる、ソロの音の大きさの倍率。速いほど大きくする（上限1.2倍）。
 * 速い曲では押すのが追いつかず、伴奏の質感が静かな側に判定されやすい。それでもソロが小さくなりすぎないよう、底を上げる
 */
export function tempoVelocity(bpm: number): number {
  const progress = Math.min(1, Math.max(0, (bpm - TEMPO_BOOST_FROM) / (TEMPO_BOOST_FULL - TEMPO_BOOST_FROM)));
  return 1 + (TEMPO_BOOST_MAX - 1) * progress;
}

/** 音域の中のどのあたりを目指すか（0=いちばん下、1=いちばん上） */
// 激しいときは最初 0.88 にしたが、録音を高く引き伸ばした不自然な音色になったので下げた
const REGISTER_BY_TOUCH: Partial<Record<Touch, number>> = { sustained: 0.4, busy: 0.7 };

/**
 * ソロが目指す音の高さ（MIDIノート番号）。激しいときは高い音域、しっとりは真ん中より少し下。
 * それ以外は指定しない（4小節の高さの流れに任せる）
 */
export function touchRegister(touch: Touch, range: { low: number; high: number }): number | undefined {
  const position = REGISTER_BY_TOUCH[touch];
  return position === undefined ? undefined : Math.round(range.low + position * (range.high - range.low));
}

/** 音域を寄せても、これだけは残す（半音）。狭すぎるとフレーズが同じ音を行き来するだけになる */
const MIN_SPAN = 12;
/**
 * 激しいときの下限と上限の位置、しっとりのときの上限の位置（音域の中の割合）。
 * 激しいときの上限は、いちばん上の音域を使わない。録音を高く引き伸ばすほど音色が不自然になるため
 */
const BUSY_FLOOR = 0.45;
const BUSY_CEILING = 0.88;
const SUSTAINED_CEILING = 0.7;

/**
 * ソロが使う音域を、伴奏の質感で寄せる。激しいときは下限を上げて高めに寄せ（上限も少し下げる）、しっとりは上限を下げる。
 * 目標の高さ（touchRegister）だけでは、旋律が下降すると低いところまで下りてしまい、差が出にくかった
 */
export function touchRange(touch: Touch, range: { low: number; high: number }): { low: number; high: number } {
  const span = range.high - range.low;
  if (touch === "busy") {
    const high = Math.round(range.low + span * BUSY_CEILING);
    return { low: Math.min(Math.round(range.low + span * BUSY_FLOOR), high - MIN_SPAN), high };
  }
  if (touch === "sustained") {
    return { low: range.low, high: Math.max(Math.round(range.low + span * SUSTAINED_CEILING), range.low + MIN_SPAN) };
  }
  return range;
}
