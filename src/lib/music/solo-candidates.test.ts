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

  // ここから下は、曲のキー（Cメジャー）から外れる音を避けるための仕様
  const notesOf = (chord: string) => soloCandidates(chord).map((c) => c.note);
  const degreesOf = (chord: string) => soloCandidates(chord).map((c) => c.degree);

  it("トニックのメジャーセブンスではキーの音（F）を使い、キー外のF#を使わない", () => {
    expect(notesOf("Cmaj7")).toEqual(["C", "D", "E", "F", "G", "A", "B"]);
    expect(degreesOf("Cmaj7")).toEqual(["root", "9th", "3rd", "11th", "5th", "13th", "7th"]);
  });

  it("サブドミナントのメジャーセブンスでは、キーの音がそのまま#11thになる", () => {
    expect(notesOf("Fmaj7")).toEqual(["F", "G", "A", "B", "C", "D", "E"]);
    expect(degreesOf("Fmaj7")).toContain("#11th");
  });

  it("VIのマイナーセブンスではキーの音（F）を使い、キー外のF#を使わない", () => {
    expect(notesOf("Am7")).toEqual(["A", "B", "C", "D", "E", "F", "G"]);
    expect(degreesOf("Am7")).toContain("b13th");
  });

  it("IIIのマイナーセブンスではキーの音（FとC）を使う", () => {
    expect(notesOf("Em7")).toEqual(["E", "F", "G", "A", "B", "C", "D"]);
    expect(degreesOf("Em7")).toEqual(["root", "b9th", "3rd", "11th", "5th", "b13th", "7th"]);
  });

  it("セカンダリードミナントでは、コードの構成音以外をキーの音に寄せる", () => {
    expect(notesOf("A7")).toEqual(["A", "B", "Db", "D", "E", "F", "G"]);
    expect(notesOf("E7")).toEqual(["E", "F", "Ab", "A", "B", "C", "D"]);
  });

  it("キーの外から借りたコードでも、テンションはできるだけキーの音にする", () => {
    expect(notesOf("Fm7")).toEqual(["F", "G", "Ab", "Bb", "C", "D", "Eb"]);
    expect(notesOf("Bb7")).toEqual(["Bb", "C", "D", "E", "F", "G", "Ab"]);
    expect(notesOf("Abmaj7")).toEqual(["Ab", "Bb", "C", "D", "Eb", "F", "G"]);
  });

  it("響きがぶつかる音は、説明文で避けるよう伝える", () => {
    const avoid = (chord: string, degree: string) =>
      soloCandidates(chord).find((c) => c.degree === degree)!.description;
    expect(avoid("Cmaj7", "11th")).toMatch(/passing/);
    expect(avoid("Em7", "b9th")).toMatch(/passing/);
    expect(avoid("Am7", "b13th")).toMatch(/passing/);
  });

  it("Jevに渡す英語の説明を全候補に付ける", () => {
    for (const candidate of soloCandidates("Dm7")) {
      expect(candidate.description).toMatch(/^[\x20-\x7e]+$/);
    }
  });
});
