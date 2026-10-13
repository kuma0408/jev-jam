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

export type RhythmHit = Pick<CellNote, "at" | "dur" | "accent">;

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
    id: "r-swing-sixteenth-turn",
    bands: ["medium"],
    energy: 4,
    description: "A quick four-note sixteenth flourish, then two calmer eighth notes.",
    hits: [...run(4, 0.25), ...run(2, 0.5, 1)],
  },

  // --- 均等な16分音符（遅いテンポの上で、倍の細かさで動く） ---
  {
    id: "r-grace-long",
    bands: ["slow"],
    energy: 1,
    straight: true,
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
    description: "Long, a quick snapped short note, then long again. Expressive ballad phrasing.",
    hits: [
      { at: 0, dur: 0.75 },
      { at: 0.75, dur: 0.25 },
      { at: 1, dur: 1 },
    ],
  },
  {
    id: "r-sixteenth-burst-long",
    bands: ["slow", "medium"],
    energy: 3,
    straight: true,
    description: "A quick burst of four even sixteenth notes that lands on a long note. Excited, then sings.",
    hits: [...run(4, 0.25), { at: 1, dur: 1, accent: "accent" }],
  },
  {
    id: "r-long-sixteenth-tail",
    bands: ["slow", "medium"],
    energy: 3,
    straight: true,
    description: "Hold one note, then four even sixteenth notes rushing toward the next phrase.",
    hits: [{ at: 0, dur: 1 }, ...run(4, 0.25, 1)],
  },
  {
    id: "r-sixteenth-syncopation",
    bands: ["slow", "medium"],
    energy: 3,
    straight: true,
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
    id: "r-sixteenth-six",
    bands: ["slow"],
    energy: 4,
    straight: true,
    description: "Rest for a moment, then six even sixteenth notes surging forward. Double-time feel.",
    hits: run(6, 0.25, 0.5),
  },
  {
    id: "r-sixteenth-run",
    bands: ["slow"],
    energy: 4,
    straight: true,
    description: "Eight fast, perfectly even sixteenth notes. A double-time run over the slow beat, sheets of sound.",
    hits: run(8, 0.25),
  },
];

const RHYTHMS_BY_ID = new Map(RHYTHMS.map((rhythm) => [rhythm.id, rhythm]));

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
