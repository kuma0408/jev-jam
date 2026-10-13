// Jevが型の一覧を文脈に応じて選び分けているかを見る検証スクリプト（ADR 0011）
//
// 使い方: node --env-file-if-exists=.env spikes/cell-distribution.ts
//
// 直前のフレーズだけを変えて同じ質問をし、型の確率の上位と、密度ごとの確率の合計を比べる。
import { createJevClient } from "../src/lib/jev/client.ts";
import { CELLS, cellById } from "../src/lib/solo/cells.ts";

const apiKey = process.env.TYPESAFE_API_KEY;
if (!apiKey) {
  throw new Error("TYPESAFE_API_KEY が必要です");
}
const client = createJevClient(apiKey);

const question = {
  type: "choice" as const,
  instructions:
    "Pick what the improvising soloist plays in the first half of this bar, over the chord Dm7. A great solo breathes: it answers the previous phrase, mixes busy lines with space, and does not repeat the same idea.",
  criteria: Object.fromEntries(CELLS.map((cell) => [cell.id, cell.description])),
};

const contexts: Record<string, string | string[]> = {
  "ソロの出だし": "nothing yet, the solo is just starting",
  "直前が休みと長い音": [cellById("rest").description, cellById("long-third").description],
  "直前が16分音符の連続": [cellById("run-up-16").description, cellById("digital-chain-16").description],
};

for (const [label, previous] of Object.entries(contexts)) {
  const state = {
    style: "jazz / neo soul jam session, improvised horn solo",
    tempo: "120 BPM, medium swing tempo",
    previous_bar_phrase: previous,
  };
  const startedAt = performance.now();
  const { first_half } = await client.decide(state, { first_half: question });
  const ms = performance.now() - startedAt;
  const ranked = Object.entries(first_half!.probabilities).sort((a, b) => b[1] - a[1]);

  const byDensity: Record<string, number> = {};
  for (const [id, probability] of ranked) {
    const density = cellById(id).density;
    byDensity[density] = (byDensity[density] ?? 0) + probability;
  }
  const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
  console.log(`\n=== ${label} (${ms.toFixed(0)}ms) ===`);
  console.log(`上位: ${ranked.slice(0, 6).map(([id, probability]) => `${id} ${percent(probability)}`).join(", ")}`);
  console.log(`密度ごと: ${Object.entries(byDensity).map(([density, probability]) => `${density} ${percent(probability)}`).join(", ")}`);
  console.log(`確率が1%以上の型: ${ranked.filter(([, probability]) => probability >= 0.01).length} / ${ranked.length}`);
}
