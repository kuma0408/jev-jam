import { describe, expect, it } from "vitest";
import { FLOURISHES, flourishOnRelease, flourishScale, pickFlourish } from "./flourish.ts";

describe("pickFlourish（押したときのエフェクトを選ぶ）", () => {
  it("5回続けて押すと、5種類すべてが1回ずつ出る（同じものが続かない）", () => {
    expect(FLOURISHES).toEqual(["ring", "cut-in", "sweep", "confetti", "spinner"]);
    const kinds = [0, 1, 2, 3, 4].map((count) => pickFlourish(count, () => 0.3));
    expect(new Set(kinds).size).toBe(5);
  });

  it("並び順は周ごとに入れ替わる（いつも同じ順番にならない）", () => {
    const first = [0, 1, 2, 3, 4].map((count) => pickFlourish(count, () => 0.1));
    const second = [5, 6, 7, 8, 9].map((count) => pickFlourish(count, () => 0.9));
    expect(second).not.toEqual(first);
    expect(new Set(second).size).toBe(5);
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
    expect(flourishScale(0)).toBeGreaterThanOrEqual(0.6);
    expect(flourishScale(1)).toBeLessThanOrEqual(1.5);
  });
});
