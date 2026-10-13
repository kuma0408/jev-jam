// ソロの「リズム」の一覧。半小節（2拍）ぶんで、音の高さは持たない。
// 音の動き（contours.ts）と組み合わせて1つのフレーズになる。
import type { CellNote } from "./cells.ts";
import type { Energy } from "./energy.ts";

export type TempoBand = "slow" | "medium" | "fast";

const SLOW_BELOW_BPM = 100;
const FAST_ABOVE_BPM = 180;

export function tempoBand(bpm: number): TempoBand {
  return bpm < SLOW_BELOW_BPM ? "slow" : bpm > FAST_ABOVE_BPM ? "fast" : "medium";
}

export type RhythmHit = Pick<CellNote, "at" | "dur" | "accent" | "tie">;

export type Rhythm = {
  id: string;
  /** Jevに渡す説明。どんなリズムで、どう聞こえるかを英語で書く */
  description: string;
  hits: readonly RhythmHit[];
  /** このリズムを使うテンポ帯 */
  bands: readonly TempoBand[];
  /** 音数の多さ。盛り上がりのつまみに近いものほど選ばれやすくなる */
  energy: Energy;
  /** true ならスウィングさせない */
  straight?: boolean;
  /** 16分音符を含むリズム。均等に刻む */
  sixteenths?: boolean;
  /** 半小節を16分音符でほぼ埋める「走る」リズム。選ばれたら1〜2小節続けて、伸ばす音との対比を作る */
  run?: boolean;
};

const ALL: readonly TempoBand[] = ["slow", "medium", "fast"];
const THIRD = 1 / 3;

/** 同じ長さの音を並べる */
function run(count: number, step: number, startAt = 0): RhythmHit[] {
  return Array.from({ length: count }, (_, index) => ({ at: startAt + index * step, dur: step }));
}

export const RHYTHMS: readonly Rhythm[] = [
  // --- どのテンポでも使う、間と長い音 ---
  { id: "r-rest", bands: ALL, energy: 1, description: "Silence. Play nothing and let the music breathe.", hits: [] },
  {
    id: "r-whole",
    bands: ALL,
    energy: 1,
    description: "One very long note that keeps ringing through the rest of the bar. Patient and singing.",
    hits: [{ at: 0, dur: 4 }],
  },
  {
    id: "r-half",
    bands: ALL,
    energy: 1,
    description: "One long note held for two beats. Lyrical and unhurried.",
    hits: [{ at: 0, dur: 2 }],
  },
  {
    id: "r-late-long",
    bands: ALL,
    energy: 1,
    description: "Wait one beat in silence, then one sustained note.",
    hits: [{ at: 1, dur: 1 }],
  },
  {
    id: "r-stab",
    bands: ALL,
    energy: 1,
    description: "One short, clipped note on the beat, then silence. A punctuation mark.",
    hits: [{ at: 0, dur: 0.35, accent: "accent" }],
  },
  {
    id: "r-tied-push",
    bands: ALL,
    energy: 1,
    description: "Silence, then a single accented note right at the end that pushes into the next beat.",
    hits: [{ at: 1.5, dur: 0.5, accent: "accent" }],
  },
  {
    id: "r-two-quarters",
    bands: ALL,
    energy: 2,
    description: "Two even quarter notes. Simple, melodic, like singing two words.",
    hits: run(2, 1),
  },
  {
    id: "r-dotted-quarter-eighth",
    bands: ALL,
    energy: 2,
    description: "A long note, then a short pickup note at the very end.",
    hits: [
      { at: 0, dur: 1.5 },
      { at: 1.5, dur: 0.5 },
    ],
  },
  {
    id: "r-offbeat-long",
    bands: ALL,
    energy: 2,
    description: "Rest briefly, then enter on the off-beat with one long note. Cool and laid-back.",
    hits: [{ at: 0.5, dur: 1.5 }],
  },
  {
    id: "r-pickup-two",
    bands: ALL,
    energy: 2,
    description: "Stay silent, then two quick notes at the end that lead into the next phrase.",
    hits: run(2, 0.5, 1),
  },
  {
    id: "r-charleston",
    bands: ALL,
    energy: 2,
    description: "Charleston rhythm: a note on the beat, then a syncopated answer just before the next beat.",
    hits: [
      { at: 0, dur: 0.75 },
      { at: 1.5, dur: 0.5, accent: "accent" },
    ],
  },
  {
    id: "r-offbeat-pair",
    bands: ALL,
    energy: 2,
    description: "Two short syncopated notes, both on off-beats. Playful and rhythmic.",
    hits: [
      { at: 0.5, dur: 0.4, accent: "accent" },
      { at: 1.5, dur: 0.5, accent: "accent" },
    ],
  },
  {
    id: "r-stab-and-long",
    bands: ALL,
    energy: 2,
    description: "A short accented stab, a breath, then one sustained note.",
    hits: [
      { at: 0, dur: 0.35, accent: "accent" },
      { at: 1, dur: 1 },
    ],
  },
  {
    id: "r-two-eighths-rest",
    bands: ALL,
    energy: 2,
    description: "Two quick notes, then space. A short question.",
    hits: run(2, 0.5),
  },
  {
    id: "r-two-eighths-quarter",
    bands: ALL,
    energy: 2,
    description: "Two quick notes landing on a longer third note.",
    hits: [...run(2, 0.5), { at: 1, dur: 1, accent: "accent" }],
  },
  {
    id: "r-quarter-two-eighths",
    bands: ALL,
    energy: 2,
    description: "One steady note, then two quicker notes moving on.",
    hits: [{ at: 0, dur: 1 }, ...run(2, 0.5, 1)],
  },
  {
    id: "r-quarter-triplet",
    bands: ALL,
    energy: 2,
    straight: true,
    description: "Three broad, evenly stretched notes across two beats. Floats over the beat, laid-back.",
    hits: [
      { at: 0, dur: 0.6 },
      { at: 2 * THIRD, dur: 0.6 },
      { at: 4 * THIRD, dur: 0.6 },
    ],
  },

  // --- 8分音符で流れるリズム（中間と速いテンポ） ---
  {
    id: "r-three-eighths",
    bands: ["medium", "fast"],
    energy: 3,
    description: "Three flowing swing eighth notes, then a breath.",
    hits: run(3, 0.5),
  },
  {
    id: "r-late-three-eighths",
    bands: ["medium", "fast"],
    energy: 3,
    description: "Skip the downbeat, then three swing eighth notes running forward.",
    hits: run(3, 0.5, 0.5),
  },
  {
    id: "r-four-eighths",
    bands: ["medium", "fast"],
    energy: 3,
    description: "Four flowing swing eighth notes in a row. A running bebop line.",
    hits: run(4, 0.5),
  },
  {
    id: "r-four-eighths-accented",
    bands: ["medium", "fast"],
    energy: 4,
    description: "Four swing eighth notes with hard accents on the off-beats. Punchy and driving.",
    hits: run(4, 0.5).map((hit, index) => (index % 2 === 1 ? { ...hit, accent: "accent" as const } : hit)),
  },

  // --- 3連符（遅いテンポと中間） ---
  {
    id: "r-triplet-long",
    bands: ["slow", "medium"],
    energy: 3,
    straight: true,
    description: "A rolling triplet that lands on a long note. Flowing and elegant.",
    hits: [...run(3, THIRD), { at: 1, dur: 1, accent: "accent" }],
  },
  {
    id: "r-long-triplet-tail",
    bands: ["slow", "medium"],
    energy: 3,
    straight: true,
    description: "Hold one note, then finish with a quick triplet flourish.",
    hits: [{ at: 0, dur: 1 }, ...run(3, THIRD, 1)],
  },
  {
    id: "r-sixteenth-turn",
    bands: ["slow", "medium"],
    energy: 4,
    straight: true,
    sixteenths: true,
    description: "A quick flourish of four even sixteenth notes, then two calmer eighth notes.",
    hits: [...run(4, 0.25), ...run(2, 0.5, 1)],
  },

  // --- 均等な16分音符（遅いテンポの上で、倍の細かさで動く） ---
  {
    id: "r-grace-long",
    bands: ["slow"],
    energy: 1,
    straight: true,
    sixteenths: true,
    description: "A quick grace note sliding into a long held note. Tender ballad ornament.",
    hits: [
      { at: 0, dur: 0.25, accent: "ghost" },
      { at: 0.25, dur: 1.75 },
    ],
  },
  {
    id: "r-dotted-snap",
    bands: ["slow"],
    energy: 2,
    straight: true,
    sixteenths: true,
    description: "Long, a quick snapped short note, then long again. Expressive ballad phrasing.",
    hits: [
      { at: 0, dur: 0.75 },
      { at: 0.75, dur: 0.25 },
      { at: 1, dur: 1 },
    ],
  },
  {
    id: "r-late-sixteenth-four",
    bands: ["slow", "medium"],
    energy: 2,
    straight: true,
    sixteenths: true,
    description: "Wait one beat in silence, then four even sixteenth notes slip in. A sudden, graceful run inside a calm phrase.",
    hits: run(4, 0.25, 1),
  },
  {
    id: "r-long-sixteenth-pickup",
    bands: ["slow", "medium"],
    energy: 2,
    straight: true,
    sixteenths: true,
    description: "One long, singing note, then three quick even sixteenth notes that lead into the next phrase.",
    hits: [{ at: 0, dur: 1.25 }, ...run(3, 0.25, 1.25)],
  },
  {
    id: "r-sixteenth-burst-long",
    bands: ["slow", "medium"],
    energy: 3,
    straight: true,
    sixteenths: true,
    description: "A quick burst of four even sixteenth notes that lands on a long note. Excited, then sings.",
    hits: [...run(4, 0.25), { at: 1, dur: 1, accent: "accent" }],
  },
  {
    id: "r-long-sixteenth-tail",
    bands: ["slow", "medium"],
    energy: 3,
    straight: true,
    sixteenths: true,
    description: "Hold one note, then four even sixteenth notes rushing toward the next phrase.",
    hits: [{ at: 0, dur: 1 }, ...run(4, 0.25, 1)],
  },
  {
    id: "r-sixteenth-syncopation",
    bands: ["slow", "medium"],
    energy: 3,
    straight: true,
    sixteenths: true,
    description: "A funky, syncopated figure of even sixteenth notes with a held note in the middle. Neo soul feel.",
    hits: [
      { at: 0, dur: 0.25 },
      { at: 0.25, dur: 0.5, accent: "accent" },
      { at: 0.75, dur: 0.25 },
      { at: 1, dur: 0.5 },
      { at: 1.5, dur: 0.5, accent: "accent" },
    ],
  },
  {
    id: "r-sixteenth-run-land",
    bands: ["slow"],
    energy: 3,
    straight: true,
    sixteenths: true,
    run: true,
    description: "Six fast, even sixteenth notes that land on an accented note at the end. A double-time run with a clear arrival.",
    hits: [...run(6, 0.25), { at: 1.5, dur: 0.5, accent: "accent" }],
  },
  {
    id: "r-sixteenth-six",
    bands: ["slow"],
    energy: 3,
    straight: true,
    sixteenths: true,
    run: true,
    description: "Rest for a moment, then six even sixteenth notes surging forward. Double-time feel.",
    hits: run(6, 0.25, 0.5),
  },
  {
    id: "r-sixteenth-run",
    bands: ["slow"],
    energy: 3,
    straight: true,
    sixteenths: true,
    run: true,
    description: "Eight fast, perfectly even sixteenth notes. A double-time run over the slow beat, sheets of sound.",
    hits: run(8, 0.25),
  },
];

/**
 * 前の小節の最後の音を、新しく発音せずにそのまま伸ばすリズム。
 * 前の音が小節の終わりまで鳴っていて、次のコードにも合うときだけ、前半の選択肢に加える。
 */
export const TIE_RHYTHMS: readonly Rhythm[] = [
  {
    id: "r-tie-short",
    bands: ALL,
    energy: 1,
    description: "Keep holding the note from the previous bar across the bar line for one more beat, then breathe. Smooth and connected.",
    hits: [{ at: 0, dur: 1, tie: true }],
  },
  {
    id: "r-tie-long",
    bands: ALL,
    energy: 1,
    description: "Keep holding the note from the previous bar across the bar line for two more beats. One long line sailing over the chord change.",
    hits: [{ at: 0, dur: 2, tie: true }],
  },
  {
    id: "r-tie-then-two",
    bands: ALL,
    energy: 2,
    description: "Keep holding the note from the previous bar for one beat across the bar line, then move on with two quick notes.",
    hits: [{ at: 0, dur: 1, tie: true }, ...run(2, 0.5, 1)],
  },
  {
    id: "r-tie-then-long",
    bands: ALL,
    energy: 2,
    description: "Keep holding the note from the previous bar for one beat across the bar line, then step to a new sustained note.",
    hits: [
      { at: 0, dur: 1, tie: true },
      { at: 1, dur: 1 },
    ],
  },
];

const RHYTHMS_BY_ID = new Map([...RHYTHMS, ...TIE_RHYTHMS].map((rhythm) => [rhythm.id, rhythm]));

export function rhythmById(id: string): Rhythm {
  const rhythm = RHYTHMS_BY_ID.get(id);
  if (!rhythm) {
    throw new Error(`リズムの一覧に無いIDです: ${id}`);
  }
  return rhythm;
}

/** テンポ帯に合ったリズムだけを返す */
export function rhythmsFor(bpm: number): Rhythm[] {
  const band = tempoBand(bpm);
  return RHYTHMS.filter((rhythm) => rhythm.bands.includes(band));
}

/**
 * テンポ帯ごとの、16分音符のリズムに掛ける倍率。
 * run: 半小節を埋めて走るリズム / snippet: 長い音に3〜4個の16分音符を添えるだけのリズム。
 * 聴いた評価で、16分音符がぱらぱら入って止まるのが多く、メリハリが無かった。走るリズムを増やし、添えるだけのものは減らす
 */
const SIXTEENTH_BOOST: Record<TempoBand, { run: number; snippet: number }> = {
  slow: { run: 5, snippet: 0.6 },
  medium: { run: 1.5, snippet: 0.9 },
  fast: { run: 1, snippet: 1 },
};
const RHYTHM_LOOKUP = new Map(RHYTHMS.map((rhythm) => [rhythm.id, rhythm]));

/** 16分音符のリズムのうち、走るものを選ばれやすく、添えるだけのものを選ばれにくくする */
export function boostSixteenths(probabilities: Record<string, number>, bpm: number): Record<string, number> {
  const boost = SIXTEENTH_BOOST[tempoBand(bpm)];
  return Object.fromEntries(
    Object.entries(probabilities).map(([id, probability]) => {
      const rhythm = RHYTHM_LOOKUP.get(id);
      const factor = rhythm?.run ? boost.run : rhythm?.sixteenths ? boost.snippet : 1;
      return [id, probability * factor];
    }),
  );
}

/** 走り出したら、この倍率で走るリズムを選ばれやすくする */
const KEEP_RUNNING_FACTOR = 6;
/** 半小節いくつぶん走ったら、止まりやすくするか（4つで2小節） */
const MAX_RUN_HALVES = 4;
const STOP_RUNNING_FACTOR = 0.15;

/**
 * 走り出したら、しばらく走り続けるようにする。
 *
 * @param consecutiveRuns 直前まで、半小節いくつぶん続けて走っているか
 */
export function keepRunning(probabilities: Record<string, number>, consecutiveRuns: number): Record<string, number> {
  if (consecutiveRuns <= 0) return probabilities;
  const factor = consecutiveRuns >= MAX_RUN_HALVES ? STOP_RUNNING_FACTOR : KEEP_RUNNING_FACTOR;
  return Object.fromEntries(
    Object.entries(probabilities).map(([id, probability]) => [
      id,
      RHYTHM_LOOKUP.get(id)?.run ? probability * factor : probability,
    ]),
  );
}

/** 1音を伸ばすだけのリズムに掛ける倍率 */
const LONG_NOTE_FACTOR = 0.4;
/** これ以上の長さの1音だけのリズムを、伸ばすだけのリズムとみなす（拍） */
const LONG_NOTE_BEATS = 1;

/** 伸ばすだけのリズムを選ばれにくくする。聴いた評価で、伸ばしが多いのが目立った */
export function holdBackLongNotes(probabilities: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(probabilities).map(([id, probability]) => {
      const hits = RHYTHM_LOOKUP.get(id)?.hits;
      const longOnly = hits?.length === 1 && hits[0]!.dur >= LONG_NOTE_BEATS;
      return [id, longOnly ? probability * LONG_NOTE_FACTOR : probability];
    }),
  );
}

const HALF_BAR_BEATS = 2;
/** これ以下の長さの音で終わるなら、伸ばして終わるのではなく、次へ向かう短い音とみなす（拍） */
const LEAD_OUT_MAX_BEATS = 0.5;

/**
 * 次の小節へつなぐ形で終わるリズムか。半小節の終わり際を、短い音で締めているもの。
 * 小節の後半がこの形なら、次の小節は頭から鳴らして受け止める（つないだ先が休みだと肩透かしになる）。
 */
export function leadsOut(rhythm: Rhythm): boolean {
  const last = rhythm.hits.at(-1);
  return last !== undefined && last.dur <= LEAD_OUT_MAX_BEATS && last.at + last.dur >= HALF_BAR_BEATS - 0.05;
}

/** 小節の前半で、遅れて入るリズムと休みに掛ける倍率 */
const LATE_ENTRY_FACTOR = 0.6;
const REST_FACTOR = 0.4;

/**
 * 小節の頭から鳴るリズムを選ばれやすくする。前半のリズムにだけ使う。
 * Jevは間のあるリズムを好み、実測では小節の頭で音が鳴るのは34〜47%だった。頭が抜けて聞こえるので偏りを直す。
 */
export function favorDownbeat(probabilities: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(probabilities).map(([id, probability]) => {
      const first = RHYTHMS_BY_ID.get(id)?.hits[0];
      const factor = first === undefined ? REST_FACTOR : first.at > 0 ? LATE_ENTRY_FACTOR : 1;
      return [id, probability * factor];
    }),
  );
}

/**
 * 持ち越しのリズムに掛ける倍率。Jevは「前の音がまだ鳴っている」と伝えられると、持ち越しの4種に
 * 合計で平均74%の確率を置く（実測）。そのまま使うと小節の34〜50%が持ち越しで始まり、
 * 聴いた評価で「少し多い」となった。頭ではっきり吹き始める小節を増やすため、大きく下げる
 */
const TIE_FACTOR = 0.1;
const TIE_IDS = new Set(TIE_RHYTHMS.map((rhythm) => rhythm.id));

export function holdBackTies(probabilities: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(probabilities).map(([id, probability]) => [id, TIE_IDS.has(id) ? probability * TIE_FACTOR : probability]),
  );
}
