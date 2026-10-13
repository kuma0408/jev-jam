import { describe, expect, it } from "vitest";
import { soloCandidates } from "./solo-candidates.ts";

describe("soloCandidates", () => {
  it("マイナーセブンスではドリアンの7音を度数順に返す", () => {
    const candidates = soloCandidates("Dm7");
    expect(candidates.map((c) => c.note)).toEqual(["D", "E", "F", "G", "A", "B", "C"]);
    expect(candidates.map((c) => c.degree)).toEqual(["root", "9th", "3rd", "11th", "5th", "13th", "7th"]);
  });

  it("構成音とテンションを区別する", () => {
    const candidates = soloCandidates("Dm7");
    const kinds = Object.fromEntries(candidates.map((c) => [c.note, c.kind]));
    expect(kinds).toEqual({
      D: "chord-tone",
      E: "tension",
      F: "chord-tone",
      G: "tension",
      A: "chord-tone",
      B: "tension",
      C: "chord-tone",
    });
  });

  it("ドミナントセブンスではミクソリディアンを返す", () => {
    expect(soloCandidates("G7").map((c) => c.note)).toEqual(["G", "A", "B", "C", "D", "E", "F"]);
  });

  it("メジャーセブンスではリディアンを返す", () => {
    expect(soloCandidates("Cmaj7").map((c) => c.note)).toEqual(["C", "D", "E", "Gb", "G", "A", "B"]);
  });

  it("Jevに渡す英語の説明を全候補に付ける", () => {
    for (const candidate of soloCandidates("Dm7")) {
      expect(candidate.description).toMatch(/^[\x20-\x7e]+$/);
    }
  });
});
