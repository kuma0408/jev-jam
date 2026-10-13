import { type NoteName, pitchClassOf } from "../music/chord.ts";
import { HOLD, REST } from "./questions.ts";

export type SlotChoice = NoteName | typeof REST | typeof HOLD;

export type NoteEvent = {
  /** MIDIノート番号 */
  pitch: number;
  startSlot: number;
  lengthSlots: number;
};

export type PhraseOptions = {
  /** 直前に鳴っていた音。ここから近いオクターブを選んで跳躍を抑える */
  previousPitch: number;
  low: number;
  high: number;
};

/** スロットごとの選択（音名、休符、伸ばす）を、開始位置と長さを持つ音の列に変換する */
export function toNoteEvents(choices: readonly SlotChoice[], options: PhraseOptions): NoteEvent[] {
  const events: NoteEvent[] = [];
  let previousPitch = options.previousPitch;
  // 直前のスロットで鳴っている音。休符を挟むとholdの対象が無くなる
  let sounding: NoteEvent | undefined;

  choices.forEach((choice, slot) => {
    if (choice === REST) {
      sounding = undefined;
    } else if (choice === HOLD) {
      if (sounding) {
        sounding.lengthSlots += 1;
      }
    } else {
      const pitch = nearestPitch(pitchClassOf(choice), previousPitch, options.low, options.high);
      sounding = { pitch, startSlot: slot, lengthSlots: 1 };
      events.push(sounding);
      previousPitch = pitch;
    }
  });
  return events;
}

/** 音域内で、基準の音に最も近い指定ピッチクラスの音を返す */
function nearestPitch(pitchClass: number, reference: number, low: number, high: number): number {
  let best: number | undefined;
  for (let pitch = low; pitch <= high; pitch++) {
    if (pitch % 12 !== pitchClass) continue;
    if (best === undefined || Math.abs(pitch - reference) < Math.abs(best - reference)) {
      best = pitch;
    }
  }
  if (best === undefined) {
    throw new Error(`音域 ${low}〜${high} に該当する音がありません`);
  }
  return best;
}
