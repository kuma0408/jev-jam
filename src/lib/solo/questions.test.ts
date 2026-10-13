import { describe, expect, it } from "vitest";
import { buildPlanQuestions, buildSlotQuestions } from "./questions.ts";

describe("buildSlotQuestions", () => {
  it("スロットの数だけchoiceの質問を作る", () => {
    const questions = buildSlotQuestions("Dm7", 8);
    expect(Object.keys(questions)).toEqual([
      "slot_0",
      "slot_1",
      "slot_2",
      "slot_3",
      "slot_4",
      "slot_5",
      "slot_6",
      "slot_7",
    ]);
    expect(Object.values(questions).every((q) => q.type === "choice")).toBe(true);
  });

  it("選択肢は候補の7音と、休符と、前の音を伸ばす、の9つ", () => {
    const { slot_0 } = buildSlotQuestions("Dm7", 8);
    expect(Object.keys(slot_0!.criteria)).toEqual(["D", "E", "F", "G", "A", "B", "C", "rest", "hold"]);
  });

  it("表拍と裏拍で指示文を変える", () => {
    const questions = buildSlotQuestions("Dm7", 8);
    expect(questions.slot_0!.instructions).toContain("downbeat");
    expect(questions.slot_1!.instructions).toContain("off-beat");
    expect(questions.slot_2!.instructions).toContain("downbeat");
  });
});

describe("buildPlanQuestions", () => {
  it("フレーズの方針を決める質問を作る", () => {
    const questions = buildPlanQuestions("Dm7");
    expect(Object.keys(questions)).toEqual(["contour", "density", "landing"]);
  });

  it("着地音の選択肢はコードの構成音だけにする", () => {
    const { landing } = buildPlanQuestions("Dm7");
    expect(Object.keys(landing!.criteria)).toEqual(["D", "F", "A", "C"]);
  });
});
