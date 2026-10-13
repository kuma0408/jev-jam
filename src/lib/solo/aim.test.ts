import { describe, expect, it } from "vitest";
import { aimPitch, fitsChord } from "./aim.ts";

// MIDIノート番号: 62=D4, 64=E4, 65=F4, 66=F#4, 69=A4, 71=B4, 72=C5
describe("fitsChord（その音を、このコードの上で伸ばしてよいか）", () => {
  it("コードのスケールに含まれる音はよい", () => {
    expect(fitsChord(65, "Dm7")).toBe(true); // 3rd
    expect(fitsChord(64, "Dm7")).toBe(true); // 9th
  });

  it("5thも伸ばしてよい（説明文に passing という語があるが、ぶつかる音ではない）", () => {
    // A は Dm7 の 5th、G は Cmaj7 の 5th
    expect(fitsChord(69, "Dm7")).toBe(true);
    expect(fitsChord(67, "Cmaj7")).toBe(true);
  });

  it("スケールに無い音はだめ", () => {
    expect(fitsChord(65, "D7")).toBe(false);
  });

  it("スケールにあっても、響きがぶつかる音はだめ", () => {
    // Am7 の b13、Cmaj7 の 11th
    expect(fitsChord(65, "Am7")).toBe(false);
    expect(fitsChord(65, "Cmaj7")).toBe(false);
  });
});

describe("aimPitch（小節の最後の音を、次のコードに合う音へ寄せる）", () => {
  it("次のコードにそのまま合う音は動かさない", () => {
    // A は Dm7 の 5th で、G7 の 9th
    expect(aimPitch(69, "Dm7", "G7")).toBe(69);
  });

  it("合わない音は、2半音以内でいちばん近い、次のコードに合う音へ動かす", () => {
    // F は Cmaj7 でぶつかる。半音下の E（3rd）へ
    expect(aimPitch(65, "Dm7", "Cmaj7")).toBe(64);
  });

  it("同じ近さなら、いまのコードにも合う音を選ぶ（どちらのコードの上でも外れない）", () => {
    // F は D7 に合わない。E は Dm7 にも D7 にも合い、F# は D7 にしか合わない
    expect(aimPitch(65, "Dm7", "D7")).toBe(64);
  });

  it("動かした先は、必ず次のコードに合う", () => {
    const chords = ["Cmaj7", "Dm7", "Em7", "Fmaj7", "G7", "Am7", "A7", "E7", "C7", "Gm7", "Fm7", "Bb7", "Db7", "Abmaj7", "Ebmaj7", "D7", "Gb7"];
    for (const current of chords) {
      for (const next of chords) {
        for (let pitch = 55; pitch <= 78; pitch++) {
          const aimed = aimPitch(pitch, current, next);
          expect(Math.abs(aimed - pitch)).toBeLessThanOrEqual(2);
          expect(fitsChord(aimed, next)).toBe(true);
        }
      }
    }
  });

  it("同じコードにとどまるなら、合っている音は動かさない", () => {
    expect(aimPitch(65, "Dm7", "Dm7")).toBe(65);
  });
});
