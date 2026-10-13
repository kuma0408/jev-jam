import { describe, expect, it } from "vitest";
import { swingBeats, swingRatioFor } from "./swing.ts";

describe("swingBeats", () => {
  it("拍の頭は動かさない", () => {
    expect(swingBeats(0, 2 / 3)).toBe(0);
    expect(swingBeats(3, 2 / 3)).toBe(3);
  });

  it("8分音符の裏拍を、スウィングの比率の位置まで後ろにずらす", () => {
    expect(swingBeats(0.5, 2 / 3)).toBeCloseTo(2 / 3);
    expect(swingBeats(3.5, 2 / 3)).toBeCloseTo(3 + 2 / 3);
  });

  it("16分音符は、前半と後半をそれぞれ等分した位置に置く", () => {
    expect(swingBeats(0.25, 2 / 3)).toBeCloseTo(1 / 3);
    expect(swingBeats(0.75, 2 / 3)).toBeCloseTo(2 / 3 + 1 / 6);
  });

  it("比率0.5なら何も変えない", () => {
    expect(swingBeats(1.25, 0.5)).toBeCloseTo(1.25);
    expect(swingBeats(1.5, 0.5)).toBeCloseTo(1.5);
  });
});

describe("swingRatioFor", () => {
  it("ゆっくりなテンポでは3連符のスウィングにする", () => {
    expect(swingRatioFor(90)).toBeCloseTo(2 / 3);
    expect(swingRatioFor(120)).toBeCloseTo(2 / 3);
  });

  it("テンポが速いほど均等に近づける", () => {
    expect(swingRatioFor(180)).toBeLessThan(swingRatioFor(120));
    expect(swingRatioFor(240)).toBeLessThan(swingRatioFor(180));
    expect(swingRatioFor(240)).toBeGreaterThanOrEqual(0.5);
  });
});
