import type { DecisionClient } from "../jev/client.ts";
import { sampleFromDistribution } from "../music/sample.ts";
import type { SoloBar, SoloMemo } from "./api.ts";
import type { Cell } from "./cells.ts";
import { CONTOURS, type Contour, contourById } from "./contours.ts";
import { ENERGY, type Energy, TOUCH_CUE, type Touch } from "./energy.ts";
import type { ChoiceQuestion } from "./questions.ts";
import { type Dynamics, type Shape, renderCells } from "./render-cells.ts";
import { RHYTHMS, type Rhythm, boostSixteenths, rhythmById, rhythmsFor } from "./rhythms.ts";

export type PhraseBarsInput = {
  /** ソロを用意したいコード。次に選べる候補すべてを一度に渡す */
  chords: readonly string[];
  bpm: number;
  previousPitch: number;
  range: { low: number; high: number };
  /** 直前の小節の記録。cells に [前半のリズム, 前半の動き, 後半のリズム, 後半の動き] のIDが入る */
  memo: SoloMemo;
  /** 盛り上がり。つまみの値に、ユーザーの叩き方を足したもの */
  energy: Energy;
  /** ユーザーが伴奏をどれだけ叩いているか */
  touch?: Touch;
  /** 4小節のまとまりの中で、これから作る小節が何番目か（0〜3） */
  barInPhrase?: number;
};

/** 前のフレーズとの関係。人のアドリブで「考えて吹いている」ように聞こえる部分を、Jevに選ばせる */
export type Relation = "develop-rhythm" | "develop-melody" | "echo" | "contrast" | "space";

const RELATIONS: Record<Relation, { label: string; description: string }> = {
  "develop-rhythm": {
    label: "リズムを引き継ぐ",
    description: "Keep the rhythm of the previous phrase but change the notes. Sounds like developing a motif.",
  },
  "develop-melody": {
    label: "音の形を引き継ぐ",
    description: "Keep the melodic shape of the previous phrase but play it with a different rhythm.",
  },
  echo: {
    label: "繰り返す",
    description: "Repeat the previous idea over the new chord, like a sequence. Makes the solo feel intentional.",
  },
  contrast: {
    label: "対照的に",
    description: "Do something clearly different from the previous phrase. A fresh idea.",
  },
  space: {
    label: "間で応える",
    description: "Answer the previous phrase with space. Play very little and let it sink in.",
  },
};

/** 4小節のまとまりの中の位置。Jevは数えるのが苦手なので、番号ではなく役割で伝える */
const PHRASE_POSITIONS = [
  "Opening bar of a new four-bar phrase. State a clear idea.",
  "Second bar of the phrase. Continue or answer the idea just stated.",
  "Third bar of the phrase. Build tension toward the end of the phrase.",
  "Last bar of the four-bar phrase. Conclude the thought, or leave space to set up the next phrase.",
];

/**
 * 「間で応える」の選ばれやすさ。Jevは間を好み、実測では15小節中6回これを選んだ。
 * 盛り上がっているのにソロが黙ってしまわないよう、盛り上がりが高いほど選ばれにくくする
 */
export function spaceBias(energy: Energy): number {
  return [1.5, 0.6, 0.3, 0.1][energy - 1]!;
}

const MAX_HISTORY = 4;
/** 「対照的に」のとき、前の小節で使ったものに掛ける倍率 */
const CONTRAST_PENALTY = 0.05;

const DYNAMICS: Record<Dynamics, string> = {
  soft: "Quiet and intimate, almost whispered.",
  medium: "Relaxed, conversational volume.",
  loud: "Strong and projecting, full of energy.",
};

const SHAPES: Record<Shape, string> = {
  steady: "Keep the same intensity through the bar.",
  crescendo: "Start gently and grow louder toward the end of the bar.",
  decrescendo: "Start strong and fade away toward the end of the bar.",
};

/** 盛り上がりごとの、強弱の選ばれやすさ */
const DYNAMICS_BIAS: Record<Energy, Record<Dynamics, number>> = {
  1: { soft: 3, medium: 1, loud: 0.2 },
  2: { soft: 1.5, medium: 1.5, loud: 0.6 },
  3: { soft: 0.6, medium: 1.5, loud: 1.5 },
  4: { soft: 0.2, medium: 1, loud: 3 },
};

/** 直前に使ったものは、この倍率で確率を下げる */
const RECENT_PENALTY = 0.3;
const REST_ID = "r-rest";

/**
 * 最近使ったリズムや動きの確率を下げる。Jevは同じ状況には同じ分布を返しやすいので、
 * そのまま抽選すると同じフレーズが続きやすい。使った回数が多いものほど大きく下げる。
 * 休みは繰り返してよいので下げない。
 *
 * @param recent 最近使ったID。同じIDが複数回入っていれば、その回数ぶん下げる
 */
export function penalizeRecent(probabilities: Record<string, number>, recent: readonly string[]): Record<string, number> {
  return Object.fromEntries(
    Object.entries(probabilities).map(([id, probability]) => {
      const uses = id === REST_ID ? 0 : recent.filter((used) => used === id).length;
      return [id, probability * RECENT_PENALTY ** uses];
    }),
  );
}

const RHYTHM_ENERGY = new Map(RHYTHMS.map((rhythm) => [rhythm.id, rhythm.energy]));

/**
 * リズムの確率を、盛り上がりのつまみに近い音数のものへ寄せる。
 * Jevにも合図として伝えるが、つまみを動かしたら必ず音に表れるよう、ルールでも効かせる。
 */
export function biasByEnergy(probabilities: Record<string, number>, energy: Energy): Record<string, number> {
  return Object.fromEntries(
    Object.entries(probabilities).map(([id, probability]) => {
      const distance = (RHYTHM_ENERGY.get(id) ?? energy) - energy;
      return [id, probability / (1 + distance * distance)];
    }),
  );
}

function tempoFeel(bpm: number): string {
  return bpm < 100 ? "slow ballad tempo" : bpm <= 180 ? "medium swing tempo" : "fast, up-tempo swing";
}

function question(instructions: string, options: readonly { id: string; description: string }[]): ChoiceQuestion {
  return {
    type: "choice",
    instructions,
    criteria: Object.fromEntries(options.map((option) => [option.id, option.description])),
  };
}

function describe(rhythm: Rhythm, contour: Contour): string {
  return rhythm.hits.length === 0 ? rhythm.description : `Rhythm: ${rhythm.description} Melody: ${contour.description}`;
}

/** リズムと音の動きを組み合わせて、半小節ぶんのフレーズにする */
function compose(rhythm: Rhythm, contour: Contour): Cell {
  const steps = contour.notes(rhythm.hits.length);
  return {
    ...(rhythm.straight ? { straight: true } : {}),
    notes: rhythm.hits.map((hit, index) => ({ ...hit, ...steps[index]! })),
  };
}

function label(rhythm: Rhythm, contour: Contour): string {
  const name = (id: string) => id.slice(2);
  return rhythm.hits.length === 0 ? name(rhythm.id) : `${name(rhythm.id)} / ${name(contour.id)}`;
}

/**
 * Jevに1小節ぶんのソロを選ばせる。半小節ごとに「リズム」と「音の動き」を別々に選ばせ、組み合わせて音にする。
 * リズムと音を一体にした型から選ばせる方式より組み合わせが桁違いに多く、同じフレーズに聞こえにくい。
 *
 * 前半を決めてから後半を聞くので、2つがつながった1つのフレーズになりやすい。
 * 次に選べるコードすべての分を、コードごとの質問として1回のリクエストに詰める。
 */
export async function generatePhraseBars(
  client: DecisionClient,
  input: PhraseBarsInput,
  random: () => number = Math.random,
): Promise<SoloBar[]> {
  const rhythms = rhythmsFor(input.bpm);
  // 履歴が無く直前の小節だけが渡されたときは、それを1小節ぶんの履歴として扱う
  const history = input.memo.history ?? (input.memo.cells ? [{ chord: "", cells: input.memo.cells }] : []);
  const recent = history.at(-1)?.cells ?? [];
  /** 直近の数小節で使ったすべてのID。同じものを何度も使っていれば、そのぶん重複して入る */
  const used = history.flatMap((bar) => bar.cells);
  /** 直近2小節の両方で使われているか。そうなら、もう引き継がせない */
  const overused = (id: string | undefined) =>
    id !== undefined && history.length >= 2 && history.slice(-2).every((bar) => bar.cells.includes(id));

  /** 送り返されたIDを、一覧にあるものだけ説明文に直す */
  const describeBar = (bar: { chord: string; cells: readonly string[] }): string => {
    const texts = [
      ...RHYTHMS.filter((rhythm) => bar.cells.includes(rhythm.id)),
      ...CONTOURS.filter((contour) => bar.cells.includes(contour.id)),
    ].map((item) => item.description);
    return `${bar.chord ? `Over ${bar.chord}: ` : ""}${texts.join(" ")}`;
  };

  const baseState = {
    style: "jazz / neo soul jam session, improvised horn solo",
    tempo: `${input.bpm} BPM, ${tempoFeel(input.bpm)}`,
    bandleader_cue: ENERGY[input.energy].cue,
    ...(input.touch && input.touch !== "none" ? { accompanist: TOUCH_CUE[input.touch] } : {}),
    where_we_are: PHRASE_POSITIONS[input.barInPhrase ?? 0] ?? PHRASE_POSITIONS[0],
    solo_so_far: history.length > 0 ? history.map(describeBar) : "nothing yet, the solo is just starting",
    ...(input.memo.dynamics ? { previous_bar_volume: input.memo.dynamics } : {}),
  };

  // 前の小節から引き継ぐフレーズ。前半が休みなら後半を使う
  const [r1, c1, r2, c2] = recent;
  const motif =
    r1 && c1 && r1 !== REST_ID ? { rhythm: r1, contour: c1 } : r2 && c2 && r2 !== REST_ID ? { rhythm: r2, contour: c2 } : null;
  const motifRhythm = overused(motif?.rhythm) ? undefined : rhythms.find((rhythm) => rhythm.id === motif?.rhythm);
  const motifContour = overused(motif?.contour) ? undefined : CONTOURS.find((contour) => contour.id === motif?.contour);

  const pickRhythm = (probabilities: Record<string, number>, used: readonly string[], energy = input.energy) =>
    rhythmById(
      sampleFromDistribution(
        biasByEnergy(boostSixteenths(penalizeRecent(probabilities, used), input.bpm), energy),
        random,
      ),
    );
  const pickContour = (probabilities: Record<string, number>, used: readonly string[]) =>
    contourById(sampleFromDistribution(penalizeRecent(probabilities, used), random));

  const startedAt = performance.now();
  const firstQuestions: Record<string, ChoiceQuestion> = {};
  input.chords.forEach((chord, index) => {
    firstQuestions[`rhythm_first_${index}`] = question(
      `Pick the rhythm the improvising soloist plays in the first half of this bar, over the chord ${chord}. Follow the bandleader's cue. A great solo breathes: it answers the previous phrase, mixes movement with space, and does not repeat the same rhythm.`,
      rhythms,
    );
    firstQuestions[`contour_first_${index}`] = question(
      `Pick how the melody moves in the first half of this bar, over the chord ${chord}. It should answer or develop the previous phrase rather than repeat it.`,
      CONTOURS,
    );
  });
  firstQuestions.dynamics = question(
    "How loud should the soloist play this bar, given the bandleader's cue and how the solo has been going?",
    Object.entries(DYNAMICS).map(([id, description]) => ({ id, description })),
  );
  firstQuestions.shape = question(
    "How should the intensity move within this bar?",
    Object.entries(SHAPES).map(([id, description]) => ({ id, description })),
  );
  if (history.length > 0) {
    firstQuestions.relation = question(
      "How should this bar relate to the previous phrase? Good solos develop ideas instead of only stringing new ones together, but too much repetition gets dull.",
      Object.entries(RELATIONS).map(([id, { description }]) => ({ id, description })),
    );
  }

  const first = await client.decide(baseState, firstQuestions);
  // 同じ関係が続くと単調になるので、直前に選ばれた関係は選ばれにくくする
  const relation = first.relation
    ? (sampleFromDistribution(
        Object.fromEntries(
          Object.entries(
            penalizeRecent(first.relation.probabilities, input.memo.relation ? [input.memo.relation] : []),
          ).map(([id, odd]) => [id, id === "space" ? odd * spaceBias(input.energy) : odd]),
        ),
        random,
      ) as Relation)
    : null;

  const firstHalves = input.chords.map((_, index) => {
    const rhythmOdds = first[`rhythm_first_${index}`]!.probabilities;
    const contourOdds = first[`contour_first_${index}`]!.probabilities;
    // 「対照的に」では、前の小節で使ったものをほぼ選ばせない
    const contrasted = (odds: Record<string, number>) =>
      Object.fromEntries(Object.entries(odds).map(([id, odd]) => [id, recent.includes(id) ? odd * CONTRAST_PENALTY : odd]));

    const keepRhythm = relation === "develop-rhythm" || relation === "echo";
    const keepContour = relation === "develop-melody" || relation === "echo";
    const rhythm =
      keepRhythm && motifRhythm
        ? motifRhythm
        : relation === "space"
          ? pickRhythm(rhythmOdds, used, 1)
          : pickRhythm(relation === "contrast" ? contrasted(rhythmOdds) : rhythmOdds, used);
    const contour =
      keepContour && motifContour
        ? motifContour
        : pickContour(relation === "contrast" ? contrasted(contourOdds) : contourOdds, used);
    return { rhythm, contour };
  });
  const dynamicsBias = DYNAMICS_BIAS[input.energy];
  const dynamics = sampleFromDistribution(
    Object.fromEntries(
      Object.entries(first.dynamics!.probabilities).map(([id, probability]) => [
        id,
        probability * (dynamicsBias[id as Dynamics] ?? 1),
      ]),
    ),
    random,
  ) as Dynamics;
  const shape = sampleFromDistribution(first.shape!.probabilities, random) as Shape;

  const secondQuestions: Record<string, ChoiceQuestion> = {};
  input.chords.forEach((chord, index) => {
    secondQuestions[`rhythm_second_${index}`] = question(
      `Pick the rhythm for the second half of this bar over the chord ${chord}, continuing from the first half so the two parts form one musical sentence. If the first half was busy, consider space; if it was sparse, consider movement.`,
      rhythms,
    );
    secondQuestions[`contour_second_${index}`] = question(
      `Pick how the melody moves in the second half of this bar over the chord ${chord}, so that it completes the idea started in the first half.`,
      CONTOURS,
    );
  });
  const second = await client.decide(
    {
      ...baseState,
      volume_of_this_bar: dynamics,
      first_half_of_this_bar_by_chord: Object.fromEntries(
        input.chords.map((chord, index) => [chord, describe(firstHalves[index]!.rhythm, firstHalves[index]!.contour)]),
      ),
    },
    secondQuestions,
  );
  const latencyMs = performance.now() - startedAt;

  return input.chords.map((chord, index) => {
    const firstHalf = firstHalves[index]!;
    const usedSoFar = [...used, firstHalf.rhythm.id, firstHalf.contour.id];
    const secondHalf = {
      rhythm: pickRhythm(second[`rhythm_second_${index}`]!.probabilities, usedSoFar),
      contour: pickContour(second[`contour_second_${index}`]!.probabilities, usedSoFar),
    };
    const notes = renderCells(
      [compose(firstHalf.rhythm, firstHalf.contour), compose(secondHalf.rhythm, secondHalf.contour)],
      chord,
      { previousPitch: input.previousPitch, ...input.range, dynamics, shape },
    );
    const cells = [firstHalf.rhythm.id, firstHalf.contour.id, secondHalf.rhythm.id, secondHalf.contour.id];
    return {
      chord,
      notes,
      summary: `${label(firstHalf.rhythm, firstHalf.contour)} + ${label(secondHalf.rhythm, secondHalf.contour)}`,
      details: [
        `強弱 ${dynamics} / ${shape}`,
        `盛り上がり ${ENERGY[input.energy].label}`,
        ...(relation ? [`前との関係 ${RELATIONS[relation].label}`] : []),
      ].join(" / "),
      latencyMs,
      calls: 2,
      lastPitch: notes.at(-1)?.pitch ?? input.previousPitch,
      memo: {
        cells,
        dynamics,
        history: [...history.filter((bar) => bar.chord !== ""), { chord, cells }].slice(-MAX_HISTORY),
        ...(relation ? { relation } : {}),
      },
    };
  });
}
