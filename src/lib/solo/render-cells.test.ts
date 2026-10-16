import { describe, expect, it } from "vitest";
import type { Cell } from "./cells.ts";
import { barEndLevel, renderCells } from "./render-cells.ts";

const range = { low: 53, high: 84 };
const plain = { dynamics: "medium", shape: "steady" } as const;

const cell = (notes: Cell["notes"], extra: Partial<Cell> = {}): Cell => ({ notes, ...extra });

const eighths = (steps: number[]): Cell["notes"] => steps.map((step, i) => ({ at: i * 0.5, dur: 0.5, step }));
const REST = cell([]);

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

  it("単旋律の楽器なので、次の音が始まったら前の音を切る", () => {
    // 前半は小節いっぱい伸ばす1音、後半は3拍目から動く
    const whole = cell([{ at: 0, dur: 4, step: 0 }]);
    const notes = renderCells([whole, cell(eighths([2]))], "Dm7", { previousPitch: 62, ...range, ...plain });
    expect(notes[0]!.durationBeats).toBe(2);
  });

  it("後ろに音が無ければ、伸ばした音は小節の終わりまで続く", () => {
    const whole = cell([{ at: 0, dur: 4, step: 0 }]);
    const notes = renderCells([whole, REST], "Dm7", { previousPitch: 62, ...range, ...plain });
    expect(notes[0]!.durationBeats).toBe(4);
  });

  it("小節の終わりを超えて伸びる音は、小節の終わりで切る", () => {
    const late = cell([{ at: 1, dur: 4, step: 0 }]);
    const notes = renderCells([REST, late], "Dm7", { previousPitch: 62, ...range, ...plain });
    expect(notes[0]!.startBeats + notes[0]!.durationBeats).toBe(4);
  });

  it("持ち越しの音は、直前の音と同じ高さにして印を付ける", () => {
    const tie = cell([
      { at: 0, dur: 1, step: 0, tie: true },
      { at: 1, dur: 0.5, step: 2 },
    ]);
    // 直前の音は E4(64)。Dm7 のスケールの音で、段の指定（ルート）とは違う
    const notes = renderCells([tie, REST], "Dm7", { previousPitch: 64, ...range, ...plain });
    expect(notes[0]).toMatchObject({ pitch: 64, startBeats: 0, durationBeats: 1, tie: true });
    // 続く音は、持ち越した音の近くから始める（3rd の F4）
    expect(notes[1]).toMatchObject({ pitch: 65 });
    expect(notes[1]!.tie).toBeUndefined();
  });

  it("高さの目標があれば、直前の音よりそちらへ寄った高さから始める", () => {
    const options = { previousPitch: 62, ...range, ...plain };
    const plainStart = renderCells([cell(eighths([0])), REST], "Dm7", options)[0]!.pitch;
    const aimedHigh = renderCells([cell(eighths([0])), REST], "Dm7", { ...options, targetPitch: 80 })[0]!.pitch;
    const aimedLow = renderCells([cell(eighths([0])), REST], "Dm7", { ...options, previousPitch: 74, targetPitch: 55 })[0]!.pitch;
    expect(plainStart).toBe(62);
    expect(aimedHigh).toBe(74);
    expect(aimedLow).toBe(62);
  });

  it("高さの目標があるときは、フレーズの最初の音ではなく、フレーズ全体の真ん中を目標に合わせる", () => {
    // ルートから7thまで上がるフレーズ（幅10半音）。最初の音を目標に合わせると、全体は目標より上に偏る
    const notes = renderCells([cell(eighths([0, 2, 4, 6])), REST], "Dm7", {
      previousPitch: 70,
      ...range,
      ...plain,
      targetPitch: 70,
    });
    const mean = notes.reduce((sum, note) => sum + note.pitch, 0) / notes.length;
    expect(Math.abs(mean - 70)).toBeLessThanOrEqual(6);
    expect(notes[0]!.pitch).toBeLessThan(70);
  });

  it("高さの目標があっても、持ち越しの音の高さは変えない", () => {
    const tie = cell([{ at: 0, dur: 1, step: 0, tie: true }]);
    const notes = renderCells([tie, REST], "Dm7", { previousPitch: 64, ...range, ...plain, targetPitch: 80 });
    expect(notes[0]!.pitch).toBe(64);
  });

  it("弱い指定と強い指定で、強さに2倍以上の差が付く（強弱の幅を広く取る）", () => {
    const options = { previousPitch: 62, ...range, shape: "steady" } as const;
    const soft = renderCells([cell(eighths([0])), REST], "Dm7", { ...options, dynamics: "soft" })[0]!.velocity;
    const loud = renderCells([cell(eighths([0])), REST], "Dm7", { ...options, dynamics: "loud" })[0]!.velocity;
    expect(loud / soft).toBeGreaterThanOrEqual(2);
  });

  it("「山なり」の強弱の動きを付けられる", () => {
    const line = [cell(eighths([0, 0, 0, 0])), cell(eighths([0, 0, 0, 0]))] as const;
    const options = { previousPitch: 62, ...range, dynamics: "medium" } as const;
    const surge = renderCells(line, "Dm7", { ...options, shape: "surge" });
    // 表拍どうしで比べる（0拍目・2拍目・3拍目）
    expect(surge[4]!.velocity).toBeGreaterThan(surge[0]!.velocity);
    expect(surge[4]!.velocity).toBeGreaterThan(surge[6]!.velocity);
  });

  it("強いクレッシェンドでも、小節の終わりまで上限に届かずに上がり続ける", () => {
    // 3拍目の裏と4拍目の裏（どちらも裏拍）
    const late = cell([
      { at: 0.5, dur: 0.5, step: 0 },
      { at: 1.5, dur: 0.5, step: 0 },
    ]);
    const notes = renderCells([REST, late], "Dm7", { previousPitch: 62, ...range, dynamics: "loud", shape: "crescendo" });
    expect(notes[1]!.velocity).toBeGreaterThan(notes[0]!.velocity);
    expect(notes[1]!.velocity).toBeLessThan(1);
  });

  it("前の小節の終わりの音量から始めて、半小節かけてこの小節の音量へ移る", () => {
    const line = [cell(eighths([0, 0, 0, 0])), cell(eighths([0, 0, 0, 0]))] as const;
    const options = { previousPitch: 62, ...range, dynamics: "loud", shape: "steady" } as const;
    const own = renderCells(line, "Dm7", options);
    const joined = renderCells(line, "Dm7", { ...options, startLevel: 0.3 });
    // 頭の音は前の小節の終わりに近い弱さ（表拍の倍率 0.94 を掛ける）
    expect(joined[0]!.velocity).toBeCloseTo(0.3 * 0.94, 2);
    // 2拍目の頭は、前の小節の音量とこの小節の音量のちょうど中間
    expect(joined[2]!.velocity).toBeCloseTo(((0.3 + 0.9) / 2) * 0.94, 2);
    // 後半はこの小節の音量どおり
    expect(joined[4]!.velocity).toBeCloseTo(own[4]!.velocity, 5);
    expect(joined[7]!.velocity).toBeCloseTo(own[7]!.velocity, 5);
  });

  it("小節の終わりの音量を求められる（次の小節のつなぎに使う）", () => {
    expect(barEndLevel({ dynamics: "loud", shape: "steady" })).toBeCloseTo(0.9, 5);
    expect(barEndLevel({ dynamics: "loud", shape: "decrescendo" })).toBeLessThan(barEndLevel({ dynamics: "loud", shape: "steady" }));
    // 伴奏の質感による倍率も含める
    expect(barEndLevel({ dynamics: "loud", shape: "steady", velocityScale: 1.5 })).toBeCloseTo(1.35, 5);
  });

  it("持ち越しを禁じると、持ち越しの音だけを落として、続きの音は鳴らす", () => {
    const tie = cell([
      { at: 0, dur: 1, step: 0, tie: true },
      { at: 1, dur: 0.5, step: 2 },
    ]);
    const notes = renderCells([tie, REST], "Dm7", { previousPitch: 64, ...range, ...plain, allowTie: false });
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ startBeats: 1, pitch: 65 });
    expect(notes[0]!.tie).toBeUndefined();
  });

  it("休む型だけなら音を返さない", () => {
    expect(renderCells([REST, REST], "Dm7", { previousPitch: 62, ...range, ...plain })).toEqual([]);
  });
});

describe("renderCells（音量の変化の幅）", () => {
  const line = [cell(eighths([0, 0, 0, 0])), cell(eighths([0, 0, 0, 0]))] as const;
  const options = { previousPitch: 62, ...range, dynamics: "loud" } as const;

  it("デクレッシェンドでは、小節の終わりで頭の半分より弱くなる", () => {
    expect(barEndLevel({ dynamics: "loud", shape: "decrescendo" })).toBeLessThan(0.9 * 0.4);
    const down = renderCells(line, "Dm7", { ...options, shape: "decrescendo" });
    // 表拍どうし（0拍目と3拍目）で比べる
    expect(down[6]!.velocity).toBeLessThan(down[0]!.velocity * 0.6);
  });

  it("クレッシェンドでは、小節の頭が終わりの半分より弱い", () => {
    const up = renderCells(line, "Dm7", { ...options, shape: "crescendo" });
    expect(up[0]!.velocity).toBeLessThan(up[6]!.velocity * 0.6);
  });

  it("休みの直前の音ほど弱くして、フレーズを吐き切るように閉じる", () => {
    const closing = renderCells([line[0], REST], "Dm7", { ...options, shape: "steady" });
    const going = renderCells(line, "Dm7", { ...options, shape: "steady" });
    // 休みの直前の3音は、続くフレーズの同じ音より弱く、後ろほど弱い
    expect(closing[3]!.velocity).toBeLessThan(going[3]!.velocity);
    expect(closing[3]!.velocity / going[3]!.velocity).toBeLessThan(closing[2]!.velocity / going[2]!.velocity);
    expect(closing[2]!.velocity / going[2]!.velocity).toBeLessThan(closing[1]!.velocity / going[1]!.velocity);
    // それより前の音は変えない
    expect(closing[0]!.velocity).toBeCloseTo(going[0]!.velocity, 5);
  });

  it("小節の終わりまで鳴っている音は、次の小節で続くかもしれないので弱めない", () => {
    const toTheEnd = renderCells([REST, line[1]], "Dm7", { ...options, shape: "steady" });
    const steady = renderCells(line, "Dm7", { ...options, shape: "steady" });
    expect(toTheEnd.at(-1)!.velocity).toBeCloseTo(steady.at(-1)!.velocity, 5);
  });
});
