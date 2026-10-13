import { describe, expect, it } from "vitest";
import { KNOWN_CHORDS } from "../progression/candidates.ts";
import { fitsChord } from "../solo/aim.ts";
import { PAD_COUNT, padPitches } from "./pads.ts";

describe("padPitches", () => {
  it("コードに合う音だけを、低い順に8つ返す", () => {
    expect(PAD_COUNT).toBe(8);
    // Cmaj7 では F（3rd とぶつかる音）を飛ばす
    expect(padPitches("Cmaj7", 60)).toEqual([60, 62, 64, 67, 69, 71, 72, 74]);
  });

  it("コードが変わると、同じ高さのあたりで、そのコードに合う音に入れ替わる", () => {
    expect(padPitches("Dm7", 60)).toEqual([60, 62, 64, 65, 67, 69, 71, 72]);
  });

  describe.each(KNOWN_CHORDS)("%s", (chord) => {
    const pitches = padPitches(chord, 60);

    it("どの音も、そのコードの上で伸ばしてよい音である", () => {
      expect(pitches).toHaveLength(PAD_COUNT);
      for (const pitch of pitches) expect(fitsChord(pitch, chord)).toBe(true);
    });

    it("左ほど低く、右ほど高い", () => {
      for (let index = 1; index < pitches.length; index++) {
        expect(pitches[index]!).toBeGreaterThan(pitches[index - 1]!);
      }
    });

    it("いちばん左の音は、コードによらずほぼ同じ高さになる", () => {
      expect(pitches[0]!).toBeGreaterThanOrEqual(60);
      expect(pitches[0]!).toBeLessThan(63);
    });
  });
});
