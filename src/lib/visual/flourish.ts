// 押したときのエフェクトを出し分けるルール。描き方は app/visual/flourishes.ts にある。

/**
 * 押したときのエフェクト。
 * ring: 輪が広がる / cut-in: 大きな図形が画面の端から差し込む / sweep: 平行線が横切る /
 * confetti: 紙吹雪が弾ける / spinner: 多角形が回りながら広がる
 */
export const FLOURISHES = ["ring", "cut-in", "sweep", "confetti", "spinner"] as const;
export type Flourish = (typeof FLOURISHES)[number];

/** 長く押さえて離したときのエフェクト。地の色が一瞬その色に染まる */
export type ReleaseFlourish = "veil";

/** これ以上押さえていたら、離したときに地を染める（秒） */
const VEIL_SECONDS = 0.6;

/**
 * count 回目（0始まり）に押したときのエフェクト。
 * 5回で全種類を1回ずつ出し、周ごとに並び順を入れ替える。同じものが続かず、いつも同じ順番にもならない
 */
export function pickFlourish(count: number): Flourish {
  const cycle = Math.floor(count / FLOURISHES.length);
  const position = count % FLOURISHES.length;
  // 周ごとに2つずつずらし、奇数周は逆順にする。周の変わり目でも同じものが続かない
  const rotated = FLOURISHES.map((_, index) => FLOURISHES[(index + cycle * 2) % FLOURISHES.length]!);
  const order = cycle % 2 === 1 ? rotated.reverse() : rotated;
  return order[position]!;
}

/** 押さえていた長さ（秒）から、離したときのエフェクトを決める。短ければ出さない */
export function flourishOnRelease(heldSeconds: number): ReleaseFlourish | null {
  return heldSeconds >= VEIL_SECONDS ? "veil" : null;
}

/** 押した高さ（0=いちばん下、1=いちばん上）から、エフェクトの大きさの倍率を決める */
export function flourishScale(height: number): number {
  return 0.6 + 0.8 * Math.min(1, Math.max(0, height));
}
