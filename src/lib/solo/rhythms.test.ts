import { describe, expect, it } from "vitest";
import { RHYTHMS, boostSixteenths, rhythmById, rhythmsFor, tempoBand } from "./rhythms.ts";

describe("tempoBand", () => {
  it("テンポを遅い・中間・速いの3つの帯に分ける", () => {
    expect(tempoBand(70)).toBe("slow");
    expect(tempoBand(99)).toBe("slow");
    expect(tempoBand(100)).toBe("medium");
    expect(tempoBand(180)).toBe("medium");
    expect(tempoBand(181)).toBe("fast");
    expect(tempoBand(240)).toBe("fast");
  });
});

describe("RHYTHMS（半小節のリズムの一覧）", () => {
  it("IDは r- で始まり、重複せず、APIで送り返せる文字だけを使う", () => {
    const ids = RHYTHMS.map((rhythm) => rhythm.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^r-[a-z0-9-]{1,37}$/);
    }
  });

  it("説明はJevが読みやすい英語で書く", () => {
    for (const rhythm of RHYTHMS) {
      expect(rhythm.description).toMatch(/^[\x20-\x7e]{10,}$/);
    }
  });

  it("音は鳴る順に並び、半小節（2拍）の中で始まる", () => {
    for (const rhythm of RHYTHMS) {
      const starts = rhythm.hits.map((hit) => hit.at);
      expect(starts).toEqual([...starts].sort((a, b) => a - b));
      for (const hit of rhythm.hits) {
        expect(hit.at).toBeGreaterThanOrEqual(0);
        expect(hit.at).toBeLessThan(2);
        expect(hit.dur).toBeGreaterThan(0);
      }
    }
  });

  it("小節いっぱい伸ばす1音を除き、音は半小節の中で終わる", () => {
    for (const rhythm of RHYTHMS.filter((rhythm) => rhythm.id !== "r-whole")) {
      for (const hit of rhythm.hits) {
        expect(hit.at + hit.dur).toBeLessThanOrEqual(2 + 1e-9);
      }
    }
  });

  it("無いIDはエラーにする", () => {
    expect(rhythmById("r-rest").hits).toEqual([]);
    expect(() => rhythmById("r-no-such")).toThrow();
  });
});

describe("rhythmsFor（テンポ帯ごとの語彙）", () => {
  const maxNotes = (bpm: number) => Math.max(...rhythmsFor(bpm).map((rhythm) => rhythm.hits.length));
  const shortest = (bpm: number) =>
    Math.min(...rhythmsFor(bpm).flatMap((rhythm) => rhythm.hits.slice(1).map((hit, i) => hit.at - rhythm.hits[i]!.at)));

  it("どの帯にも、休みと長い音と十分な種類がある", () => {
    for (const bpm of [70, 130, 220]) {
      const ids = rhythmsFor(bpm).map((rhythm) => rhythm.id);
      expect(ids).toContain("r-rest");
      expect(ids).toContain("r-half");
      expect(ids.length).toBeGreaterThanOrEqual(14);
    }
  });

  it("遅いテンポには、スウィングさせない均等な16分音符のリズムがある", () => {
    const straightSixteenths = rhythmsFor(70).filter(
      (rhythm) => rhythm.straight && rhythm.hits.some((hit, i) => i > 0 && hit.at - rhythm.hits[i - 1]!.at === 0.25),
    );
    expect(straightSixteenths.length).toBeGreaterThanOrEqual(4);
  });

  it("遅いテンポには、2分音符や4分音符で歌うリズムがある", () => {
    const ids = rhythmsFor(70).map((rhythm) => rhythm.id);
    expect(ids).toContain("r-whole");
    expect(ids).toContain("r-two-quarters");
  });

  it("速いテンポでは16分音符を使わず、8分音符より細かく動かない", () => {
    expect(shortest(220)).toBeGreaterThanOrEqual(0.5);
    expect(maxNotes(220)).toBeLessThanOrEqual(4);
  });

  it("速いテンポでは、8分音符が4つ続くリズムは少数にとどめる", () => {
    const fast = rhythmsFor(220);
    const running = fast.filter((rhythm) => rhythm.hits.length >= 4);
    expect(running.length).toBeLessThanOrEqual(fast.length / 5);
  });
});

describe("16分音符のリズム", () => {
  const sixteenths = RHYTHMS.filter((rhythm) => rhythm.sixteenths);

  it("16分音符を含むリズムには印が付いていて、どれもスウィングさせない", () => {
    expect(sixteenths.length).toBeGreaterThanOrEqual(8);
    for (const rhythm of sixteenths) {
      expect(rhythm.straight).toBe(true);
      expect(rhythm.hits.some((hit, i) => i > 0 && hit.at - rhythm.hits[i - 1]!.at === 0.25)).toBe(true);
    }
  });

  it("バラードの中に差し込める、音数の少ない16分音符のリズムがある", () => {
    const gentle = rhythmsFor(70).filter((rhythm) => rhythm.sixteenths && rhythm.energy <= 2);
    expect(gentle.length).toBeGreaterThanOrEqual(3);
  });

  it("速いテンポには16分音符のリズムを出さない", () => {
    expect(rhythmsFor(220).some((rhythm) => rhythm.sixteenths)).toBe(false);
  });
});

describe("boostSixteenths（16分音符を選ばれやすくする）", () => {
  const uniform = (bpm: number) => Object.fromEntries(rhythmsFor(bpm).map((rhythm) => [rhythm.id, 1]));
  const share = (odds: Record<string, number>) => {
    const total = Object.values(odds).reduce((sum, value) => sum + value, 0);
    const marked = RHYTHMS.filter((rhythm) => rhythm.sixteenths).reduce((sum, rhythm) => sum + (odds[rhythm.id] ?? 0), 0);
    return marked / total;
  };

  it("遅いテンポでは、16分音符のリズムの取り分を大きく増やす", () => {
    expect(share(boostSixteenths(uniform(70), 70))).toBeGreaterThan(share(uniform(70)) * 1.4);
  });

  it("中間のテンポでも少し増やす", () => {
    expect(share(boostSixteenths(uniform(130), 130))).toBeGreaterThan(share(uniform(130)));
  });

  it("16分音符以外のリズムの確率は変えない", () => {
    expect(boostSixteenths({ "r-half": 0.3, "r-rest": 0.2 }, 70)).toEqual({ "r-half": 0.3, "r-rest": 0.2 });
  });
});
