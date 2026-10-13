import { describe, expect, it } from "vitest";
import { toNoteEvents } from "./phrase.ts";

// MIDIノート番号: 60=C4, 62=D4, 65=F4, 69=A4, 72=C5
const range = { low: 55, high: 84 };

describe("toNoteEvents", () => {
  it("スロットごとの選択を、開始位置と長さを持つ音に変換する", () => {
    const events = toNoteEvents(["D", "rest", "F", "hold", "hold", "A", "rest", "C"], { previousPitch: 62, ...range });
    expect(events).toEqual([
      { pitch: 62, startSlot: 0, lengthSlots: 1 },
      { pitch: 65, startSlot: 2, lengthSlots: 3 },
      { pitch: 69, startSlot: 5, lengthSlots: 1 },
      { pitch: 72, startSlot: 7, lengthSlots: 1 },
    ]);
  });

  it("直前の音に一番近いオクターブを選ぶ", () => {
    // B4(71)の次のCは、C4(60)ではなくC5(72)
    expect(toNoteEvents(["C"], { previousPitch: 71, ...range })).toEqual([{ pitch: 72, startSlot: 0, lengthSlots: 1 }]);
  });

  it("音域を超えるオクターブは選ばない", () => {
    // B5(83)の次のDは、D6(86)が音域外なのでD5(74)
    expect(toNoteEvents(["D"], { previousPitch: 83, ...range })).toEqual([{ pitch: 74, startSlot: 0, lengthSlots: 1 }]);
  });

  it("伸ばす対象の音が無いholdは休符として扱う", () => {
    expect(toNoteEvents(["hold", "D", "rest", "hold"], { previousPitch: 62, ...range })).toEqual([
      { pitch: 62, startSlot: 1, lengthSlots: 1 },
    ]);
  });
});
