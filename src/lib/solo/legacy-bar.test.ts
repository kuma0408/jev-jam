import { describe, expect, it } from "vitest";
import { legacyToSoloBar } from "./legacy-bar.ts";

const result = {
  chord: "Dm7",
  choices: ["D", "rest", "F", "hold", "hold", "A", "rest", "C"] as const,
  latencyMs: 200,
  calls: 1,
  stats: { top: 0.5, rest: 0.03, hold: 0.01 },
};

describe("legacyToSoloBar", () => {
  it("スロットの選択を、拍の位置と長さを持つ音に変換する", () => {
    const bar = legacyToSoloBar({ ...result, choices: [...result.choices] }, { previousPitch: 62, low: 55, high: 84 });
    expect(bar.notes.map((note) => [note.pitch, note.startBeats, note.durationBeats])).toEqual([
      [62, 0, 0.5],
      [65, 1, 1.5],
      [69, 2.5, 0.5],
      [72, 3.5, 0.5],
    ]);
    expect(bar.notes.every((note) => note.swing)).toBe(true);
  });

  it("画面に出す要約と、次の依頼に渡すメモを付ける", () => {
    const bar = legacyToSoloBar({ ...result, choices: [...result.choices] }, { previousPitch: 62, low: 55, high: 84 });
    expect(bar.summary).toBe("D  .  F  -  -  A  .  C ");
    expect(bar.details).toContain("休符 3%");
    expect(bar.memo).toEqual({ choices: result.choices });
    expect(bar.lastPitch).toBe(72);
  });

  it("音が1つも無ければ、直前の音の高さを引き継ぐ", () => {
    const bar = legacyToSoloBar({ ...result, choices: ["rest", "rest"] }, { previousPitch: 62, low: 55, high: 84 });
    expect(bar.notes).toEqual([]);
    expect(bar.lastPitch).toBe(62);
  });
});
