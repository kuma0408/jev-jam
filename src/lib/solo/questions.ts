import { soloCandidates } from "../music/solo-candidates.ts";

/** Jevのchoice質問。criteriaは「選択肢のラベル → 説明」 */
export type ChoiceQuestion = {
  type: "choice";
  instructions: string;
  criteria: Record<string, string>;
};

export const REST = "rest";
export const HOLD = "hold";

/**
 * 1小節を等分したスロットごとに「何を弾くか」を聞く質問を作る。
 * Jevは計数が苦手なので、拍の位置は番号ではなく表拍か裏拍かの意味で伝える。
 */
export function buildSlotQuestions(chord: string, slotCount: number): Record<string, ChoiceQuestion> {
  const criteria: Record<string, string> = {};
  for (const candidate of soloCandidates(chord)) {
    criteria[candidate.note] = candidate.description;
  }
  criteria[REST] = "Play nothing. Leave space so the phrase can breathe.";
  criteria[HOLD] = "Keep sustaining the previous note instead of playing a new one.";

  const questions: Record<string, ChoiceQuestion> = {};
  for (let slot = 0; slot < slotCount; slot++) {
    const position =
      slot % 2 === 0
        ? "a downbeat (strong, stable position)"
        : "an off-beat (weak, syncopated position)";
    const where = slot === 0 ? "the very first note of the bar" : slot === slotCount - 1 ? "the last note of the bar" : "the middle of the bar";
    questions[`slot_${slot}`] = {
      type: "choice",
      instructions: `What should the improvising soloist play at this moment over ${chord}? This is ${where}, on ${position}.`,
      criteria,
    };
  }
  return questions;
}

/** 小節全体のフレーズの方針を聞く質問を作る（2段階方式の1回目） */
export function buildPlanQuestions(chord: string): Record<string, ChoiceQuestion> {
  const landing: Record<string, string> = {};
  for (const candidate of soloCandidates(chord)) {
    if (candidate.kind === "chord-tone") {
      landing[candidate.note] = candidate.description;
    }
  }

  return {
    contour: {
      type: "choice",
      instructions: `What melodic shape should the next one-bar solo phrase over ${chord} have, given what was just played?`,
      criteria: {
        ascending: "The line climbs upward, building energy.",
        descending: "The line falls downward, releasing energy.",
        arch: "The line rises to a peak in the middle, then comes back down.",
        valley: "The line dips down in the middle, then climbs back up.",
        static: "The line hovers around the same few notes, like a riff.",
      },
    },
    density: {
      type: "choice",
      instructions: `How busy should the next one-bar solo phrase over ${chord} be, given what was just played?`,
      criteria: {
        sparse: "Only a few long notes with a lot of space.",
        medium: "A balanced mix of notes and rests.",
        busy: "A running line with a note on almost every position.",
      },
    },
    landing: {
      type: "choice",
      instructions: `Which note should the phrase over ${chord} aim for and land on?`,
      criteria: landing,
    },
  };
}
