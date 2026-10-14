import { describe, expect, it } from "vitest";
import { touchRegister, touchVelocity } from "./touch-style.ts";

const range = { low: 53, high: 77 };

describe("touchVelocity（伴奏の質感による、ソロの音の大きさの倍率）", () => {
  it("しっとりなら小さく、激しいほど大きくする", () => {
    expect(touchVelocity("sustained")).toBeLessThan(1);
    expect(touchVelocity("none")).toBe(1);
    expect(touchVelocity("active")).toBeGreaterThan(1);
    expect(touchVelocity("busy")).toBeGreaterThan(touchVelocity("active"));
  });
});

describe("touchRegister（伴奏の質感による、ソロの音域の目標）", () => {
  it("激しいときは高い音域、しっとりは真ん中より少し下。ほかは指定しない", () => {
    expect(touchRegister("busy", range)!).toBeGreaterThan(range.low + (range.high - range.low) * 0.75);
    expect(touchRegister("sustained", range)!).toBeLessThan(range.low + (range.high - range.low) * 0.5);
    expect(touchRegister("none", range)).toBeUndefined();
    expect(touchRegister("light", range)).toBeUndefined();
  });
});
