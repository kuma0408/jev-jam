import type { DecisionClient } from "../jev/client.ts";
import { sampleFromDistribution } from "../music/sample.ts";
import type { SoloBar, SoloMemo } from "./api.ts";
import type { Cell } from "./cells.ts";
import { CONTOURS, type Contour, contourById } from "./contours.ts";
import { ENERGY, type Energy } from "./energy.ts";
import type { ChoiceQuestion } from "./questions.ts";
import { type Dynamics, type Shape, renderCells } from "./render-cells.ts";
import { RHYTHMS, type Rhythm, rhythmById, rhythmsFor } from "./rhythms.ts";

export type PhraseBarsInput = {
  /** ソロを用意したいコード。次に選べる候補すべてを一度に渡す */
  chords: readonly string[];
  bpm: number;
  previousPitch: number;
  range: { low: number; high: number };
  /** 直前の小節の記録。cells に [前半のリズム, 前半の動き, 後半のリズム, 後半の動き] のIDが入る */
  memo: SoloMemo;
  /** ユーザーがつまみで決めた盛り上がり */
  energy: Energy;
};

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
 * 直前に使ったリズムや動きの確率を下げる。Jevは同じ状況には同じ分布を返しやすいので、
 * そのまま抽選すると同じフレーズが続きやすい。休みは繰り返してよいので下げない。
 */
export function penalizeRecent(probabilities: Record<string, number>, recent: readonly string[]): Record<string, number> {
  return Object.fromEntries(
    Object.entries(probabilities).map(([id, probability]) => [
      id,
      id !== REST_ID && recent.includes(id) ? probability * RECENT_PENALTY : probability,
    ]),
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
  const recent = input.memo.cells ?? [];
  // 送り返されたIDのうち、一覧にあるものだけを使う
  const previousPhrase = [
    ...RHYTHMS.filter((rhythm) => recent.includes(rhythm.id)),
    ...CONTOURS.filter((contour) => recent.includes(contour.id)),
  ].map((item) => item.description);

  const baseState = {
    style: "jazz / neo soul jam session, improvised horn solo",
    tempo: `${input.bpm} BPM, ${tempoFeel(input.bpm)}`,
    bandleader_cue: ENERGY[input.energy].cue,
    previous_bar_phrase: previousPhrase.length > 0 ? previousPhrase : "nothing yet, the solo is just starting",
    ...(input.memo.dynamics ? { previous_bar_volume: input.memo.dynamics } : {}),
  };

  const pickRhythm = (probabilities: Record<string, number>, used: readonly string[]) =>
    rhythmById(sampleFromDistribution(biasByEnergy(penalizeRecent(probabilities, used), input.energy), random));
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

  const first = await client.decide(baseState, firstQuestions);
  const firstHalves = input.chords.map((_, index) => ({
    rhythm: pickRhythm(first[`rhythm_first_${index}`]!.probabilities, recent),
    contour: pickContour(first[`contour_first_${index}`]!.probabilities, recent),
  }));
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
    const used = [...recent, firstHalf.rhythm.id, firstHalf.contour.id];
    const secondHalf = {
      rhythm: pickRhythm(second[`rhythm_second_${index}`]!.probabilities, used),
      contour: pickContour(second[`contour_second_${index}`]!.probabilities, used),
    };
    const notes = renderCells(
      [compose(firstHalf.rhythm, firstHalf.contour), compose(secondHalf.rhythm, secondHalf.contour)],
      chord,
      { previousPitch: input.previousPitch, ...input.range, dynamics, shape },
    );
    return {
      chord,
      notes,
      summary: `${label(firstHalf.rhythm, firstHalf.contour)} + ${label(secondHalf.rhythm, secondHalf.contour)}`,
      details: `強弱 ${dynamics} / ${shape} / 盛り上がり ${ENERGY[input.energy].label}`,
      latencyMs,
      calls: 2,
      lastPitch: notes.at(-1)?.pitch ?? input.previousPitch,
      memo: {
        cells: [firstHalf.rhythm.id, firstHalf.contour.id, secondHalf.rhythm.id, secondHalf.contour.id],
        dynamics,
      },
    };
  });
}
