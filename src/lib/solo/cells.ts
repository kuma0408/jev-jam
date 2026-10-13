// ソロの材料になる「半小節の型」の一覧（ADR 0008）。
//
// 型は、リズムと音の動きのセット。音はコードに対する度数で書くので、どのコードにも当てはめられる。
// 特定の演奏の採譜ではなく、アルペジオ、スケールの上下行、囲い込み（エンクロージャー）、
// 1-2-3-5 のデジタルパターンなど、ジャズで広く共有されている語彙を型にしている。

export type CellNote = {
  /** 型の頭からの拍数（0以上2未満） */
  at: number;
  /** 長さ（拍） */
  dur: number;
  /**
   * コードのスケール上の段。0=ルート、1=9th、2=3rd、3=11th、4=5th、5=13th、6=7th。
   * 7で1オクターブ上のルート、-1で下の7thというように、範囲の外はオクターブ違いの同じ度数になる
   */
  step: number;
  /** スケールの音からずらす半音数。-1で半音下からのアプローチ */
  alt?: number;
  /** ghost: 飲み込むように弱く / accent: 強く */
  accent?: "ghost" | "accent";
};

export type CellDensity = "space" | "eighths" | "sixteenths" | "triplets";

export type Cell = {
  id: string;
  /** Jevに渡す説明。どんな動きで、どう聞こえるかを英語で書く */
  description: string;
  density: CellDensity;
  /** true ならスウィングさせない（3連符のように位置が決まっている型） */
  straight?: boolean;
  notes: readonly CellNote[];
};

/** 8分音符を頭から並べる */
function eighths(steps: readonly number[], startAt = 0): CellNote[] {
  return steps.map((step, index) => ({ at: startAt + index * 0.5, dur: 0.5, step }));
}

/** 16分音符を頭から並べる */
function sixteenths(steps: readonly number[], startAt = 0): CellNote[] {
  return steps.map((step, index) => ({ at: startAt + index * 0.25, dur: 0.25, step }));
}

const THIRD = 1 / 3;

export const CELLS: readonly Cell[] = [
  // --- 間を作る型 ---
  { id: "rest", density: "space", description: "Silence. Play nothing and let the phrase breathe.", notes: [] },
  {
    id: "pickup",
    density: "space",
    description: "Stay silent, then two quick pickup notes at the very end that lead into the next phrase.",
    notes: eighths([4, 6], 1),
  },
  {
    id: "long-third",
    density: "space",
    description: "One long, singing note on the third. Lyrical and unhurried, lots of space (Miles Davis style).",
    notes: [{ at: 0, dur: 1.75, step: 2 }],
  },
  {
    id: "long-seventh-late",
    density: "space",
    description: "Wait, then enter late on the off-beat with one long seventh. Cool and laid-back.",
    notes: [{ at: 0.5, dur: 1.5, step: 6 }],
  },
  {
    id: "long-ninth",
    density: "space",
    description: "One long, floating high ninth held over the chord. Airy and open.",
    notes: [{ at: 0, dur: 1.75, step: 8 }],
  },
  {
    id: "long-fifth-late",
    density: "space",
    description: "Silence for one beat, then one plain sustained fifth. Calm and neutral.",
    notes: [{ at: 1, dur: 1, step: 4 }],
  },
  {
    id: "sigh-down",
    density: "space",
    description: "Two slow notes falling from the fifth to the third, like a lyrical sigh.",
    notes: [
      { at: 0, dur: 1, step: 4 },
      { at: 1, dur: 1, step: 2 },
    ],
  },
  {
    id: "short-long-call",
    density: "space",
    description: "A short seventh answered by a long fifth: a simple two-note call that leaves room for an answer.",
    notes: [
      { at: 0, dur: 0.5, step: 6, accent: "accent" },
      { at: 0.5, dur: 1.5, step: 4 },
    ],
  },
  {
    id: "repeated-stabs",
    density: "space",
    description: "Three short, detached repeated notes on the fifth. Rhythmic, sparse and cool (Miles Davis style).",
    notes: [
      { at: 0.5, dur: 0.25, step: 4 },
      { at: 1, dur: 0.25, step: 4 },
      { at: 1.5, dur: 0.4, step: 4, accent: "accent" },
    ],
  },
  {
    id: "charleston",
    density: "space",
    description: "Charleston rhythm: a note on the beat, then a syncopated answer just before the next beat.",
    notes: [
      { at: 0, dur: 0.75, step: 2 },
      { at: 1.5, dur: 0.5, step: 4, accent: "accent" },
    ],
  },
  {
    id: "offbeat-pair",
    density: "space",
    description: "Two short syncopated notes, both on off-beats, rising from the seventh to the root. Playful.",
    notes: [
      { at: 0.5, dur: 0.4, step: 6, accent: "accent" },
      { at: 1.5, dur: 0.5, step: 7, accent: "accent" },
    ],
  },

  // --- 8分音符の型 ---
  {
    id: "arpeggio-up",
    density: "eighths",
    description: "Chord arpeggio climbing from the root: root, third, fifth, seventh. Clear and strong.",
    notes: eighths([0, 2, 4, 6]),
  },
  {
    id: "arpeggio-down",
    density: "eighths",
    description: "Chord arpeggio falling from the seventh down to the root. Settles the phrase.",
    notes: eighths([6, 4, 2, 0]),
  },
  {
    id: "upper-arpeggio-up",
    density: "eighths",
    description: "Arpeggio climbing from the third up to the ninth. Reaches into colorful upper notes (bebop style).",
    notes: eighths([2, 4, 6, 8]),
  },
  {
    id: "upper-arpeggio-down",
    density: "eighths",
    description: "Arpeggio falling from the high ninth down to the third. Colorful, then resolves.",
    notes: eighths([8, 6, 4, 2]),
  },
  {
    id: "digital-up",
    density: "eighths",
    description: "Four-note cell root, second, third, fifth going up. Driving, modern pattern (John Coltrane style).",
    notes: eighths([0, 1, 2, 4]),
  },
  {
    id: "digital-down",
    density: "eighths",
    description: "Four-note cell fifth, third, second, root going down. Driving pattern that lands home (John Coltrane style).",
    notes: eighths([4, 2, 1, 0]),
  },
  {
    id: "digital-from-third",
    density: "eighths",
    description: "Four-note cell starting on the third: third, fourth, fifth, seventh. Pushes the line upward.",
    notes: eighths([2, 3, 4, 6]),
  },
  {
    id: "scale-up-from-third",
    density: "eighths",
    description: "Smooth stepwise scale run rising from the third. Builds gently.",
    notes: eighths([2, 3, 4, 5]),
  },
  {
    id: "scale-down-from-fifth",
    density: "eighths",
    description: "Smooth stepwise scale run falling from the fifth. Relaxes the tension.",
    notes: eighths([4, 3, 2, 1]),
  },
  {
    id: "scale-down-from-ninth",
    density: "eighths",
    description: "Stepwise scale run falling from the high ninth. Starts bright and comes down.",
    notes: eighths([8, 7, 6, 5]),
  },
  {
    id: "scale-up-to-root",
    density: "eighths",
    description: "Stepwise scale run rising from the fifth up to the high root. Arrives with confidence.",
    notes: eighths([4, 5, 6, 7]),
  },
  {
    id: "enclosure-third",
    density: "eighths",
    description: "Bebop enclosure: a note above, then a chromatic note below, then land on the third and hold it.",
    notes: [
      { at: 0, dur: 0.5, step: 3 },
      { at: 0.5, dur: 0.5, step: 2, alt: -1 },
      { at: 1, dur: 1, step: 2, accent: "accent" },
    ],
  },
  {
    id: "enclosure-root",
    density: "eighths",
    description: "Bebop enclosure: a note above, then a chromatic note below, then land on the root and hold it. Very resolved.",
    notes: [
      { at: 0, dur: 0.5, step: 1 },
      { at: 0.5, dur: 0.5, step: 0, alt: -1 },
      { at: 1, dur: 1, step: 0, accent: "accent" },
    ],
  },
  {
    id: "enclosure-fifth",
    density: "eighths",
    description: "Bebop enclosure: a note above, then a chromatic note below, then land on the fifth and hold it.",
    notes: [
      { at: 0, dur: 0.5, step: 5 },
      { at: 0.5, dur: 0.5, step: 4, alt: -1 },
      { at: 1, dur: 1, step: 4, accent: "accent" },
    ],
  },
  {
    id: "approach-arpeggio",
    density: "eighths",
    description: "Slide into the third from a half step below, then arpeggiate up to the seventh. Classic bebop opening.",
    notes: [
      { at: 0, dur: 0.5, step: 2, alt: -1, accent: "ghost" },
      { at: 0.5, dur: 0.5, step: 2 },
      { at: 1, dur: 0.5, step: 4 },
      { at: 1.5, dur: 0.5, step: 6 },
    ],
  },
  {
    id: "chromatic-down-from-fifth",
    density: "eighths",
    description: "Chromatic passing line falling from the fifth to the third. Smooth, slippery bebop color.",
    notes: [
      { at: 0, dur: 0.5, step: 4 },
      { at: 0.5, dur: 0.5, step: 4, alt: -1 },
      { at: 1, dur: 0.5, step: 3 },
      { at: 1.5, dur: 0.5, step: 2 },
    ],
  },
  {
    id: "turn-fifth",
    density: "eighths",
    description: "A turn around the fifth, then a drop to the third. Ornamental and melodic.",
    notes: eighths([4, 5, 4, 2]),
  },
  {
    id: "zigzag-up",
    density: "eighths",
    description: "Zigzag in thirds climbing upward: up a third, back a step, up a third. Angular and energetic.",
    notes: eighths([0, 2, 1, 3]),
  },
  {
    id: "zigzag-down",
    density: "eighths",
    description: "Zigzag in thirds working downward from the seventh. Angular and playful.",
    notes: eighths([6, 4, 5, 3]),
  },
  {
    id: "pentatonic-down",
    density: "eighths",
    description: "Pentatonic line falling from the sixth: bluesy, soulful and easy to sing.",
    notes: eighths([5, 4, 2, 1]),
  },
  {
    id: "pentatonic-up",
    density: "eighths",
    description: "Pentatonic line climbing into the upper register: fifth, sixth, high root, high ninth. Soulful and uplifting.",
    notes: eighths([4, 5, 7, 8]),
  },
  {
    id: "late-descend",
    density: "eighths",
    description: "Start late on the off-beat, then three notes stepping down from the third to the root. Relaxed.",
    notes: eighths([2, 1, 0], 0.5),
  },
  {
    id: "riff-rock",
    density: "eighths",
    description: "Two-note riff rocking between the fifth and the seventh with accents on the off-beats. Groovy and insistent.",
    notes: [
      { at: 0, dur: 0.5, step: 4 },
      { at: 0.5, dur: 0.5, step: 6, accent: "accent" },
      { at: 1, dur: 0.5, step: 4 },
      { at: 1.5, dur: 0.5, step: 6, accent: "accent" },
    ],
  },
  {
    id: "blue-fall",
    density: "eighths",
    description: "Bluesy fall: seventh, then a flatted-fifth blue note that resolves up to the fifth and holds. Gritty.",
    notes: [
      { at: 0, dur: 0.5, step: 6 },
      { at: 0.5, dur: 0.5, step: 4, alt: -1 },
      { at: 1, dur: 1, step: 4 },
    ],
  },
  {
    id: "blue-slide-third",
    density: "eighths",
    description: "Quick chromatic slide up into the third, held, then drop to the root. Bluesy and vocal.",
    notes: [
      { at: 0, dur: 0.25, step: 2, alt: -1, accent: "ghost" },
      { at: 0.25, dur: 0.75, step: 2, accent: "accent" },
      { at: 1, dur: 1, step: 0 },
    ],
  },

  // --- 16分音符の型 ---
  {
    id: "run-up-16",
    density: "sixteenths",
    description: "Fast sixteenth-note scale run rushing upward a full octave. Sheets of sound, high energy (John Coltrane style).",
    notes: sixteenths([0, 1, 2, 3, 4, 5, 6, 7]),
  },
  {
    id: "run-down-16",
    density: "sixteenths",
    description: "Fast sixteenth-note scale run cascading down from the high ninth. Brilliant, high energy.",
    notes: sixteenths([8, 7, 6, 5, 4, 3, 2, 1]),
  },
  {
    id: "arpeggio-wave-16",
    density: "sixteenths",
    description: "Sixteenth-note arpeggio sweeping up to the ninth and back down. A big, dramatic wave.",
    notes: sixteenths([0, 2, 4, 6, 8, 6, 4, 2]),
  },
  {
    id: "digital-chain-16",
    density: "sixteenths",
    description: "Sixteenth-note chain of four-note cells climbing: root-second-third-fifth, then the same from the third. Relentless (John Coltrane style).",
    notes: sixteenths([0, 1, 2, 4, 2, 3, 4, 6]),
  },
  {
    id: "digital-chain-down-16",
    density: "sixteenths",
    description: "Sixteenth-note chain of four-note cells tumbling downward from the high ninth. Intense, then lands on the third.",
    notes: sixteenths([8, 6, 5, 4, 6, 4, 3, 2]),
  },
  {
    id: "broken-thirds-16",
    density: "sixteenths",
    description: "Sixteenth-note broken thirds climbing step by step. Busy, virtuosic pattern.",
    notes: sixteenths([0, 2, 1, 3, 2, 4, 3, 5]),
  },
  {
    id: "burst-then-long",
    density: "sixteenths",
    description: "A quick sixteenth-note burst up the scale that lands on a long seventh. Excited, then sings.",
    notes: [...sixteenths([2, 3, 4, 5]), { at: 1, dur: 1, step: 6, accent: "accent" }],
  },
  {
    id: "long-then-burst",
    density: "sixteenths",
    description: "Hold the fifth, then a quick sixteenth-note burst running down toward the next phrase.",
    notes: [{ at: 0, dur: 1, step: 4 }, ...sixteenths([4, 3, 2, 1], 1)],
  },
  {
    id: "turn-ornament-16",
    density: "sixteenths",
    description: "A quick sixteenth-note turn around the third, then two calm notes up to the fifth. Decorative.",
    notes: [...sixteenths([2, 3, 2, 1]), { at: 1, dur: 0.5, step: 2 }, { at: 1.5, dur: 0.5, step: 4 }],
  },
  {
    id: "the-lick",
    density: "sixteenths",
    description: "The famous jazz cliche lick: four quick notes up the scale, then step back and drop below the root. Witty quotation.",
    notes: [...sixteenths([0, 1, 2, 3]), { at: 1, dur: 0.5, step: 1 }, { at: 1.5, dur: 0.5, step: -1 }],
  },
  {
    id: "enclosure-run-16",
    density: "sixteenths",
    description: "Sixteenth notes: enclose the third from above and below, shoot up the arpeggio to the seventh, then fall back to the third.",
    notes: [
      { at: 0, dur: 0.25, step: 3 },
      { at: 0.25, dur: 0.25, step: 2, alt: -1 },
      ...sixteenths([2, 4, 6, 5, 4, 2], 0.5),
    ],
  },

  // --- 3連符の型 ---
  {
    id: "triplet-arpeggio-up",
    density: "triplets",
    straight: true,
    description: "Triplet arpeggio rolling up from the root, landing on a long seventh. Flowing and elegant.",
    notes: [
      { at: 0, dur: THIRD, step: 0 },
      { at: THIRD, dur: THIRD, step: 2 },
      { at: 2 * THIRD, dur: THIRD, step: 4 },
      { at: 1, dur: 1, step: 6, accent: "accent" },
    ],
  },
  {
    id: "triplet-arpeggio-down",
    density: "triplets",
    straight: true,
    description: "Triplet arpeggio rolling down from the high ninth, landing on a long third. Graceful descent.",
    notes: [
      { at: 0, dur: THIRD, step: 8 },
      { at: THIRD, dur: THIRD, step: 6 },
      { at: 2 * THIRD, dur: THIRD, step: 4 },
      { at: 1, dur: 1, step: 2, accent: "accent" },
    ],
  },
  {
    id: "quarter-triplet",
    density: "triplets",
    straight: true,
    description: "Three broad, evenly stretched notes across two beats, falling fifth-third-second. Laid-back, floats over the beat.",
    notes: [
      { at: 0, dur: 0.6, step: 4 },
      { at: 2 * THIRD, dur: 0.6, step: 2 },
      { at: 4 * THIRD, dur: 0.6, step: 1 },
    ],
  },
  {
    id: "long-then-triplet-turn",
    density: "triplets",
    straight: true,
    description: "Hold the fifth, then a quick triplet turn around the third. A singing note with a flourish.",
    notes: [
      { at: 0, dur: 1, step: 4 },
      { at: 1, dur: THIRD, step: 2 },
      { at: 1 + THIRD, dur: THIRD, step: 3 },
      { at: 1 + 2 * THIRD, dur: THIRD, step: 2 },
    ],
  },
];

const CELLS_BY_ID = new Map(CELLS.map((cell) => [cell.id, cell]));

export function cellById(id: string): Cell {
  const cell = CELLS_BY_ID.get(id);
  if (!cell) {
    throw new Error(`型の一覧に無いIDです: ${id}`);
  }
  return cell;
}

/** これ以上のテンポでは16分音符が速すぎて演奏にならないので、型から外す */
const SIXTEENTHS_MAX_BPM = 160;

/** テンポに合った型だけを返す */
export function cellsForTempo(bpm: number): Cell[] {
  return CELLS.filter((cell) => bpm <= SIXTEENTHS_MAX_BPM || cell.density !== "sixteenths");
}
