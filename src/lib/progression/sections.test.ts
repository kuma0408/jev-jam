import { describe, expect, it } from "vitest";
import { PROGRESSIONS } from "./library.ts";
import { SECTION_BARS, isSectionStart, progressionById, sectionOptions } from "./sections.ts";

describe("isSectionStart（区切りの頭の小節か）", () => {
  it("8小節ごとに区切る。1小節目、9小節目、17小節目が頭", () => {
    expect(SECTION_BARS).toBe(8);
    expect([1, 2, 8, 9, 16, 17].map(isSectionStart)).toEqual([true, false, false, true, false, true]);
  });
});

describe("移り先にできる進行", () => {
  const loops = PROGRESSIONS.filter((progression) => progression.loop);

  it("繰り返し型の進行には、IDと、Jevに渡す英語の雰囲気の説明がある", () => {
    for (const progression of loops) {
      expect(progression.id).toMatch(/^[a-z0-9-]+$/);
      expect(progression.mood).toMatch(/^[\x20-\x7e]+$/);
      expect(progressionById(progression.id!)).toBe(progression);
    }
  });

  it("区切りの次の小節で進めるコードから始まる進行だけを、移り先にする。いまの進行は外す", () => {
    const names = sectionOptions(["Fmaj7", "Dm7", "Cmaj7"], "王道進行").map((progression) => progression.name);
    expect(names).toContain("Just the Two of Us進行");
    expect(names).toContain("循環（I-VI-II-V）");
    // 王道進行は Fmaj7 から始まるが、いまの進行なので外す
    expect(names).not.toContain("王道進行");
    // 小室進行は Am7 から始まるので、進めない
    expect(names).not.toContain("小室進行");
  });
});
