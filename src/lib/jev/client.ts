import type { ChoiceQuestion } from "../solo/questions.ts";

export type ChoiceAnswer = {
  /** Jevが最も確からしいとした選択肢 */
  choice: string;
  /** 全選択肢の確率。合計は1 */
  probabilities: Record<string, number>;
};

/** 状態と質問を渡すと、質問IDごとの判断を返すもの。本物のJevとダミーを差し替えられるようにする */
export type DecisionClient = {
  readonly name: string;
  decide(state: unknown, questions: Record<string, ChoiceQuestion>): Promise<Record<string, ChoiceAnswer>>;
};

const JEV_ENDPOINT = "https://api.typesafe.ai/v1/systemone";

export function createJevClient(apiKey: string, model = "jev-latest"): DecisionClient {
  return {
    name: "jev",
    async decide(state, questions) {
      const response = await fetch(JEV_ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ state, model, questions }),
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`Jevの呼び出しに失敗しました (${response.status}): ${text}`);
      }
      const answers = (JSON.parse(text) as { answers?: Record<string, ChoiceAnswer> }).answers;
      // レスポンスの形は二次情報から組んだ想定なので、違っていたら生の応答を見せて止める
      for (const id of Object.keys(questions)) {
        const probabilities = answers?.[id]?.probabilities;
        if (typeof probabilities !== "object" || probabilities === null || Array.isArray(probabilities)) {
          throw new Error(`Jevの応答が想定した形ではありません (質問 ${id}): ${text}`);
        }
      }
      return answers!;
    },
  };
}

/**
 * キーが無い間に配線を確かめるためのダミー。
 * 確率はでたらめなので、音楽的な質の評価には使えない。
 */
export function createMockClient(random: () => number = Math.random): DecisionClient {
  return {
    name: "mock",
    async decide(_state, questions) {
      // 公称レイテンシ（70〜500ms）の範囲で待つ
      await new Promise((resolve) => setTimeout(resolve, 70 + random() * 430));
      const answers: Record<string, ChoiceAnswer> = {};
      for (const [id, question] of Object.entries(questions)) {
        const labels = Object.keys(question.criteria);
        const weights = labels.map(() => random());
        const total = weights.reduce((sum, weight) => sum + weight, 0);
        const probabilities = Object.fromEntries(labels.map((label, i) => [label, weights[i]! / total]));
        const choice = labels.reduce((best, label) => (probabilities[label]! > probabilities[best]! ? label : best));
        answers[id] = { choice, probabilities };
      }
      return answers;
    },
  };
}
