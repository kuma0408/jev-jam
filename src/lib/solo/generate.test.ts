import { describe, expect, it } from "vitest";
import type { ChoiceAnswer, DecisionClient } from "../jev/client.ts";
import { generateBar } from "./generate.ts";

/** 各質問で先頭の選択肢に確率1を返し、呼び出しを記録するクライアント */
function recordingClient() {
  const calls: { state: unknown; questionIds: string[] }[] = [];
  const client: DecisionClient = {
    name: "fake",
    async decide(state, questions) {
      calls.push({ state, questionIds: Object.keys(questions) });
      const answers: Record<string, ChoiceAnswer> = {};
      for (const [id, question] of Object.entries(questions)) {
        const first = Object.keys(question.criteria)[0]!;
        answers[id] = { choice: first, probabilities: { [first]: 1 } };
      }
      return answers;
    },
  };
  return { client, calls };
}

const input = { chord: "Dm7", bpm: 120, previousBar: [] };

describe("generateBar", () => {
  it("一括方式ではJevを1回呼び、スロットの数だけ選択を返す", async () => {
    const { client, calls } = recordingClient();
    const result = await generateBar(client, { ...input, strategy: "batch" });
    expect(calls).toHaveLength(1);
    expect(result.calls).toBe(1);
    expect(result.choices).toEqual(["D", "D", "D", "D", "D", "D", "D", "D"]);
    expect(result.plan).toBeUndefined();
  });

  it("2段階方式では方針を先に決め、2回目のstateに入れる", async () => {
    const { client, calls } = recordingClient();
    const result = await generateBar(client, { ...input, strategy: "two-stage" });
    expect(calls).toHaveLength(2);
    expect(calls[0]!.questionIds).toEqual(["contour", "density", "landing"]);
    expect(result.plan).toEqual({ contour: "ascending", density: "sparse", landing: "D" });
    expect(calls[1]!.state).toMatchObject({ current_chord: "Dm7", phrase_plan: result.plan });
  });

  it("スロット平均の確率の統計を返す", async () => {
    const { client } = recordingClient();
    const result = await generateBar(client, { ...input, strategy: "batch" });
    expect(result.stats).toEqual({ top: 1, rest: 0, hold: 0 });
  });
});
