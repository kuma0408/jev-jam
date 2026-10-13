import { describe, expect, it } from "vitest";
import { CONTOURS, contourById } from "./contours.ts";

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
