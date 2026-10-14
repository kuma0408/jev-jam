import { describe, expect, it } from "vitest";
import { PROGRESSIONS } from "../progression/library.ts";
import { LOOKS, chordShift, contrastRatio, hslToRgb, mixTheme, themeFor } from "./palette.ts";

const sectionIds = PROGRESSIONS.filter((progression) => progression.id).map((progression) => progression.id!);

describe("LOOKS（進行ごとの見た目）", () => {
  it("移り先になる進行すべてに、基準の色相と背景の表情がある", () => {
    for (const id of sectionIds) {
      expect(LOOKS[id]).toBeDefined();
      expect(["sand", "swarm", "shards"]).toContain(LOOKS[id]!.scene);
    }
  });

  it("進行どうしの色相は、見分けられるくらい離す", () => {
    const hues = sectionIds.map((id) => LOOKS[id]!.hue);
    for (let i = 0; i < hues.length; i++) {
      for (let j = i + 1; j < hues.length; j++) {
        const gap = Math.abs(hues[i]! - hues[j]!) % 360;
        expect(Math.min(gap, 360 - gap)).toBeGreaterThanOrEqual(20);
      }
    }
  });
});

describe("chordShift（コードで色相を少しずらす）", () => {
  it("5度圏の位置で、Cを0に、Gは正、Fは負へ、20度以内でずらす", () => {
    expect(chordShift("Cmaj7")).toBe(0);
    expect(chordShift("G7")).toBeGreaterThan(0);
    expect(chordShift("Fmaj7")).toBeLessThan(0);
    for (const chord of ["Db7", "Gb7", "Abmaj7", "E7", "Bb7"]) expect(Math.abs(chordShift(chord))).toBeLessThanOrEqual(20);
  });
});

describe("themeFor（進行とコードから決める色）", () => {
  it("あなたの色は、進行の色相をコードでずらしたもの。Jevの色は、その反対側に近い色相", () => {
    const theme = themeFor("marusa", "G7");
    expect(theme.primary.h).toBeCloseTo((LOOKS.marusa!.hue + chordShift("G7") + 360) % 360);
    expect(Math.abs(((theme.secondary.h - theme.primary.h + 360) % 360) - 150)).toBeLessThan(1);
  });

  it("地は白に近く、文字や線の深い色とは、はっきりした明暗差がある", () => {
    for (const id of sectionIds) {
      const theme = themeFor(id, "Cmaj7");
      expect(theme.wash.l).toBeGreaterThanOrEqual(94);
      expect(contrastRatio(hslToRgb(theme.deep), hslToRgb(theme.wash))).toBeGreaterThanOrEqual(7);
    }
  });

  it("進行が分からなければ、基本の丸サ進行の見た目にする", () => {
    expect(themeFor(null, null)).toEqual(themeFor("marusa", null));
  });
});

describe("mixTheme（色を移ろわせる）", () => {
  it("0なら元の色、1なら行き先の色", () => {
    const from = themeFor("marusa", "Cmaj7");
    const to = themeFor("just-the-two", "Fmaj7");
    expect(mixTheme(from, to, 0)).toEqual(from);
    expect(mixTheme(from, to, 1)).toEqual(to);
  });

  it("色相は近い向きに回る（350度から10度へは、0度を通る）", () => {
    const from = { ...themeFor("marusa", null), primary: { h: 350, s: 80, l: 50 } };
    const to = { ...themeFor("marusa", null), primary: { h: 10, s: 80, l: 50 } };
    expect(mixTheme(from, to, 0.5).primary.h).toBeCloseTo(0);
  });
});

describe("hslToRgb / contrastRatio", () => {
  it("白と黒の明暗差は21", () => {
    expect(hslToRgb({ h: 0, s: 0, l: 100 })).toEqual([255, 255, 255]);
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21);
  });
});
