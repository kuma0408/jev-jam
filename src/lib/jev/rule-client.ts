// Jevを呼ばずに、ルールで確率を作る判断役。Jevと聴き比べるためのモード。
// Jevが状況の文から読み取っていた判断のうち、効きの大きいものだけを簡単な規則に置き換え、ほかは均等にする。
// 均等にした質問も、確率を受け取った後のルールの補正（音数を盛り上がりに寄せる、など）はこれまでどおり効く
import type { Energy } from "../solo/energy.ts";
import type { ChoiceQuestion } from "../solo/questions.ts";
import type { ChoiceAnswer, DecisionClient } from "./client.ts";

export type RuleContext = {
  /** 盛り上がり（1〜4）。ユーザーの押し方から決まる */
  energy: Energy;
  /** 4小節のまとまりの中の位置（0〜3） */
  barInPhrase?: number;
  /** いまの進行を続けている小節数。区切りで続けるか移るかの判断に使う */
  barsOn?: number;
};

/** 盛り上がりごとの、強さの重み */
const DYNAMICS_BY_ENERGY: Record<Energy, Record<string, number>> = {
  1: { soft: 0.6, medium: 0.3, loud: 0.1 },
  2: { soft: 0.25, medium: 0.5, loud: 0.25 },
  3: { soft: 0.1, medium: 0.45, loud: 0.45 },
  4: { soft: 0.05, medium: 0.25, loud: 0.7 },
};

/** 盛り上がっているときと、静かなときの、強弱の動きの重み */
const SHAPES_RISING: Record<string, number> = { crescendo: 0.4, surge: 0.3, steady: 0.2, decrescendo: 0.1 };
const SHAPES_FALLING: Record<string, number> = { decrescendo: 0.4, steady: 0.3, surge: 0.2, crescendo: 0.1 };

/** 4小節のまとまりの最後の小節で、「間で応える」に置く重み */
const SPACE_AT_PHRASE_END = 0.6;
/** 進行を始めてこの小節数までは、続けることに重みを置く */
const KEEP_PROGRESSION_BARS = 8;
const KEEP_WEIGHT = 0.8;
const LAST_BAR_IN_PHRASE = 3;

/** 指定した選択肢に重みを置き、残りを均等に分ける。指定が無い選択肢には、残りの重みを均等に配る */
function weigh(ids: readonly string[], preferred: Record<string, number>): Record<string, number> {
  const known = ids.filter((id) => id in preferred);
  const given = known.reduce((sum, id) => sum + preferred[id]!, 0);
  const rest = ids.length - known.length;
  const share = rest > 0 ? Math.max(0, 1 - given) / rest : 0;
  const raw = Object.fromEntries(ids.map((id) => [id, preferred[id] ?? share]));
  const total = Object.values(raw).reduce((sum, value) => sum + value, 0);
  return Object.fromEntries(ids.map((id) => [id, total > 0 ? raw[id]! / total : 1 / ids.length]));
}

function probabilitiesFor(id: string, ids: readonly string[], context: RuleContext): Record<string, number> {
  const even = weigh(ids, {});
  switch (id) {
    case "dynamics":
      return weigh(ids, DYNAMICS_BY_ENERGY[context.energy]);
    case "shape":
      return weigh(ids, context.energy >= 3 ? SHAPES_RISING : SHAPES_FALLING);
    case "relation":
      return context.barInPhrase === LAST_BAR_IN_PHRASE ? weigh(ids, { space: SPACE_AT_PHRASE_END }) : even;
    case "section":
      return context.barsOn !== undefined && context.barsOn < KEEP_PROGRESSION_BARS ? weigh(ids, { stay: KEEP_WEIGHT }) : even;
    default:
      return even;
  }
}

export function createRuleClient(context: RuleContext): DecisionClient {
  return {
    name: "rules",
    async decide(_state, questions: Record<string, ChoiceQuestion>) {
      const answers: Record<string, ChoiceAnswer> = {};
      for (const [id, question] of Object.entries(questions)) {
        const ids = Object.keys(question.criteria);
        const probabilities = probabilitiesFor(id, ids, context);
        const choice = ids.reduce((best, option) => (probabilities[option]! > probabilities[best]! ? option : best));
        answers[id] = { choice, probabilities };
      }
      return answers;
    },
  };
}
