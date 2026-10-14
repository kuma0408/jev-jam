// 8小節ごとの区切りで、別の定番進行へ移るためのルール。移るかどうかと、どこへ移るかはJevに選ばせる。
import { PROGRESSIONS, type Progression } from "./library.ts";

/** 区切りの長さ（小節）。定番の4小節の進行を2周したところ */
export const SECTION_BARS = 8;

/** その小節（1始まり）が区切りの頭か */
export function isSectionStart(bar: number): boolean {
  return (bar - 1) % SECTION_BARS === 0;
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
 * 区切りで移れる進行。区切りの次の小節で進めるコード（candidateChords）から始まるものだけにする。
 * いまの流れから自然につながるので、どれを選んでも音楽として成り立つ。いま乗っている進行は外す
 */
export function sectionOptions(candidateChords: readonly string[], current: string | null): Progression[] {
  return SECTION_PROGRESSIONS.filter(
    (progression) => progression.name !== current && candidateChords.includes(progression.chords[0]!),
  );
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
