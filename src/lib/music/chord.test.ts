import { describe, expect, it } from "vitest";
import { chordTones } from "./chord.ts";

describe("chordTones", () => {
  it("マイナーセブンスの構成音を返す", () => {
    expect(chordTones("Dm7")).toEqual(["D", "F", "A", "C"]);
  });

  it("ドミナントセブンスの構成音を返す", () => {
    expect(chordTones("G7")).toEqual(["G", "B", "D", "F"]);
  });

  it("メジャーセブンスの構成音を返す", () => {
    expect(chordTones("Cmaj7")).toEqual(["C", "E", "G", "B"]);
  });
});
