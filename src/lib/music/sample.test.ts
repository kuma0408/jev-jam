import { describe, expect, it } from "vitest";
import { sampleFromDistribution } from "./sample.ts";

describe("sampleFromDistribution", () => {
  const probabilities = { D: 0.5, F: 0.3, A: 0.2 };

  it("乱数が累積確率のどの区間に入るかで選ぶ", () => {
    expect(sampleFromDistribution(probabilities, () => 0)).toBe("D");
    expect(sampleFromDistribution(probabilities, () => 0.49)).toBe("D");
    expect(sampleFromDistribution(probabilities, () => 0.5)).toBe("F");
    expect(sampleFromDistribution(probabilities, () => 0.79)).toBe("F");
    expect(sampleFromDistribution(probabilities, () => 0.8)).toBe("A");
    expect(sampleFromDistribution(probabilities, () => 0.999)).toBe("A");
  });

  it("合計が1でなくても比率で選ぶ", () => {
    expect(sampleFromDistribution({ D: 5, F: 3, A: 2 }, () => 0.6)).toBe("F");
  });

  it("確率0の選択肢は選ばない", () => {
    expect(sampleFromDistribution({ D: 0, F: 1 }, () => 0)).toBe("F");
  });

  it("選べる選択肢が無ければエラーにする", () => {
    expect(() => sampleFromDistribution({}, () => 0)).toThrow();
    expect(() => sampleFromDistribution({ D: 0 }, () => 0)).toThrow();
  });
});
