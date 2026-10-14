import { describe, expect, it } from "vitest";
import { FLOURISHES, flourishOnRelease, flourishScale, pickFlourish } from "./flourish.ts";

describe("pickFlourish（押したときのエフェクトを選ぶ）", () => {
  it("種類の数だけ続けて押すと、すべての種類が1回ずつ出る（同じものが続かない）", () => {
    expect(FLOURISHES.length).toBe(12);
    for (const kind of ["ring", "cut-in", "sweep", "confetti", "spinner", "bloom", "streak", "fan", "petals", "square", "bars", "orbit"]) {
      expect(FLOURISHES).toContain(kind);
    }
    const kinds = FLOURISHES.map((_, count) => pickFlourish(count));
    expect(new Set(kinds).size).toBe(FLOURISHES.length);
  });

  it("並び順は周ごとに入れ替わり、周の変わり目でも同じものが続かない", () => {
    const length = FLOURISHES.length;
    const first = FLOURISHES.map((_, count) => pickFlourish(count));
    const second = FLOURISHES.map((_, count) => pickFlourish(length + count));
    expect(second).not.toEqual(first);
    expect(new Set(second).size).toBe(length);
    for (let count = 1; count < length * 4; count++) {
      expect(pickFlourish(count)).not.toBe(pickFlourish(count - 1));
    }
  });
});

describe("flourishOnRelease（離したときのエフェクト）", () => {
  it("長く押さえて離したら、地の色が染まるエフェクトを出す。短ければ出さない", () => {
    expect(flourishOnRelease(1.2)).toBe("veil");
    expect(flourishOnRelease(0.2)).toBeNull();
  });
});

describe("flourishScale（エフェクトの大きさ）", () => {
  it("高いところを押すほど大きい", () => {
    expect(flourishScale(1)).toBeGreaterThan(flourishScale(0));
    // 派手すぎると言われたので、全体に小さめにする
    expect(flourishScale(0)).toBeGreaterThanOrEqual(0.4);
    expect(flourishScale(1)).toBeLessThanOrEqual(1);
  });
});
