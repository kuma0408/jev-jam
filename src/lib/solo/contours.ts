// ソロの「音の動き」の一覧。リズム（rhythms.ts）が決めた音数ぶん、スケール上の段を返す。
//
// 特定の演奏の採譜ではなく、スケールの上下行、アルペジオ、囲い込み（エンクロージャー）、
// 1-2-3-5 のデジタルパターンなど、ジャズで広く共有されている語彙を動きとして書いている。
import type { CellNote } from "./cells.ts";

export type ContourNote = Pick<CellNote, "step" | "alt">;

export type Contour = {
  id: string;
  /** Jevに渡す説明。どう動いて、どう聞こえるかを英語で書く */
  description: string;
  /** 求められた数ちょうどの音を返す */
  notes: (count: number) => ContourNote[];
};

type Generator = (count: number) => ContourNote[];

const STEPS_PER_OCTAVE = 7;

function generate(count: number, stepAt: (index: number) => number): ContourNote[] {
  return Array.from({ length: count }, (_, index) => ({ step: stepAt(index) }));
}

/** 一定の幅で上がり続ける（負なら下がり続ける） */
const ladder =
  (start: number, delta: number): Generator =>
  (count) =>
    generate(count, (index) => start + index * delta);

/** 決まった並びを繰り返し、1巡するごとに全体をずらす */
const cycle =
  (pattern: readonly number[], shiftPerCycle: number): Generator =>
  (count) =>
    generate(count, (index) => pattern[index % pattern.length]! + shiftPerCycle * Math.floor(index / pattern.length));

/** 最初の数音を決め打ちし、残りを別の動きでつなぐ */
const lead =
  (first: readonly ContourNote[], rest: Generator): Generator =>
  (count) =>
    count <= first.length ? first.slice(0, count) : [...first, ...rest(count - first.length)];

/**
 * 囲い込み: 上の音と半音下の音で目的の音を挟んでから着地し、その先はアルペジオで上がる。
 * 音が足りないときは、着地する音を優先して残す。
 */
const enclosure =
  (target: number): Generator =>
  (count) => {
    const approach: ContourNote[] = [{ step: target + 1 }, { step: target, alt: -1 }, { step: target }];
    return count <= approach.length
      ? approach.slice(approach.length - count)
      : [...approach, ...ladder(target + 2, 2)(count - approach.length)];
  };

/** 真ん中で頂点（または谷）に達して戻る */
const peak =
  (start: number, direction: 1 | -1): Generator =>
  (count) => {
    const top = Math.floor(count / 2);
    return generate(count, (index) => start + direction * (index <= top ? index : 2 * top - index));
  };

export const CONTOURS: readonly Contour[] = [
  // --- スケールを順に動く ---
  {
    id: "c-rise-from-root",
    description: "Climb the scale step by step from the root. Grounded, steadily building.",
    notes: ladder(0, 1),
  },
  {
    id: "c-rise-from-third",
    description: "Climb the scale step by step from the third. Sweet and gently rising.",
    notes: ladder(2, 1),
  },
  {
    id: "c-rise-from-fifth",
    description: "Climb the scale from the fifth up toward the high root. Arrives with confidence.",
    notes: ladder(4, 1),
  },
  {
    id: "c-fall-from-fifth",
    description: "Step down the scale from the fifth toward the root. Relaxes and resolves.",
    notes: ladder(4, -1),
  },
  {
    id: "c-fall-from-ninth",
    description: "Start on the bright high ninth and step down the scale. Colorful, then settles.",
    notes: ladder(8, -1),
  },
  {
    id: "c-fall-from-high-root",
    description: "Start on the high root and walk down the scale. A strong statement that winds down.",
    notes: ladder(7, -1),
  },

  // --- アルペジオ ---
  {
    id: "c-arpeggio-up-root",
    description: "Chord arpeggio climbing from the root through third, fifth and seventh. Clear and strong.",
    notes: cycle([0, 2, 4, 6], STEPS_PER_OCTAVE),
  },
  {
    id: "c-arpeggio-up-third",
    description: "Arpeggio climbing in thirds from the third up to the ninth and beyond. Colorful bebop reach.",
    notes: ladder(2, 2),
  },
  {
    id: "c-arpeggio-down-seventh",
    description: "Chord arpeggio falling from the seventh down to the root. Settles the phrase.",
    notes: cycle([6, 4, 2, 0], -STEPS_PER_OCTAVE),
  },
  {
    id: "c-arpeggio-down-ninth",
    description: "Arpeggio falling in thirds from the high ninth. Starts colorful and comes home.",
    notes: ladder(8, -2),
  },

  // --- コルトレーン風のパターン ---
  {
    id: "c-digital-up",
    description: "Four-note cells root-second-third-fifth, chained higher each time. Driving, modern (John Coltrane style).",
    notes: cycle([0, 1, 2, 4], 2),
  },
  {
    id: "c-digital-down",
    description: "Four-note cells fifth-third-second-root, chained lower each time. Relentless descent (John Coltrane style).",
    notes: cycle([4, 2, 1, 0], -2),
  },
  {
    id: "c-wide-leaps",
    description: "Wide, angular leaps that zigzag upward. Bold, modern and a little wild (John Coltrane style).",
    notes: (count) => generate(count, (index) => (index % 2 === 0 ? index : index + 5)),
  },

  // --- ジグザグと山なり ---
  {
    id: "c-zigzag-up",
    description: "Zigzag in thirds working upward: up a third, back a step. Angular and energetic.",
    notes: (count) => generate(count, (index) => Math.floor(index / 2) + (index % 2 === 0 ? 0 : 2)),
  },
  {
    id: "c-zigzag-down",
    description: "Zigzag in thirds working downward from the seventh. Angular and playful.",
    notes: (count) => generate(count, (index) => 6 - Math.floor(index / 2) - (index % 2 === 0 ? 0 : 2)),
  },
  {
    id: "c-arch",
    description: "Rise up the scale to a peak in the middle, then come back down. A complete, rounded gesture.",
    notes: peak(2, 1),
  },
  {
    id: "c-valley",
    description: "Dip down the scale from the seventh, then climb back up. Tension that releases upward.",
    notes: peak(6, -1),
  },

  // --- ビバップの語彙 ---
  {
    id: "c-enclose-third",
    description: "Bebop enclosure: a note above, a chromatic note below, then land on the third. Very idiomatic.",
    notes: enclosure(2),
  },
  {
    id: "c-enclose-root",
    description: "Bebop enclosure: a note above, a chromatic note below, then land on the root. Fully resolved.",
    notes: enclosure(0),
  },
  {
    id: "c-enclose-fifth",
    description: "Bebop enclosure: a note above, a chromatic note below, then land on the fifth.",
    notes: enclosure(4),
  },
  {
    id: "c-approach-arpeggio",
    description: "Slide into the third from a half step below, then arpeggiate upward. Classic bebop opening.",
    notes: (count) => (count === 1 ? [{ step: 2 }] : lead([{ step: 2, alt: -1 }], ladder(2, 2))(count)),
  },
  {
    id: "c-chromatic-fall",
    description: "Chromatic passing line slipping down from the fifth. Smooth and slippery.",
    notes: lead([{ step: 4 }, { step: 4, alt: -1 }], ladder(3, -1)),
  },
  {
    id: "c-turn-third",
    description: "Circle around the third: third, note above, third, note below. Ornamental and vocal.",
    notes: cycle([2, 3, 2, 1], 0),
  },

  // --- 反復と揺れ（マイルス風の少ない音） ---
  {
    id: "c-repeat-fifth",
    description: "Repeat the same note, the fifth, over and over. Rhythmic, insistent and cool (Miles Davis style).",
    notes: ladder(4, 0),
  },
  {
    id: "c-repeat-high-root",
    description: "Repeat the high root over and over. A ringing, declarative call (Miles Davis style).",
    notes: ladder(7, 0),
  },
  {
    id: "c-rock-fifth-seventh",
    description: "Rock back and forth between the fifth and the seventh. A groovy two-note riff.",
    notes: cycle([4, 6], 0),
  },
  {
    id: "c-rock-third-root",
    description: "Rock back and forth between the third and the root. A simple, bluesy call.",
    notes: cycle([2, 0], 0),
  },

  // --- ペンタトニックとブルース ---
  {
    id: "c-pentatonic-up",
    description: "Pentatonic line climbing upward. Soulful, open and uplifting.",
    notes: cycle([0, 1, 2, 4, 5], STEPS_PER_OCTAVE),
  },
  {
    id: "c-pentatonic-down",
    description: "Pentatonic line falling from the high root. Bluesy, soulful and easy to sing.",
    notes: cycle([7, 5, 4, 2, 1], -STEPS_PER_OCTAVE),
  },
  {
    id: "c-blue-slide",
    description: "Bluesy: slide into the third from a half step below, drop to the root, then keep falling. Gritty and vocal.",
    notes: (count) =>
      count === 1 ? [{ step: 2 }] : lead([{ step: 2, alt: -1 }, { step: 2 }, { step: 0 }], ladder(-1, -1))(count),
  },

  // --- 跳躍 ---
  {
    id: "c-leap-up-step-down",
    description: "Leap up from the root to the seventh, then step back down the scale. Dramatic, then graceful.",
    notes: lead([{ step: 0 }], ladder(6, -1)),
  },
  {
    id: "c-leap-down-step-up",
    description: "Drop from the high ninth down to the third, then climb the scale again. A sigh that recovers.",
    notes: lead([{ step: 8 }], ladder(2, 1)),
  },
];

const CONTOURS_BY_ID = new Map(CONTOURS.map((contour) => [contour.id, contour]));

export function contourById(id: string): Contour {
  const contour = CONTOURS_BY_ID.get(id);
  if (!contour) {
    throw new Error(`音の動きの一覧に無いIDです: ${id}`);
  }
  return contour;
}
