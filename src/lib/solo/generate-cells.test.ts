import { describe, expect, it } from "vitest";
import type { ChoiceAnswer, DecisionClient } from "../jev/client.ts";
import { CELLS } from "./cells.ts";
import { generateCellBars, penalizeRecent } from "./generate-cells.ts";

/** 質問ごとに決めた選択肢へ確率1を返し、呼び出しを記録するクライアント */
function scriptedClient(picks: Record<string, string>) {
  const calls: { state: Record<string, unknown>; questions: Record<string, { criteria: Record<string, string> }> }[] = [];
  const client: DecisionClient = {
    name: "fake",
    async decide(state, questions) {
      calls.push({ state: state as Record<string, unknown>, questions });
      const answers: Record<string, ChoiceAnswer> = {};
      for (const [id, question] of Object.entries(questions)) {
        const choice = picks[id] ?? Object.keys(question.criteria)[0]!;
        answers[id] = { choice, probabilities: { [choice]: 1 } };
      }
      return answers;
    },
  };
  return { client, calls };
}

const input = { chords: ["Dm7"], bpm: 120, previousPitch: 62, range: { low: 53, high: 84 }, memo: {} };
const picks = { first_half_0: "arpeggio-up", second_half_0: "rest", dynamics: "loud", shape: "crescendo" };

/** コードが1つのときの結果を取り出す */
async function generateOne(client: DecisionClient, options: typeof input & { memo: object }) {
  const [bar] = await generateCellBars(client, options);
  return bar!;
}

describe("generateCellBars", () => {
  it("前半の型と強弱を決めてから、後半の型を決める（Jevを2回呼ぶ）", async () => {
    const { client, calls } = scriptedClient(picks);
    const bar = await generateOne(client, input);
    expect(calls).toHaveLength(2);
    expect(Object.keys(calls[0]!.questions)).toEqual(["first_half_0", "dynamics", "shape"]);
    expect(Object.keys(calls[1]!.questions)).toEqual(["second_half_0"]);
    expect(bar.calls).toBe(2);
  });

  it("選ばれた型を音に直して返す", async () => {
    const { client } = scriptedClient(picks);
    const bar = await generateOne(client, input);
    expect(bar.chord).toBe("Dm7");
    expect(bar.notes.map((note) => note.pitch)).toEqual([62, 65, 69, 72]);
    expect(bar.lastPitch).toBe(72);
  });

  it("後半を決めるとき、前半に選んだ型をJevに伝える", async () => {
    const { client, calls } = scriptedClient(picks);
    await generateOne(client, input);
    const firstHalf = CELLS.find((cell) => cell.id === "arpeggio-up")!;
    expect(JSON.stringify(calls[1]!.state)).toContain(firstHalf.description);
  });

  it("直前の小節で使った型を、説明文でJevに伝える", async () => {
    const { client, calls } = scriptedClient(picks);
    await generateOne(client, { ...input, memo: { cells: ["rest", "arpeggio-down"], dynamics: "soft" } });
    const previous = CELLS.find((cell) => cell.id === "arpeggio-down")!;
    expect(JSON.stringify(calls[0]!.state)).toContain(previous.description);
  });

  it("画面用の要約と、次の依頼に渡すメモを返す", async () => {
    const { client } = scriptedClient(picks);
    const bar = await generateOne(client, input);
    expect(bar.summary).toBe("arpeggio-up + rest");
    expect(bar.details).toContain("loud");
    expect(bar.details).toContain("crescendo");
    expect(bar.memo).toEqual({ cells: ["arpeggio-up", "rest"], dynamics: "loud" });
  });

  it("小節まるごと休みなら、直前の音の高さを引き継ぐ", async () => {
    const { client } = scriptedClient({ ...picks, first_half_0: "rest" });
    const bar = await generateOne(client, input);
    expect(bar.notes).toEqual([]);
    expect(bar.lastPitch).toBe(62);
  });

  it("速いテンポでは16分音符の型を選択肢に入れない", async () => {
    const { client, calls } = scriptedClient(picks);
    await generateOne(client, { ...input, bpm: 220 });
    const offered = Object.keys(calls[0]!.questions.first_half_0!.criteria);
    const sixteenths = CELLS.filter((cell) => cell.density === "sixteenths").map((cell) => cell.id);
    expect(offered.some((id) => sixteenths.includes(id))).toBe(false);
  });
});

describe("generateCellBars（複数のコードをまとめて依頼）", () => {
  const many = { ...input, chords: ["Dm7", "Fmaj7", "G7"] };

  it("コードがいくつあっても、Jevの呼び出しは2回で済ませる", async () => {
    const { client, calls } = scriptedClient(picks);
    const bars = await generateCellBars(client, many);
    expect(calls).toHaveLength(2);
    expect(bars.map((bar) => bar.chord)).toEqual(["Dm7", "Fmaj7", "G7"]);
    expect(Object.keys(calls[0]!.questions)).toEqual(["first_half_0", "first_half_1", "first_half_2", "dynamics", "shape"]);
    expect(Object.keys(calls[1]!.questions)).toEqual(["second_half_0", "second_half_1", "second_half_2"]);
  });

  it("質問文で、どのコードの上で吹くのかをJevに伝える", async () => {
    const { client, calls } = scriptedClient(picks);
    await generateCellBars(client, many);
    const questions = calls[0]!.questions as unknown as Record<string, { instructions: string }>;
    expect(questions.first_half_1!.instructions).toContain("Fmaj7");
    expect(questions.first_half_2!.instructions).toContain("G7");
  });

  it("コードごとに別の型を選べて、それぞれのコードの音に直す", async () => {
    const { client } = scriptedClient({ ...picks, first_half_1: "arpeggio-down", second_half_1: "rest", first_half_2: "rest" });
    const [dm7, fmaj7, g7] = await generateCellBars(client, many);
    expect(dm7!.summary).toBe("arpeggio-up + rest");
    expect(fmaj7!.summary).toBe("arpeggio-down + rest");
    // Fmaj7 の 7th・5th・3rd・ルート = E C A F
    expect(fmaj7!.notes.map((note) => note.pitch % 12)).toEqual([4, 0, 9, 5]);
    expect(g7!.notes).toEqual([]);
  });

  it("強弱は全コードで共通にする", async () => {
    const { client } = scriptedClient(picks);
    const bars = await generateCellBars(client, many);
    expect(bars.every((bar) => bar.memo.dynamics === "loud")).toBe(true);
  });
});

describe("penalizeRecent", () => {
  it("直前に使った型の確率を下げて、同じフレーズの繰り返しを減らす", () => {
    const adjusted = penalizeRecent({ a: 0.5, b: 0.5 }, ["a"]);
    expect(adjusted.a).toBeLessThan(adjusted.b!);
    expect(adjusted.b).toBe(0.5);
  });

  it("休む型は下げない（間は繰り返してよい）", () => {
    expect(penalizeRecent({ rest: 0.5, a: 0.5 }, ["rest"]).rest).toBe(0.5);
  });
});
