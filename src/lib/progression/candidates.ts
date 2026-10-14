import { PROGRESSIONS, type Progression } from "./library.ts";

export type ChordCandidate = {
  chord: string;
  /** 1=定番、2=ひねり、3=大胆 */
  adventure: 1 | 2 | 3;
  /** なぜこの進行が成り立つかの短い説明 */
  reason: string;
  /** この小節の後半（3拍目から）に置くコード。1小節に2つのコードを半分ずつ置く進行の続きのときだけある */
  then?: string;
  /** どの定番進行の続きか（いちばん長く一致した進行の名前）。定番の続きでない候補には無い */
  progression?: string;
};

export type CandidateOptions = {
  /** いま乗っている進行の名前。その進行の続きを、ほかの一致より優先して先頭にする */
  prefer?: string;
};

export const MAX_CANDIDATES = 6;
/** 選べる候補の最低数。1つしか無いと、ユーザーが曲を引っ張っている感覚が無くなる */
export const MIN_CANDIDATES = 3;
/** 一致の長さはここで頭打ちにする。長い進行に一度乗ると、そこから抜けられなくなるのを防ぐ */
const MAX_MATCH_LENGTH = 4;
const JAZZ_WEIGHT = 2;
/** 乗っている進行の一致に足す長さ。一致の長さの上限より大きくして、必ず先頭にする */
const PREFER_BONUS = MAX_MATCH_LENGTH + 1;
const POP_WEIGHT = 1;

/** 進行の一覧に出てくるすべてのコード */
export const KNOWN_CHORDS: readonly string[] = [...new Set(PROGRESSIONS.flatMap((progression) => progression.chords))];

// キー（Cメジャー）の中での遠さで冒険度を決める
const DIATONIC = new Set(["Cmaj7", "Dm7", "Em7", "Fmaj7", "G7", "Am7"]);
/** キーの中のコードへ向かう、セカンダリードミナントとその相方 */
const SECONDARY = new Set(["A7", "E7", "C7", "D7", "Gm7"]);

/** 定番の続きが足りないときに、この順で補う。どのコードからでも進める、キーの中の落ち着き先 */
const FALLBACKS: readonly [chord: string, reason: string][] = [
  ["Cmaj7", "トニックへ帰る"],
  ["Dm7", "ツーファイブの入口へ"],
  ["G7", "ドミナントへ"],
  ["Am7", "平行調のトニックへ"],
];

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

/** 進行の index 番目のコードが、1小節に2つ置く小節の前半か。そうなら後半のコードを返す */
function secondHalfAfter(progression: Progression, index: number): string | undefined {
  const { chords, loop, split } = progression;
  const normalized = loop ? ((index % chords.length) + chords.length) % chords.length : index;
  return split?.includes(normalized) ? chordAt(progression, index + 1) : undefined;
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

/**
 * length: 最も長い一致 / weight: 支持する進行の重みの合計 / name: 最も長く一致した進行の名前 /
 * then: 最も長く一致した進行で、この小節の後半に置くコード
 */
type Support = { length: number; weight: number; name: string; then?: string };

/**
 * これまでの進行から、次に進めるコードの候補を返す。
 *
 * よく使われる進行の一覧の中から、履歴の末尾と一致する箇所を探し、その「続き」を候補にする。
 * 長く一致する進行の続きほど上位に置くので、同じコードからでも、そこまでの流れで順位が変わる。
 * 先頭の候補が「選ばなかったときの既定」になる。
 *
 * 同じコードにとどまる候補を必ず入れ、それでも少なければキーの中の落ち着き先で補う。
 */
export function nextChordCandidates(history: readonly string[], options: CandidateOptions = {}): ChordCandidate[] {
  const current = history.at(-1);
  if (current === undefined || !KNOWN_CHORDS.includes(current)) {
    throw new Error(`進行の一覧に無いコードです: ${current ?? "（履歴が空）"}`);
  }
  // 同じコードにとどまった小節は1つにまとめ、とどまる前からの流れで照合する
  const flow = history.filter((chord, index) => chord !== history[index - 1]);

  const supports = new Map<string, Support>();
  for (const progression of PROGRESSIONS) {
    progression.chords.forEach((chord, position) => {
      if (chord !== current) return;
      const next = chordAt(progression, position + 1);
      if (next === undefined) return;

      // 乗っている進行の続きは、どんな長い一致よりも優先する
      const length = matchLength(progression, position, flow) + (progression.name === options.prefer ? PREFER_BONUS : 0);
      const weight = progression.pop ? POP_WEIGHT : JAZZ_WEIGHT;
      const then = secondHalfAfter(progression, position + 1);
      const support = supports.get(next);
      if (!support) {
        supports.set(next, { length, weight, name: progression.name, ...(then ? { then } : {}) });
      } else {
        support.weight += weight;
        if (length > support.length) {
          support.length = length;
          support.name = progression.name;
          if (then) support.then = then;
          else delete support.then;
        }
      }
    });
  }

  const candidates: ChordCandidate[] = [...supports.entries()]
    .map(([chord, support]) => ({ chord, support, adventure: adventureOf(chord) }))
    .sort(
      (a, b) =>
        b.support.length - a.support.length || b.support.weight - a.support.weight || a.adventure - b.adventure,
    )
    // 最後の1枠は「とどまる」のために空けておく
    .slice(0, MAX_CANDIDATES - 1)
    .map(({ chord, support, adventure }) => ({
      chord,
      adventure,
      reason: support.then ? `「${support.name}」の続き（後半は ${support.then}）` : `「${support.name}」の続き`,
      progression: support.name,
      ...(support.then ? { then: support.then } : {}),
    }));

  candidates.push({ chord: current, adventure: 1, reason: "同じコードにもう1小節とどまる" });

  for (const [chord, reason] of FALLBACKS) {
    if (candidates.length >= MIN_CANDIDATES) break;
    if (!candidates.some((candidate) => candidate.chord === chord)) {
      candidates.push({ chord, adventure: 2, reason });
    }
  }
  return candidates;
}
