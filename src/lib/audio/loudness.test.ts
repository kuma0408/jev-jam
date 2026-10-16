import { describe, expect, it } from "vitest";
import { brightnessHz, soloLevel } from "./loudness.ts";

const db = (ratio: number) => 20 * Math.log10(ratio);

describe("soloLevel（ソロの音の強さを、実際に鳴らす大きさに直す）", () => {
  it("いちばん弱い音でも、強い音から8dB以内に収める（伴奏に埋もれないように）", () => {
    expect(db(soloLevel(0.12) / soloLevel(0.95))).toBeGreaterThan(-8);
  });

  it("強い音は小さくしない", () => {
    expect(soloLevel(0.95)).toBeGreaterThanOrEqual(0.95);
    expect(soloLevel(1)).toBeCloseTo(1, 5);
  });

  it("激しいときに1を超える強さは、そのまま大きくする", () => {
    expect(soloLevel(1.5)).toBeCloseTo(1.5, 5);
  });

  it("強いほど大きい（強弱の順番は変えない）", () => {
    const levels = [0.12, 0.3, 0.5, 0.7, 0.9, 1.2].map(soloLevel);
    for (let i = 1; i < levels.length; i++) expect(levels[i]).toBeGreaterThan(levels[i - 1]!);
  });
});

describe("brightnessHz（強さに応じた、音のこもらせ方）", () => {
  it("弱い音でも1800Hzまでは通し、輪郭を残す", () => {
    expect(brightnessHz(0)).toBeGreaterThanOrEqual(1800);
    expect(brightnessHz(0.12)).toBeGreaterThanOrEqual(1800);
  });

  it("強い音はこれまでどおり明るく（8000Hz）、強いほど明るい", () => {
    expect(brightnessHz(1)).toBeCloseTo(8000, 0);
    expect(brightnessHz(0.8)).toBeGreaterThan(brightnessHz(0.4));
  });
});
