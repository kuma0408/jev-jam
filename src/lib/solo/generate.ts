import type { DecisionClient } from "../jev/client.ts";
import { sampleFromDistribution } from "../music/sample.ts";
import type { SlotChoice } from "./phrase.ts";
import { buildPlanQuestions, buildSlotQuestions } from "./questions.ts";

export const SLOTS_PER_BAR = 8;

/** batch: 全スロットを1回で聞く / two-stage: フレーズの方針を決めてから各スロットを聞く */
export type Strategy = "batch" | "two-stage";

export type BarInput = {
  strategy: Strategy;
  chord: string;
  bpm: number;
  previousBar: readonly SlotChoice[];
  /** 次のコードが分かっていれば渡す */
  nextChord?: string;
};

export type BarResult = {
  chord: string;
  choices: SlotChoice[];
  plan?: Record<string, string>;
  /** Jevの呼び出しにかかった合計時間 */
  latencyMs: number;
  calls: number;
  /** スロット平均の、最上位の確率・休符の確率・伸ばす確率 */
  stats: { top: number; rest: number; hold: number };
};

/** Jevに1小節ぶんのソロを選ばせ、確率分布から抽選した結果を返す */
export async function generateBar(
  client: DecisionClient,
  input: BarInput,
  random: () => number = Math.random,
): Promise<BarResult> {
  const baseState = {
    style: "jazz / neo soul jam session",
    tempo_bpm: input.bpm,
    current_chord: input.chord,
    ...(input.nextChord ? { next_chord: input.nextChord } : {}),
    previous_bar_solo: input.previousBar,
  };

  const startedAt = performance.now();
  let calls = 1;
  let plan: Record<string, string> | undefined;
  let state: object = baseState;

  if (input.strategy === "two-stage") {
    // 1回目: フレーズの方針を決める。2回目のstateに入れて、各スロットの判断を揃えさせる
    const planAnswers = await client.decide(baseState, buildPlanQuestions(input.chord));
    plan = Object.fromEntries(
      Object.entries(planAnswers).map(([id, answer]) => [id, sampleFromDistribution(answer.probabilities, random)]),
    );
    state = { ...baseState, phrase_plan: plan };
    calls = 2;
  }

  const answers = await client.decide(state, buildSlotQuestions(input.chord, SLOTS_PER_BAR));
  const latencyMs = performance.now() - startedAt;

  const choices: SlotChoice[] = [];
  const stats = { top: 0, rest: 0, hold: 0 };
  for (let slot = 0; slot < SLOTS_PER_BAR; slot++) {
    const { probabilities } = answers[`slot_${slot}`]!;
    choices.push(sampleFromDistribution(probabilities, random) as SlotChoice);
    stats.top += Math.max(...Object.values(probabilities)) / SLOTS_PER_BAR;
    stats.rest += (probabilities.rest ?? 0) / SLOTS_PER_BAR;
    stats.hold += (probabilities.hold ?? 0) / SLOTS_PER_BAR;
  }
  return { chord: input.chord, choices, latencyMs, calls, stats, ...(plan ? { plan } : {}) };
}
