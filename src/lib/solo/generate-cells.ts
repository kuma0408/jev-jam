import type { DecisionClient } from "../jev/client.ts";
import { sampleFromDistribution } from "../music/sample.ts";
import type { SoloBar, SoloMemo } from "./api.ts";
import { CELLS, type Cell, cellById, cellsForTempo } from "./cells.ts";
import type { ChoiceQuestion } from "./questions.ts";
import { type Dynamics, type Shape, renderCells } from "./render-cells.ts";

export type CellBarInput = {
  chord: string;
  bpm: number;
  previousPitch: number;
  range: { low: number; high: number };
  /** 直前の小節の記録 */
  memo: SoloMemo;
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

/** 直前に使った型は、この倍率で確率を下げる */
const RECENT_PENALTY = 0.25;
const REST_ID = "rest";

/**
 * 直前に使った型の確率を下げる。Jevは同じ状況には同じ分布を返しやすいので、
 * そのまま抽選すると同じフレーズが続きやすい。休む型は繰り返してよいので下げない。
 */
export function penalizeRecent(probabilities: Record<string, number>, recent: readonly string[]): Record<string, number> {
  return Object.fromEntries(
    Object.entries(probabilities).map(([id, probability]) => [
      id,
      id !== REST_ID && recent.includes(id) ? probability * RECENT_PENALTY : probability,
    ]),
  );
}

function tempoFeel(bpm: number): string {
  return bpm < 100 ? "slow ballad tempo" : bpm < 160 ? "medium swing tempo" : "fast, up-tempo swing";
}

function cellQuestion(instructions: string, cells: readonly Cell[]): ChoiceQuestion {
  return {
    type: "choice",
    instructions,
    criteria: Object.fromEntries(cells.map((cell) => [cell.id, cell.description])),
  };
}

function choiceQuestion(instructions: string, criteria: Record<string, string>): ChoiceQuestion {
  return { type: "choice", instructions, criteria };
}

/**
 * Jevに1小節ぶんのソロを、半小節の型2つと強弱として選ばせる（ADR 0008）。
 * 前半を決めてから後半を聞くので、2つの型がつながった1つのフレーズになりやすい。
 */
export async function generateCellBar(
  client: DecisionClient,
  input: CellBarInput,
  random: () => number = Math.random,
): Promise<SoloBar> {
  const cells = cellsForTempo(input.bpm);
  const recent = input.memo.cells ?? [];
  // 送り返されたIDのうち、一覧にあるものだけを使う
  const previousPhrase = CELLS.filter((cell) => recent.includes(cell.id)).map((cell) => cell.description);

  const baseState = {
    style: "jazz / neo soul jam session, improvised horn solo",
    tempo: `${input.bpm} BPM, ${tempoFeel(input.bpm)}`,
    current_chord: input.chord,
    previous_bar_phrase: previousPhrase.length > 0 ? previousPhrase : "nothing yet, the solo is just starting",
    ...(input.memo.dynamics ? { previous_bar_volume: input.memo.dynamics } : {}),
  };

  const startedAt = performance.now();
  const first = await client.decide(baseState, {
    first_half: cellQuestion(
      "Pick what the improvising soloist plays in the first half of this bar. A great solo breathes: it answers the previous phrase, mixes busy lines with space, and does not repeat the same idea.",
      cells,
    ),
    dynamics: choiceQuestion("How loud should the soloist play this bar, given how the solo has been going?", DYNAMICS),
    shape: choiceQuestion("How should the intensity move within this bar?", SHAPES),
  });
  const firstCell = cellById(sampleFromDistribution(penalizeRecent(first.first_half!.probabilities, recent), random));
  const dynamics = sampleFromDistribution(first.dynamics!.probabilities, random) as Dynamics;
  const shape = sampleFromDistribution(first.shape!.probabilities, random) as Shape;

  const second = await client.decide(
    { ...baseState, volume_of_this_bar: dynamics, first_half_of_this_bar: firstCell.description },
    {
      second_half: cellQuestion(
        "Pick what the soloist plays in the second half of this bar, continuing from the first half so the two parts form one musical sentence. If the first half was busy, consider space; if it was sparse, consider movement.",
        cells,
      ),
    },
  );
  const secondCell = cellById(
    sampleFromDistribution(penalizeRecent(second.second_half!.probabilities, [...recent, firstCell.id]), random),
  );
  const latencyMs = performance.now() - startedAt;

  const notes = renderCells([firstCell, secondCell], input.chord, {
    previousPitch: input.previousPitch,
    ...input.range,
    dynamics,
    shape,
  });

  return {
    chord: input.chord,
    notes,
    summary: `${firstCell.id} + ${secondCell.id}`,
    details: `強弱 ${dynamics} / ${shape}`,
    latencyMs,
    calls: 2,
    lastPitch: notes.at(-1)?.pitch ?? input.previousPitch,
    memo: { cells: [firstCell.id, secondCell.id], dynamics },
  };
}
