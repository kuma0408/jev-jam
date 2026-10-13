// 4小節のまとまりごとの、ソロの大きな形。まとまりの最初の小節でJevが選び、4小節のあいだ使う。
//
// 小節ごとに別々に選んでいると、どの小節も同じ音域・同じ長さのフレーズになり、ワンパターンに聞こえた。
// 「どこを吹いてどこを休むか」と「高さの流れ」を先に決めることで、長短と向かう先を作る。
import type { Energy } from "./energy.ts";

export type PhraseShape = {
  id: string;
  /** 画面に出す呼び名 */
  label: string;
  /** Jevに渡す説明 */
  description: string;
  /** 半小節8つぶん（4小節）の、吹く（true）か休む（false）か */
  slots: readonly boolean[];
};

function shape(id: string, label: string, pattern: string, description: string): PhraseShape {
  return { id, label, description, slots: [...pattern.replaceAll(" ", "")].map((mark) => mark === "x") };
}

// x = 吹く、. = 休む。2つで1小節
export const PHRASE_SHAPES: readonly PhraseShape[] = [
  shape("p-long-line", "長い一息", "xx xx x. ..", "One long line running for two and a half bars, then a long breath."),
  shape("p-wait-then-answer", "待ってから応える", ".. xx xx x.", "Stay silent for the whole first bar, then answer with one long phrase."),
  shape("p-call-and-silence", "呼びかけと間", "xx .. xx ..", "A one-bar statement, a full bar of silence, an answering statement, silence again."),
  shape("p-build", "だんだん詰める", "x. x. xx xx", "Short fragments separated by gaps that grow into a continuous line."),
  shape("p-taper", "だんだん引く", "xx x. x. ..", "Start busy, thin out, and fade into silence."),
  shape("p-bookends", "始めと終わり", "xx .. .x xx", "Open with a statement, leave a long gap, then come back strongly at the end."),
  shape("p-conversational", "語るように", "x. xx .. xx", "Uneven phrases of different lengths, like someone speaking."),
  shape("p-two-by-two", "2小節ずつ", "xx x. xx x.", "Two matching two-bar phrases, each ending with a short breath."),
  shape("p-relentless", "吹き続ける", "xx xx xx x.", "Nearly continuous playing through all four bars, with one short breath at the very end."),
  shape("p-scattered", "ぽつりぽつり", ".x .. x. .x", "Only a few scattered short entries, surrounded by silence."),
  shape("p-breath-before-the-end", "終わりの前に一息", "xx xx x. xx", "A long line, one short breath, then a strong finish."),
  shape("p-pause-then-push", "溜めて押す", "xx xx .x xx", "A long line, a short held-back pause, then push through to the end."),
  shape("p-answering", "受け答え", "x. xx xx x.", "A short opening remark answered by a long, flowing reply."),
];

/** 盛り上がりごとの、吹く場所の数の目安（8か所のうち） */
// 以前は 3.5 / 5 / 6 / 7 で、「ゆったり」では小節の4分の1が無音になり、間が多すぎた
const DENSITY_TARGET: Record<Energy, number> = { 1: 5, 2: 6.5, 3: 7.5, 4: 8 };
/**
 * 盛り上がりごとの、吹く場所の数の下限。これより少ない形は、ほぼ選ばせない。
 * 目安へ寄せるだけでは足りなかった。Jevは間の多い形を好み、最近使った形を避ける仕組みも重なって、
 * 「ゆったり」で休みが3割を超えたままだった
 */
const DENSITY_FLOOR: Record<Energy, number> = { 1: 5, 2: 6, 3: 6, 4: 7 };
const BELOW_FLOOR_FACTOR = 0.03;
const SHAPES_BY_ID = new Map(PHRASE_SHAPES.map((entry) => [entry.id, entry]));

export function phraseShapeById(id: string | undefined): PhraseShape | undefined {
  return id === undefined ? undefined : SHAPES_BY_ID.get(id);
}

/** 盛り上がりに合った密度の形を選ばれやすくする */
export function biasShapesByEnergy(probabilities: Record<string, number>, energy: Energy): Record<string, number> {
  return Object.fromEntries(
    Object.entries(probabilities).map(([id, probability]) => {
      const density = SHAPES_BY_ID.get(id)?.slots.filter(Boolean).length ?? DENSITY_TARGET[energy];
      const distance = density - DENSITY_TARGET[energy];
      const floor = density < DENSITY_FLOOR[energy] ? BELOW_FLOOR_FACTOR : 1;
      return [id, (probability * floor) / (1 + distance * distance)];
    }),
  );
}

export type RegisterArc = {
  id: string;
  label: string;
  description: string;
  /** 小節ごとの高さの目標。0=音域の底、1=てっぺん */
  targets: readonly number[];
};

export const REGISTER_ARCS: readonly RegisterArc[] = [
  { id: "a-climb", label: "登る", targets: [0.15, 0.4, 0.65, 0.9], description: "Start down in the low register and climb higher with every bar." },
  { id: "a-descend", label: "降りる", targets: [0.9, 0.65, 0.4, 0.15], description: "Start up high and come down a little lower with every bar." },
  { id: "a-peak", label: "山", targets: [0.3, 0.55, 0.95, 0.5], description: "Rise to a high peak in the third bar, then fall back." },
  { id: "a-valley", label: "谷", targets: [0.75, 0.4, 0.15, 0.55], description: "Sink down to a low point in the third bar, then recover." },
  { id: "a-low", label: "低く", targets: [0.15, 0.25, 0.15, 0.3], description: "Stay down in the dark, warm low register." },
  { id: "a-high", label: "高く", targets: [0.8, 0.9, 0.75, 0.85], description: "Stay up in the bright, intense high register." },
  { id: "a-middle", label: "中ほど", targets: [0.5, 0.45, 0.55, 0.5], description: "Stay in the comfortable middle register." },
];

const ARCS_BY_ID = new Map(REGISTER_ARCS.map((arc) => [arc.id, arc]));

export function registerArcById(id: string | undefined): RegisterArc | undefined {
  return id === undefined ? undefined : ARCS_BY_ID.get(id);
}

/** 高さの流れと小節の位置から、その小節で目指す音の高さ（MIDIノート番号）を返す。流れが無ければ undefined */
export function registerTarget(
  arcId: string | undefined,
  barInPhrase: number,
  range: { low: number; high: number },
): number | undefined {
  const target = registerArcById(arcId)?.targets[barInPhrase];
  return target === undefined ? undefined : Math.round(range.low + target * (range.high - range.low));
}
