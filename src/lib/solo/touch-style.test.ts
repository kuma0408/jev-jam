import { describe, expect, it } from "vitest";
import { touchRange, touchRegister, touchVelocity } from "./touch-style.ts";

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

describe("touchRange（伴奏の質感で、ソロが使う音域を寄せる）", () => {
  it("激しいときは下限を上げて高い音域だけ、しっとりは上限を下げる。どちらも1オクターブ半以上は残す", () => {
    const busy = touchRange("busy", range);
    const calm = touchRange("sustained", range);
    expect(busy.low).toBeGreaterThan(range.low + 6);
    expect(busy.high).toBe(range.high);
    expect(calm.high).toBeLessThan(range.high - 4);
    expect(calm.low).toBe(range.low);
    for (const narrowed of [busy, calm]) expect(narrowed.high - narrowed.low).toBeGreaterThanOrEqual(14);
    expect(touchRange("none", range)).toEqual(range);
  });
});
