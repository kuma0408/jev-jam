import { describe, expect, it } from "vitest";
import { tempoVelocity, touchRange, touchRegister, touchVelocity } from "./touch-style.ts";

const range = { low: 53, high: 77 };

describe("touchVelocity（伴奏の質感による、ソロの音の大きさの倍率）", () => {
  it("しっとりはいつも通りの大きさ（下げると聞こえなくなる）。激しいほど大きくする", () => {
    expect(touchVelocity("sustained")).toBe(1);
    expect(touchVelocity("none")).toBe(1);
    expect(touchVelocity("active")).toBeGreaterThan(1);
    expect(touchVelocity("busy")).toBeGreaterThan(touchVelocity("active"));
    expect(touchVelocity("busy")).toBeGreaterThanOrEqual(1.5);
  });
});

describe("touchRegister（伴奏の質感による、ソロの音域の目標）", () => {
  it("激しいときは高め（ただし高すぎない）、しっとりは真ん中より少し下。ほかは指定しない", () => {
    const span = range.high - range.low;
    expect(touchRegister("busy", range)!).toBeGreaterThan(range.low + span * 0.6);
    expect(touchRegister("busy", range)!).toBeLessThanOrEqual(range.low + span * 0.75);
    expect(touchRegister("sustained", range)!).toBeLessThan(range.low + (range.high - range.low) * 0.5);
    expect(touchRegister("none", range)).toBeUndefined();
    expect(touchRegister("light", range)).toBeUndefined();
  });
});

describe("touchRange（伴奏の質感で、ソロが使う音域を寄せる）", () => {
  it("激しいときは下限を上げて高めに寄せるが、上限も下げて高くしすぎない。しっとりは上限を下げる。どちらも1オクターブ以上は残す", () => {
    const busy = touchRange("busy", range);
    const calm = touchRange("sustained", range);
    expect(busy.low).toBeGreaterThan(range.low + 3);
    // 録音を高く引き伸ばすほど音色が不自然になるので、いちばん上の音域は使わない
    expect(busy.high).toBeLessThanOrEqual(range.high - 3);
    expect(calm.high).toBeLessThan(range.high - 4);
    expect(calm.low).toBe(range.low);
    for (const narrowed of [busy, calm]) expect(narrowed.high - narrowed.low).toBeGreaterThanOrEqual(12);
    expect(touchRange("none", range)).toEqual(range);
  });
});

describe("tempoVelocity（テンポによる、ソロの音の大きさの底上げ）", () => {
  it("140BPMまではそのまま。それより速いほど大きくし、220BPMで1.2倍に達する", () => {
    expect(tempoVelocity(80)).toBe(1);
    expect(tempoVelocity(140)).toBe(1);
    expect(tempoVelocity(180)).toBeCloseTo(1.1, 5);
    expect(tempoVelocity(220)).toBeCloseTo(1.2, 5);
    expect(tempoVelocity(240)).toBeCloseTo(1.2, 5);
  });
});

