import { describe, expect, it } from "vitest";
import type { ChoiceQuestion } from "../solo/questions.ts";
import { createRuleClient } from "./rule-client.ts";

const question = (...ids: string[]): ChoiceQuestion => ({
  type: "choice",
  instructions: "",
  criteria: Object.fromEntries(ids.map((id) => [id, ""])),
});

const ask = async (context: Parameters<typeof createRuleClient>[0], id: string, ...options: string[]) => {
  const answers = await createRuleClient(context).decide({}, { [id]: question(...options) });
  return answers[id]!;
};

describe("createRuleClient（Jevを呼ばず、ルールで確率を作る）", () => {
  it("名前は rules。どの質問にも、合計1の確率と、いちばん高い選択肢を返す", async () => {
    const client = createRuleClient({ energy: 2 });
    expect(client.name).toBe("rules");
    const answers = await client.decide({}, { rhythm_first: question("r-rest", "r-whole", "r-sixteenth-run") });
    const { choice, probabilities } = answers.rhythm_first!;
    expect(Object.values(probabilities).reduce((sum, p) => sum + p, 0)).toBeCloseTo(1, 5);
    expect(Object.keys(probabilities)).toEqual(["r-rest", "r-whole", "r-sixteenth-run"]);
    expect(choice in probabilities).toBe(true);
  });

  it("規則の無い質問は、どの選択肢も同じ確率にする（あとはこれまでのルールの補正に任せる）", async () => {
    const { probabilities } = await ask({ energy: 2 }, "contour_first", "c-a", "c-b", "c-c", "c-d");
    expect(new Set(Object.values(probabilities)).size).toBe(1);
  });

  it("強さは、激しく弾いていれば loud、しっとりなら soft に寄せる", async () => {
    const busy = await ask({ energy: 4 }, "dynamics", "soft", "medium", "loud");
    expect(busy.choice).toBe("loud");
    const calm = await ask({ energy: 1 }, "dynamics", "soft", "medium", "loud");
    expect(calm.choice).toBe("soft");
  });

  it("強弱の動きは、盛り上がっていればだんだん強く、静かならだんだん弱くに寄せる", async () => {
    const shapes = ["steady", "crescendo", "decrescendo", "surge"];
    expect((await ask({ energy: 4 }, "shape", ...shapes)).choice).toBe("crescendo");
    expect((await ask({ energy: 1 }, "shape", ...shapes)).choice).toBe("decrescendo");
  });

  it("4小節のまとまりの最後の小節では、前のフレーズに間で応える", async () => {
    const relations = ["develop-rhythm", "develop-melody", "echo", "contrast", "space"];
    expect((await ask({ energy: 2, barInPhrase: 3 }, "relation", ...relations)).choice).toBe("space");
    const middle = await ask({ energy: 2, barInPhrase: 1 }, "relation", ...relations);
    expect(new Set(Object.values(middle.probabilities)).size).toBe(1);
  });

  it("進行は、始まったばかりなら続け、しばらく続いたらどれも同じ確率にする", async () => {
    const options = ["stay", "marusa", "just-the-two", "komuro"];
    expect((await ask({ energy: 2, barsOn: 4 }, "section", ...options)).choice).toBe("stay");
    const long = await ask({ energy: 2, barsOn: 24 }, "section", ...options);
    expect(new Set(Object.values(long.probabilities)).size).toBe(1);
  });
});
