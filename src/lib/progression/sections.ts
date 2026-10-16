// 8小節ごとの区切りで、別の定番進行へ移るためのルール。移るかどうかと、どこへ移るかはJevに選ばせる。
import { NOTE_NAMES, parseChord } from "../music/chord.ts";
import { KNOWN_CHORDS } from "./candidates.ts";
import { PROGRESSIONS, type Progression } from "./library.ts";

/** 区切りの長さ（小節）。定番の4小節の進行を2周したところ */
export const SECTION_BARS = 8;

/** その小節（1始まり）が区切りの頭か */
export function isSectionStart(bar: number): boolean {
  return (bar - 1) % SECTION_BARS === 0;
}

/** その小節（1始まり）が区切りの最後の小節か。移る先が決まっていれば、ここに導くコードを置く */
export function isSectionEnd(bar: number): boolean {
  return bar % SECTION_BARS === 0;
}

/** 移り先にできる進行（繰り返し型で、IDと雰囲気の説明を持つもの） */
const SECTION_PROGRESSIONS = PROGRESSIONS.filter((progression) => progression.loop && progression.id && progression.mood);

export function progressionById(id: string): Progression | undefined {
  return SECTION_PROGRESSIONS.find((progression) => progression.id === id);
}

export function progressionByName(name: string): Progression | undefined {
  return PROGRESSIONS.find((progression) => progression.name === name);
}

/**
 * 区切りで移れる進行。いまの進行を除く、すべての繰り返し型の進行。
 * どこへ移るときも、移る前の小節に導くコード（leadInFor）を置くので、流れは自然につながる
 */
export function sectionOptions(current: string | null): Progression[] {
  return SECTION_PROGRESSIONS.filter((progression) => progression.name !== current);
}

/** 半音で数えた、5度上と全音上の音程 */
const FIFTH_ABOVE = 7;
const WHOLE_STEP_ABOVE = 2;

/**
 * 移り先の最初のコードへ導くコード。小節の前半に全音上のマイナーセブンス（ii）、後半に5度上のセブンス（V）を置く。
 * 例: Fmaj7 へは Gm7 → C7、Cmaj7 へは Dm7 → G7。ジャズで行き先を予告する定番の「ツー・ファイブ」。
 * 以前は V だけを1小節置いていたが、切り替わりが急に聞こえた。
 * ii にあたるコードが一覧に無いとき（Am7 への Bm7 など）は、V だけを置く
 */
export function leadInFor(progression: Progression): { chord: string; then?: string } {
  const { root } = parseChord(progression.chords[0]!);
  const five = `${NOTE_NAMES[(root + FIFTH_ABOVE) % 12]}7`;
  const two = `${NOTE_NAMES[(root + WHOLE_STEP_ABOVE) % 12]}m7`;
  return KNOWN_CHORDS.includes(two) ? { chord: two, then: five } : { chord: five };
}

/**
 * 基本の進行。セッションはここから始まり、区切りでもここへ戻りやすくする。
 * ジャズ/ネオソウルのセッションに合う2つを選んだ（カノン進行は「ジャズに合わない」と言われて一覧から外した）
 */
export const HOME_PROGRESSIONS: readonly Progression[] = ["marusa", "just-the-two"].map((id) => progressionById(id)!);

/** 最初に乗る進行。1小節に1つのコードで、いちばん合わせやすい丸サ進行にする */
export const START_PROGRESSION: Progression = HOME_PROGRESSIONS[0]!;

/** 区切りで、基本の進行を選ばれやすくする倍率 */
const HOME_BIAS = 3;

/** 区切りの移り先としての選ばれやすさの倍率。Jevが返した確率に掛けて抽選する */
export function sectionBias(progression: Progression): number {
  return HOME_PROGRESSIONS.includes(progression) ? HOME_BIAS : 1;
}
