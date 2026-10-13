import { describe, expect, it } from "vitest";
import { CONTOURS, contourById, favorLeaps } from "./contours.ts";

const stepsOf = (id: string, count: number) => contourById(id).notes(count).map((note) => note.step);

describe("CONTOURS（音の動きの一覧）", () => {
  it("IDは c- で始まり、重複せず、APIで送り返せる文字だけを使う", () => {
    const ids = CONTOURS.map((contour) => contour.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(24);
    for (const id of ids) {
      expect(id).toMatch(/^c-[a-z0-9-]{1,37}$/);
    }
  });

  it("説明はJevが読みやすい英語で書く", () => {
    for (const contour of CONTOURS) {
      expect(contour.description).toMatch(/^[\x20-\x7e]{10,}$/);
    }
  });

  it("どの動きも、1音から8音まで求められた数ちょうどの音を返す", () => {
    for (const contour of CONTOURS) {
      for (let count = 1; count <= 8; count++) {
        const notes = contour.notes(count);
        expect(notes).toHaveLength(count);
        for (const note of notes) {
          expect(Number.isInteger(note.step)).toBe(true);
        }
      }
    }
  });

  it("どの動きも、2オクターブを超えて広がらない", () => {
    for (const contour of CONTOURS) {
      const steps = contour.notes(8).map((note) => note.step);
      expect(Math.max(...steps) - Math.min(...steps)).toBeLessThanOrEqual(14);
    }
  });

  it("スケールを順に上がる・下がる", () => {
    expect(stepsOf("c-rise-from-third", 4)).toEqual([2, 3, 4, 5]);
    expect(stepsOf("c-fall-from-fifth", 4)).toEqual([4, 3, 2, 1]);
  });

  it("アルペジオはコードの構成音をたどる", () => {
    expect(stepsOf("c-arpeggio-up-root", 5)).toEqual([0, 2, 4, 6, 7]);
    expect(stepsOf("c-arpeggio-down-seventh", 5)).toEqual([6, 4, 2, 0, -1]);
  });

  it("デジタルパターン（1-2-3-5）は、4音ごとに起点を上げて連鎖する", () => {
    expect(stepsOf("c-digital-up", 8)).toEqual([0, 1, 2, 4, 2, 3, 4, 6]);
  });

  it("山なりの動きは、真ん中で頂点に達して戻る", () => {
    expect(stepsOf("c-arch", 4)).toEqual([2, 3, 4, 3]);
    expect(stepsOf("c-arch", 8)).toEqual([2, 3, 4, 5, 6, 5, 4, 3]);
  });

  it("囲い込みは、上の音と半音下の音で目的の音を挟む", () => {
    expect(contourById("c-enclose-third").notes(3)).toEqual([{ step: 3 }, { step: 2, alt: -1 }, { step: 2 }]);
  });

  it("音が足りないときの囲い込みは、目的の音を優先する", () => {
    expect(contourById("c-enclose-third").notes(1)).toEqual([{ step: 2 }]);
    expect(contourById("c-enclose-third").notes(2)).toEqual([{ step: 2, alt: -1 }, { step: 2 }]);
  });

  it("1音だけのときは、動きによって違う度数の音になる（長い音の高さに幅を持たせる）", () => {
    const firsts = new Set(CONTOURS.map((contour) => contour.notes(1)[0]!.step));
    expect(firsts.size).toBeGreaterThanOrEqual(6);
  });

  it("無いIDはエラーにする", () => {
    expect(() => contourById("c-no-such")).toThrow();
  });
});

describe("跳躍のある動き", () => {
  /** 8音ぶんの、隣り合う音の段差の平均 */
  const averageLeap = (id: string) => {
    const steps = contourById(id).notes(8).map((note) => note.step);
    return steps.slice(1).reduce((sum, step, i) => sum + Math.abs(step - steps[i]!), 0) / 7;
  };

  it("どの動きにも、隣の音へ動くだけか、跳躍を含むかの印が付いている", () => {
    for (const contour of CONTOURS) {
      expect(["step", "mixed", "leap"]).toContain(contour.motion);
    }
  });

  it("跳躍の動きが十分にあり、実際に大きく跳ぶ", () => {
    const leaps = CONTOURS.filter((contour) => contour.motion === "leap");
    expect(leaps.length).toBeGreaterThanOrEqual(8);
    for (const contour of leaps) {
      expect(averageLeap(contour.id)).toBeGreaterThanOrEqual(2);
    }
  });

  it("隣の音へ動くだけの動きは、実際に段差が小さい", () => {
    for (const contour of CONTOURS.filter((contour) => contour.motion === "step")) {
      expect(averageLeap(contour.id)).toBeLessThan(1.5);
    }
  });

  it("3rd・7th・9thから始まる動きが、ルートや5thから始まる動きより多い", () => {
    const firsts = CONTOURS.map((contour) => ((contour.notes(4)[0]!.step % 7) + 7) % 7);
    const rootOrFifth = firsts.filter((step) => step === 0 || step === 4).length;
    const color = firsts.filter((step) => step === 2 || step === 6 || step === 1).length;
    expect(color).toBeGreaterThan(rootOrFifth);
  });
});

describe("favorLeaps（跳躍のある動きを選ばれやすくする）", () => {
  const uniform = Object.fromEntries(CONTOURS.map((contour) => [contour.id, 1]));
  const shareOf = (odds: Record<string, number>, motion: string) => {
    const total = Object.values(odds).reduce((sum, value) => sum + value, 0);
    return CONTOURS.filter((contour) => contour.motion === motion).reduce((sum, contour) => sum + odds[contour.id]!, 0) / total;
  };

  it("跳躍の取り分を増やし、隣の音へ動くだけの動きの取り分を減らす", () => {
    const adjusted = favorLeaps(uniform);
    expect(shareOf(adjusted, "leap")).toBeGreaterThan(shareOf(uniform, "leap"));
    expect(shareOf(adjusted, "step")).toBeLessThan(shareOf(uniform, "step"));
  });

  it("ルートや5thから始まる動きは、選ばれにくくする", () => {
    const adjusted = favorLeaps({ "c-rise-from-root": 1, "c-rise-from-third": 1 });
    expect(adjusted["c-rise-from-root"]).toBeLessThan(adjusted["c-rise-from-third"]!);
  });

  it("どの動きの確率も0にはしない", () => {
    for (const value of Object.values(favorLeaps(uniform))) {
      expect(value).toBeGreaterThan(0);
    }
  });
});
