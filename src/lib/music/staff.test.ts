import { describe, expect, it } from "vitest";
import { KNOWN_CHORDS } from "../progression/candidates.ts";
import { fitsChord } from "../solo/aim.ts";
import { chordTones, pitchClassOf } from "./chord.ts";
import { pitchAtStep, stepOf, voicingUnder } from "./staff.ts";

describe("stepOf（五線の上での位置）", () => {
  it("真ん中のド（C4）を0として、線と間を1段ずつ数える", () => {
    expect(stepOf(60)).toEqual({ step: 0, accidental: null });
    // ト音記号の五線のいちばん下の線はミ（E4）
    expect(stepOf(64)).toEqual({ step: 2, accidental: null });
    expect(stepOf(72)).toEqual({ step: 7, accidental: null });
    expect(stepOf(57)).toEqual({ step: -2, accidental: null });
  });

  it("黒鍵の音は、フラットを付けて上の音の位置に書く（音名の表記に合わせる）", () => {
    expect(stepOf(70)).toEqual({ step: 6, accidental: "flat" });
    expect(stepOf(61)).toEqual({ step: 1, accidental: "flat" });
  });
});

describe("pitchAtStep（叩いた位置で鳴らす音）", () => {
  it("その位置の音がコードに合えば、その音を鳴らす", () => {
    expect(pitchAtStep(2, "Cmaj7")).toBe(64);
    expect(pitchAtStep(4, "Cmaj7")).toBe(67);
  });

  it("その位置の音がコードとぶつかるなら、近くの合う音にする", () => {
    // Cmaj7 の上の F はぶつかるので、すぐ下の E にする
    expect(pitchAtStep(3, "Cmaj7")).toBe(64);
  });

  it.each(KNOWN_CHORDS)("%s: どの位置を叩いても、合う音が、その位置の近くで鳴る", (chord) => {
    const naturals = [60, 62, 64, 65, 67, 69, 71];
    for (let step = 0; step <= 14; step++) {
      const natural = naturals[step % 7]! + 12 * Math.floor(step / 7);
      const pitch = pitchAtStep(step, chord);
      expect(fitsChord(pitch, chord)).toBe(true);
      expect(Math.abs(pitch - natural)).toBeLessThanOrEqual(2);
    }
  });
});

describe("voicingUnder（叩いた音をいちばん上にした和音）", () => {
  it("いちばん上の音の下に、コードの音を3つ重ねる。すぐ下の半音でぶつかる音は飛ばす", () => {
    // C の下の B は半音でぶつかるので、1オクターブ下に回す
    expect(voicingUnder(72, "Cmaj7")).toEqual([59, 64, 67, 72]);
  });

  it.each(KNOWN_CHORDS)("%s: 4音で、上の音は叩いた音、下の3音はコードの音", (chord) => {
    const tones = chordTones(chord).map(pitchClassOf);
    for (const top of [62, 67, 72, 77]) {
      const voicing = voicingUnder(top, chord);
      expect(voicing).toHaveLength(4);
      expect(voicing.at(-1)).toBe(top);
      for (const pitch of voicing.slice(0, -1)) {
        expect(tones).toContain(pitch % 12);
        expect(top - pitch).toBeGreaterThan(1);
      }
      expect(top - voicing[0]!).toBeLessThanOrEqual(14);
    }
  });
});
