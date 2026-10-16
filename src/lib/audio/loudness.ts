// ソロの音の強さ（0〜1、激しいときは1を超える）を、実際に鳴らす大きさと音色に直す。

/**
 * 強さ0のときに残す大きさ。強さをそのまま大きさにすると、弱い小節のデクレッシェンドの終わりで約-18dBになり、
 * 伴奏に埋もれて「マジで聞こえない」と言われた。弱い音だけを持ち上げ、いちばん弱い音でも強い音の約-8dBに収める
 */
const LEVEL_FLOOR = 0.32;

/** 強さを、鳴らす大きさに直す。1までは底を持ち上げ、1を超える分（激しいときの倍率）はそのまま大きくする */
export function soloLevel(velocity: number): number {
  if (velocity >= 1) return velocity;
  return LEVEL_FLOOR + (1 - LEVEL_FLOOR) * Math.max(0, velocity);
}

/** 弱い音でも通す高さ（Hz）と、強い音で開ききる高さ */
const BRIGHTNESS_FLOOR_HZ = 1800;
const BRIGHTNESS_TOP_HZ = 8000;

/**
 * 強さに応じたフィルターの開き具合。弱い音はこもらせ、強い音は明るくする。
 * 以前は弱い音で 700Hz まで閉じていて、音が小さいうえに輪郭も消えていた
 */
export function brightnessHz(velocity: number): number {
  const v = Math.min(1, Math.max(0, velocity));
  return BRIGHTNESS_FLOOR_HZ + v * v * (BRIGHTNESS_TOP_HZ - BRIGHTNESS_FLOOR_HZ);
}
