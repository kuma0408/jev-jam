import { describe, expect, it } from "vitest";
import {
  RHYTHMS,
  TIE_RHYTHMS,
  boostSixteenths,
  favorDownbeat,
  holdBackLongNotes,
  holdBackTies,
  keepRunning,
  leadsOut,
  rhythmById,
  rhythmsFor,
  tempoBand,
} from "./rhythms.ts";

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

describe("16分音符で走るリズム", () => {
  const runs = RHYTHMS.filter((rhythm) => rhythm.run);

  it("半小節を16分音符でほぼ埋めるリズムに印が付いている", () => {
    expect(runs.length).toBeGreaterThanOrEqual(3);
    for (const rhythm of runs) {
      expect(rhythm.sixteenths).toBe(true);
      expect(rhythm.hits.length).toBeGreaterThanOrEqual(6);
    }
  });

  it("長い音に3〜4個の16分音符を添えるだけのリズムには、印を付けない", () => {
    expect(rhythmById("r-long-sixteenth-pickup").run).toBeFalsy();
    expect(rhythmById("r-late-sixteenth-four").run).toBeFalsy();
  });

  it("盛り上がりが中くらいでも選ばれるよう、音数の段階は最大にしない", () => {
    for (const rhythm of runs) {
      expect(rhythm.energy).toBeLessThanOrEqual(3);
    }
  });
});

describe("boostSixteenths（16分音符のメリハリを付ける）", () => {
  const uniform = (bpm: number) => Object.fromEntries(rhythmsFor(bpm).map((rhythm) => [rhythm.id, 1]));
  const shareOf = (odds: Record<string, number>, pick: (rhythm: (typeof RHYTHMS)[number]) => boolean) => {
    const total = Object.values(odds).reduce((sum, value) => sum + value, 0);
    return RHYTHMS.filter(pick).reduce((sum, rhythm) => sum + (odds[rhythm.id] ?? 0), 0) / total;
  };
  const isRun = (rhythm: (typeof RHYTHMS)[number]) => rhythm.run === true;
  const isSnippet = (rhythm: (typeof RHYTHMS)[number]) => rhythm.sixteenths === true && !rhythm.run;

  it("遅いテンポでは、走るリズムの取り分を大きく増やす", () => {
    expect(shareOf(boostSixteenths(uniform(70), 70), isRun)).toBeGreaterThan(shareOf(uniform(70), isRun) * 1.8);
  });

  it("3〜4個だけ16分音符が入るリズムの取り分は減らす（ぱらぱら入るより、走るか伸ばすか）", () => {
    expect(shareOf(boostSixteenths(uniform(70), 70), isSnippet)).toBeLessThan(shareOf(uniform(70), isSnippet));
  });

  it("16分音符以外のリズムの確率は変えない", () => {
    expect(boostSixteenths({ "r-half": 0.3, "r-rest": 0.2 }, 70)).toEqual({ "r-half": 0.3, "r-rest": 0.2 });
  });
});

describe("keepRunning（走り出したら、しばらく走り続ける）", () => {
  const odds = { "r-sixteenth-run": 0.1, "r-half": 0.1, "r-rest": 0.1 };

  it("直前の半小節が走っていたら、走るリズムを強く選ばれやすくする", () => {
    const adjusted = keepRunning(odds, 1);
    expect(adjusted["r-sixteenth-run"]).toBeGreaterThan(0.3);
    expect(adjusted["r-half"]).toBe(0.1);
  });

  it("走っていなければ、何も変えない", () => {
    expect(keepRunning(odds, 0)).toEqual(odds);
  });

  it("2小節（半小節4つ）走り続けたら、今度は止まりやすくする", () => {
    expect(keepRunning(odds, 4)["r-sixteenth-run"]).toBeLessThan(0.1);
  });
});

describe("holdBackLongNotes（伸ばすだけのリズムを選ばれにくくする）", () => {
  it("1音を長く伸ばすだけのリズムの確率を下げる", () => {
    const adjusted = holdBackLongNotes({ "r-whole": 1, "r-half": 1, "r-offbeat-long": 1, "r-late-long": 1, "r-four-eighths": 1 });
    expect(adjusted["r-whole"]).toBeLessThan(1);
    expect(adjusted["r-half"]).toBeLessThan(1);
    expect(adjusted["r-offbeat-long"]).toBeLessThan(1);
    expect(adjusted["r-late-long"]).toBeLessThan(1);
    expect(adjusted["r-four-eighths"]).toBe(1);
  });

  it("確率を0にはしない（伸ばす音も残す）", () => {
    expect(holdBackLongNotes({ "r-whole": 1 })["r-whole"]).toBeGreaterThan(0);
  });
});

describe("TIE_RHYTHMS（前の小節の音を持ち越して伸ばすリズム）", () => {
  it("最初の音が持ち越しで、小節の頭から始まる", () => {
    expect(TIE_RHYTHMS.length).toBeGreaterThanOrEqual(3);
    for (const rhythm of TIE_RHYTHMS) {
      expect(rhythm.id).toMatch(/^r-tie-[a-z0-9-]{1,33}$/);
      expect(rhythm.hits[0]).toMatchObject({ at: 0, tie: true });
      expect(rhythm.hits.slice(1).every((hit) => !hit.tie)).toBe(true);
      expect(rhythm.description).toMatch(/^[\x20-\x7e]{10,}$/);
    }
  });

  it("ふだんの選択肢には入れない（持ち越せるときだけ別に出す）", () => {
    for (const bpm of [70, 130, 220]) {
      expect(rhythmsFor(bpm).some((rhythm) => rhythm.hits.some((hit) => hit.tie))).toBe(false);
    }
  });

  it("IDから引ける", () => {
    expect(rhythmById(TIE_RHYTHMS[0]!.id)).toBe(TIE_RHYTHMS[0]);
  });
});

describe("leadsOut（次の小節へつなぐ形で終わるリズムか）", () => {
  it("終わり際の短い音で終わるリズムは、次へつなぐ形とみなす", () => {
    expect(leadsOut(rhythmById("r-pickup-two"))).toBe(true);
    expect(leadsOut(rhythmById("r-tied-push"))).toBe(true);
    expect(leadsOut(rhythmById("r-four-eighths"))).toBe(true);
  });

  it("伸ばして終わるリズムや、途中で終わるリズム、休みは違う", () => {
    expect(leadsOut(rhythmById("r-half"))).toBe(false);
    expect(leadsOut(rhythmById("r-two-quarters"))).toBe(false);
    expect(leadsOut(rhythmById("r-three-eighths"))).toBe(false);
    expect(leadsOut(rhythmById("r-rest"))).toBe(false);
  });
});

describe("favorDownbeat（小節の頭から鳴るリズムを選ばれやすくする）", () => {
  const odds = { "r-half": 1, "r-offbeat-long": 1, "r-late-long": 1, "r-rest": 1 };

  it("遅れて入るリズムと休みの確率を下げ、頭から鳴るリズムは変えない", () => {
    const adjusted = favorDownbeat(odds);
    expect(adjusted["r-half"]).toBe(1);
    expect(adjusted["r-offbeat-long"]).toBeLessThan(1);
    expect(adjusted["r-late-long"]).toBeLessThan(1);
    expect(adjusted["r-rest"]).toBeLessThan(adjusted["r-offbeat-long"]!);
  });

  it("確率を0にはしない（遅れて入る吹き方も残す）", () => {
    for (const value of Object.values(favorDownbeat(odds))) {
      expect(value).toBeGreaterThan(0);
    }
  });
});

describe("holdBackTies（持ち越しを選ばれにくくする）", () => {
  it("持ち越しのリズムの確率だけを下げる", () => {
    const adjusted = holdBackTies({ "r-tie-long": 0.1, "r-half": 0.1 });
    expect(adjusted["r-tie-long"]).toBeLessThan(0.1);
    expect(adjusted["r-half"]).toBe(0.1);
  });

  it("確率を0にはしない（持ち越しは残す）", () => {
    expect(holdBackTies({ "r-tie-short": 0.1 })["r-tie-short"]).toBeGreaterThan(0);
  });
});
