import { describe, expect, it } from "vitest";
import { slotOffsetBeats } from "./swing.ts";

describe("slotOffsetBeats", () => {
  it("表拍のスロットは拍の頭に置く", () => {
    expect(slotOffsetBeats(0, 2 / 3)).toBe(0);
    expect(slotOffsetBeats(2, 2 / 3)).toBe(1);
    expect(slotOffsetBeats(6, 2 / 3)).toBe(3);
  });

  it("裏拍のスロットは、スウィングの比率だけ後ろにずらす", () => {
    expect(slotOffsetBeats(1, 2 / 3)).toBeCloseTo(2 / 3);
    expect(slotOffsetBeats(7, 2 / 3)).toBeCloseTo(3 + 2 / 3);
  });

  it("比率0.5なら均等な8分音符になる", () => {
    expect(slotOffsetBeats(1, 0.5)).toBe(0.5);
    expect(slotOffsetBeats(3, 0.5)).toBe(1.5);
  });
});
