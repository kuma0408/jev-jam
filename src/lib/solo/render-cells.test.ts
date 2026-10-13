import { describe, expect, it } from "vitest";
import type { Cell } from "./cells.ts";
import { renderCells } from "./render-cells.ts";

const range = { low: 53, high: 84 };
const plain = { dynamics: "medium", shape: "steady" } as const;

const cell = (notes: Cell["notes"], extra: Partial<Cell> = {}): Cell => ({
  id: "test",
  description: "test cell for unit tests",
  density: "eighths",
  notes,
  ...extra,
});

const eighths = (steps: number[]): Cell["notes"] => steps.map((step, i) => ({ at: i * 0.5, dur: 0.5, step }));
const REST = cell([], { density: "space" });

describe("renderCells", () => {
  it("度数で書いた型を、コードに合わせた音の高さに直す", () => {
    // Dm7 の ルート・3rd・5th・7th = D F A C
    const notes = renderCells([cell(eighths([0, 2, 4, 6])), REST], "Dm7", { previousPitch: 62, ...range, ...plain });
    expect(notes.map((note) => note.pitch)).toEqual([62, 65, 69, 72]);
    expect(notes.map((note) => note.startBeats)).toEqual([0, 0.5, 1, 1.5]);
  });

  it("後半の型は2拍後ろにずらす", () => {
    const notes = renderCells([REST, cell(eighths([0, 2]))], "Dm7", { previousPitch: 62, ...range, ...plain });
    expect(notes.map((note) => note.startBeats)).toEqual([2, 2.5]);
  });

  it("キーに合わせたスケールを使う（Cmaj7の4番目の音はF#ではなくF）", () => {
    const notes = renderCells([cell(eighths([2, 3])), REST], "Cmaj7", { previousPitch: 64, ...range, ...plain });
    expect(notes.map((note) => note.pitch)).toEqual([64, 65]);
  });

  it("7を超える度数は1オクターブ上、負の度数は下の音になる", () => {
    const notes = renderCells([cell(eighths([0, 7, -1])), REST], "Dm7", { previousPitch: 62, ...range, ...plain });
    expect(notes.map((note) => note.pitch)).toEqual([62, 74, 60]);
  });

  it("半音の変化（経過音やアプローチノート）を付けられる", () => {
    // Cmaj7 の3rdを上と半音下から挟む: F, Eb, E
    const enclosure = cell([
      { at: 0, dur: 0.5, step: 3 },
      { at: 0.5, dur: 0.5, step: 2, alt: -1 },
      { at: 1, dur: 1, step: 2 },
    ]);
    const notes = renderCells([enclosure, REST], "Cmaj7", { previousPitch: 65, ...range, ...plain });
    expect(notes.map((note) => note.pitch)).toEqual([65, 63, 64]);
  });

  it("直前の音に近い高さから始める", () => {
    const low = renderCells([cell(eighths([0])), REST], "Dm7", { previousPitch: 60, ...range, ...plain });
    const high = renderCells([cell(eighths([0])), REST], "Dm7", { previousPitch: 75, ...range, ...plain });
    expect(low[0]!.pitch).toBe(62);
    expect(high[0]!.pitch).toBe(74);
  });

  it("後半の型は、前半の最後の音に近い高さから始める", () => {
    const notes = renderCells([cell(eighths([0, 2, 4, 6])), cell(eighths([0]))], "Dm7", {
      previousPitch: 62,
      ...range,
      ...plain,
    });
    // 前半は D4 F4 A4 C5 で終わるので、後半のルートは D5
    expect(notes.at(-1)!.pitch).toBe(74);
  });

  it("音域からはみ出す型は、オクターブ単位でずらして収める", () => {
    const notes = renderCells([cell(eighths([0, 2, 4, 6, 8])), REST], "Dm7", { previousPitch: 84, ...range, ...plain });
    expect(Math.max(...notes.map((note) => note.pitch))).toBeLessThanOrEqual(range.high);
    expect(Math.min(...notes.map((note) => note.pitch))).toBeGreaterThanOrEqual(range.low);
  });

  it("強弱の指定で全体の強さが変わる", () => {
    const options = { previousPitch: 62, ...range, shape: "steady" } as const;
    const soft = renderCells([cell(eighths([0, 2])), REST], "Dm7", { ...options, dynamics: "soft" });
    const loud = renderCells([cell(eighths([0, 2])), REST], "Dm7", { ...options, dynamics: "loud" });
    expect(loud[0]!.velocity).toBeGreaterThan(soft[0]!.velocity);
  });

  it("クレッシェンドでは後ろの音ほど強く、デクレッシェンドでは弱くなる", () => {
    const line = [cell(eighths([0, 0, 0, 0])), cell(eighths([0, 0, 0, 0]))] as const;
    const options = { previousPitch: 62, ...range, dynamics: "medium" } as const;
    const up = renderCells(line, "Dm7", { ...options, shape: "crescendo" });
    const down = renderCells(line, "Dm7", { ...options, shape: "decrescendo" });
    // 表拍どうしで比べる
    expect(up[6]!.velocity).toBeGreaterThan(up[0]!.velocity);
    expect(down[6]!.velocity).toBeLessThan(down[0]!.velocity);
  });

  it("裏拍を表拍より少し強くして、ジャズらしいアクセントにする", () => {
    const notes = renderCells([cell(eighths([0, 0])), REST], "Dm7", { previousPitch: 62, ...range, ...plain });
    expect(notes[1]!.velocity).toBeGreaterThan(notes[0]!.velocity);
  });

  it("ゴーストノートは弱く、アクセントは強くする", () => {
    const accented = cell([
      { at: 0, dur: 0.5, step: 0, accent: "ghost" },
      { at: 1, dur: 0.5, step: 0 },
      { at: 0.5 + 1.5, dur: 0, step: 0 },
    ].slice(0, 2) as Cell["notes"]);
    const strong = cell([{ at: 1, dur: 0.5, step: 0, accent: "accent" }]);
    const options = { previousPitch: 62, ...range, ...plain };
    const ghost = renderCells([accented, REST], "Dm7", options);
    const accent = renderCells([strong, REST], "Dm7", options);
    expect(ghost[0]!.velocity).toBeLessThan(ghost[1]!.velocity);
    expect(accent[0]!.velocity).toBeGreaterThan(ghost[1]!.velocity);
  });

  it("強さは0〜1に収める", () => {
    const loud = cell([{ at: 0.5, dur: 0.5, step: 0, accent: "accent" }]);
    const notes = renderCells([loud, loud], "Dm7", { previousPitch: 62, ...range, dynamics: "loud", shape: "crescendo" });
    for (const note of notes) {
      expect(note.velocity).toBeLessThanOrEqual(1);
      expect(note.velocity).toBeGreaterThan(0);
    }
  });

  it("スウィングさせない型は、その音にも印を付ける", () => {
    const notes = renderCells([cell(eighths([0]), { straight: true }), cell(eighths([0]))], "Dm7", {
      previousPitch: 62,
      ...range,
      ...plain,
    });
    expect(notes.map((note) => note.swing)).toEqual([false, true]);
  });

  it("休む型だけなら音を返さない", () => {
    expect(renderCells([REST, REST], "Dm7", { previousPitch: 62, ...range, ...plain })).toEqual([]);
  });
});
