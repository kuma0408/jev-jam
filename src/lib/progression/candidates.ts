import { PROGRESSIONS, type Progression } from "./library.ts";

export type ChordCandidate = {
  chord: string;
  /** 1=定番、2=ひねり、3=大胆 */
  adventure: 1 | 2 | 3;
  /** なぜこの進行が成り立つかの短い説明 */
  reason: string;
};

export const MAX_CANDIDATES = 6;
/** 一致の長さはここで頭打ちにする。長い進行に一度乗ると、そこから抜けられなくなるのを防ぐ */
const MAX_MATCH_LENGTH = 4;
const JAZZ_WEIGHT = 2;
const POP_WEIGHT = 1;

/** 進行の一覧に出てくるすべてのコード */
export const KNOWN_CHORDS: readonly string[] = [...new Set(PROGRESSIONS.flatMap((progression) => progression.chords))];

// キー（Cメジャー）の中での遠さで冒険度を決める
const DIATONIC = new Set(["Cmaj7", "Dm7", "Em7", "Fmaj7", "G7", "Am7"]);
/** キーの中のコードへ向かう、セカンダリードミナントとその相方 */
const SECONDARY = new Set(["A7", "E7", "C7", "Gm7"]);

function adventureOf(chord: string): ChordCandidate["adventure"] {
  return DIATONIC.has(chord) ? 1 : SECONDARY.has(chord) ? 2 : 3;
}

/** 進行の中の位置を、繰り返す進行なら端をまたいで読む。範囲外なら undefined */
function chordAt(progression: Progression, index: number): string | undefined {
  const { chords, loop } = progression;
  if (loop) {
    return chords[((index % chords.length) + chords.length) % chords.length];
  }
  return chords[index];
}

/** 進行の position 番目が履歴の最後だとして、履歴の末尾と何コードぶん一致するかを数える */
function matchLength(progression: Progression, position: number, history: readonly string[]): number {
  const limit = Math.min(history.length, progression.chords.length, MAX_MATCH_LENGTH);
  let length = 0;
  while (length < limit && chordAt(progression, position - length) === history[history.length - 1 - length]) {
    length++;
  }
  return length;
}

/** length: 最も長い一致 / weight: 支持する進行の重みの合計 / name: 最も長く一致した進行の名前 */
type Support = { length: number; weight: number; name: string };

/**
 * これまでの進行から、次に進めるコードの候補を返す。
 *
 * よく使われる進行の一覧の中から、履歴の末尾と一致する箇所を探し、その「続き」を候補にする。
 * 長く一致する進行の続きほど上位に置くので、同じコードからでも、そこまでの流れで順位が変わる。
 * 先頭の候補が「選ばなかったときの既定」になる。
 */
export function nextChordCandidates(history: readonly string[]): ChordCandidate[] {
  const current = history.at(-1);
  if (current === undefined || !KNOWN_CHORDS.includes(current)) {
    throw new Error(`進行の一覧に無いコードです: ${current ?? "（履歴が空）"}`);
  }

  const supports = new Map<string, Support>();
  for (const progression of PROGRESSIONS) {
    progression.chords.forEach((chord, position) => {
      if (chord !== current) return;
      const next = chordAt(progression, position + 1);
      if (next === undefined) return;

      const length = matchLength(progression, position, history);
      const weight = progression.pop ? POP_WEIGHT : JAZZ_WEIGHT;
      const support = supports.get(next);
      if (!support) {
        supports.set(next, { length, weight, name: progression.name });
      } else {
        support.weight += weight;
        if (length > support.length) {
          support.length = length;
          support.name = progression.name;
        }
      }
    });
  }

  return [...supports.entries()]
    .map(([chord, support]) => ({ chord, support, adventure: adventureOf(chord) }))
    .sort(
      (a, b) =>
        b.support.length - a.support.length || b.support.weight - a.support.weight || a.adventure - b.adventure,
    )
    .slice(0, MAX_CANDIDATES)
    .map(({ chord, support, adventure }) => ({ chord, adventure, reason: `「${support.name}」の続き` }));
}
