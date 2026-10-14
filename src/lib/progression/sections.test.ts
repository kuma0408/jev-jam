import { describe, expect, it } from "vitest";
import { KNOWN_CHORDS } from "./candidates.ts";
import { PROGRESSIONS } from "./library.ts";
import {
  HOME_PROGRESSIONS,
  SECTION_BARS,
  START_PROGRESSION,
  isSectionEnd,
  isSectionStart,
  leadInFor,
  progressionById,
  sectionBias,
  sectionOptions,
} from "./sections.ts";

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

  it("いまの進行を除く、すべての繰り返し型の進行へ移れる", () => {
    const names = sectionOptions("王道進行").map((progression) => progression.name);
    expect(names).toContain("Just the Two of Us進行");
    expect(names).toContain("循環（I-VI-II-V）");
    expect(names).toContain("小室進行");
    expect(names).not.toContain("王道進行");
  });

  it("移る前の小節には、移り先の最初のコードへ導くセブンス（5度上のコード）を置く", () => {
    expect(leadInFor(progressionById("i-vi-ii-v")!)).toBe("G7");
    expect(leadInFor(progressionById("komuro")!)).toBe("E7");
    expect(leadInFor(progressionById("marusa")!)).toBe("C7");
    for (const progression of PROGRESSIONS.filter((item) => item.id)) {
      expect(KNOWN_CHORDS).toContain(leadInFor(progression));
    }
  });

  it("区切りの最後の小節（8小節目、16小節目…）が分かる", () => {
    expect([7, 8, 9, 16].map(isSectionEnd)).toEqual([false, true, false, true]);
  });

  it("ジャズ寄りの繰り返し型の進行がある", () => {
    for (const id of ["minor-iv", "ii-v-i-vi7"]) expect(progressionById(id)).toBeDefined();
    expect(progressionById("minor-iv")!.chords).toEqual(["Fmaj7", "Fm7", "Em7", "Am7"]);
    expect(progressionById("ii-v-i-vi7")!.chords).toEqual(["Dm7", "G7", "Cmaj7", "A7"]);
  });
});

describe("基本の進行", () => {
  it("カノン進行はジャズに合わないので、一覧に入れない", () => {
    expect(PROGRESSIONS.map((progression) => progression.name)).not.toContain("カノン進行");
  });

  it("順次下降は伴奏を合わせづらいので、一覧に入れない", () => {
    expect(PROGRESSIONS.map((progression) => progression.name)).not.toContain("順次下降");
  });

  it("基本は丸サ進行と Just the Two of Us進行。最初は丸サ進行で始める", () => {
    expect(HOME_PROGRESSIONS.map((progression) => progression.name)).toEqual(["丸サ進行", "Just the Two of Us進行"]);
    expect(START_PROGRESSION.name).toBe("丸サ進行");
    expect(START_PROGRESSION.chords[0]).toBe("Fmaj7");
  });

  it("区切りでは、基本の進行を選ばれやすくする", () => {
    for (const home of HOME_PROGRESSIONS) expect(sectionBias(home)).toBeGreaterThan(1);
    expect(sectionBias(progressionById("royal-road")!)).toBe(1);
  });
});
