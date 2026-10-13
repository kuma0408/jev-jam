import { describe, expect, it } from "vitest";
import { CELLS, cellById, cellsForTempo } from "./cells.ts";

describe("CELLS（半小節の型の一覧）", () => {
  it("Jevのchoiceに収まる数で、十分な種類がある", () => {
    expect(CELLS.length).toBeGreaterThanOrEqual(40);
    expect(CELLS.length).toBeLessThanOrEqual(255);
  });

  it("IDは重複せず、APIで送り返せる文字だけを使う", () => {
    const ids = CELLS.map((cell) => cell.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^[a-z0-9-]{1,40}$/);
    }
  });

  it("説明はJevが読みやすい英語で書く", () => {
    for (const cell of CELLS) {
      expect(cell.description).toMatch(/^[\x20-\x7e]{10,}$/);
    }
  });

  it("どの音も半小節（2拍）の中に収まる", () => {
    for (const cell of CELLS) {
      for (const note of cell.notes) {
        expect(note.at).toBeGreaterThanOrEqual(0);
        expect(note.dur).toBeGreaterThan(0);
        expect(note.at + note.dur).toBeLessThanOrEqual(2 + 1e-9);
      }
    }
  });

  it("音は鳴る順に並んでいる", () => {
    for (const cell of CELLS) {
      const starts = cell.notes.map((note) => note.at);
      expect(starts).toEqual([...starts].sort((a, b) => a - b));
    }
  });

  it("休む型、16分音符の型、3連符の型を含む", () => {
    expect(cellById("rest").notes).toEqual([]);
    expect(CELLS.some((cell) => cell.density === "sixteenths")).toBe(true);
    expect(CELLS.some((cell) => cell.density === "triplets")).toBe(true);
  });

  it("3連符の型はスウィングさせない", () => {
    for (const cell of CELLS.filter((cell) => cell.density === "triplets")) {
      expect(cell.straight).toBe(true);
    }
  });

  it("無いIDはエラーにする", () => {
    expect(() => cellById("no-such-cell")).toThrow();
  });
});

describe("cellsForTempo", () => {
  it("ゆっくりなテンポでは全部の型を使う", () => {
    expect(cellsForTempo(90)).toHaveLength(CELLS.length);
  });

  it("速いテンポでは16分音符の型を外す（速すぎて演奏にならないため）", () => {
    const fast = cellsForTempo(200);
    expect(fast.length).toBeGreaterThan(20);
    expect(fast.some((cell) => cell.density === "sixteenths")).toBe(false);
  });
});
