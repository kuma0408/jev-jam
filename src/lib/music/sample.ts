/**
 * 確率分布から1つを抽選する。
 * 最上位を採るだけだと毎回同じ音になるので、分布に従って選ぶことでアドリブらしい揺らぎを出す。
 *
 * @param random 0以上1未満の乱数を返す関数。テストでは固定値を渡す
 */
export function sampleFromDistribution<K extends string>(
  probabilities: Partial<Record<K, number>>,
  random: () => number = Math.random,
): K {
  const entries = (Object.entries(probabilities) as [K, number][]).filter(([, weight]) => weight > 0);
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  if (total <= 0) {
    throw new Error("抽選できる選択肢がありません");
  }

  const threshold = random() * total;
  let cumulative = 0;
  for (const [key, weight] of entries) {
    cumulative += weight;
    if (threshold < cumulative) {
      return key;
    }
  }
  // 浮動小数点の誤差で累積が合計に届かなかった場合は最後の選択肢を返す
  return entries.at(-1)![0];
}
