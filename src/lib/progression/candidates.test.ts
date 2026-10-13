import { describe, expect, it } from "vitest";
import { parseChord } from "../music/chord.ts";
import { KNOWN_CHORDS, MAX_CANDIDATES, nextChordCandidates } from "./candidates.ts";

const chordsOf = (history: string[]) => nextChordCandidates(history).map((candidate) => candidate.chord);

describe("nextChordCandidates", () => {
  it("定番進行の続きを先頭に返す", () => {
    expect(chordsOf(["Dm7"])[0]).toBe("G7");
    expect(chordsOf(["Dm7", "G7"])[0]).toBe("Cmaj7");
  });

  it("同じコードからでも、そこまでの流れによって先頭の候補が変わる", () => {
    // ツーファイブの途中ならトニックへ解決する
    expect(chordsOf(["Dm7", "G7"])[0]).toBe("Cmaj7");
    // 王道進行（IV-V-III-VI）を回っている途中なら、IIIへ進む
    expect(chordsOf(["Em7", "Am7", "Fmaj7", "G7"])[0]).toBe("Em7");
  });

  it("長く一致する進行ほど優先する", () => {
    // Am7 の次は進行によって色々あるが、Fmaj7-E7-Am7 と来たなら Just the Two of Us 進行か丸サ進行の続き
    expect(["Gm7", "C7"]).toContain(chordsOf(["Fmaj7", "E7", "Am7"])[0]);
  });

  it("どの定番進行の続きなのかを理由に書く", () => {
    const [first] = nextChordCandidates(["Em7", "Am7", "Fmaj7", "G7"]);
    expect(first!.reason).toContain("王道進行");
  });

  it("定番から外れる候補も、冒険度つきで含める", () => {
    const candidates = nextChordCandidates(["Dm7"]);
    // 裏コード
    expect(candidates).toContainEqual(expect.objectContaining({ chord: "Db7", adventure: 3 }));
    expect(candidates[0]).toMatchObject({ chord: "G7", adventure: 1 });
  });

  it("同じルートのコードが2つ候補に並ぶことがある", () => {
    const chords = chordsOf(["Em7"]);
    expect(chords).toContain("A7");
    expect(chords).toContain("Am7");
  });

  it("同じコードを重複して返さない", () => {
    const chords = chordsOf(["Dm7", "G7"]);
    expect(new Set(chords).size).toBe(chords.length);
  });

  it("履歴が空、または進行の一覧に無いコードならエラーにする", () => {
    expect(() => nextChordCandidates([])).toThrow();
    expect(() => nextChordCandidates(["Xyz"])).toThrow();
  });

  describe.each(KNOWN_CHORDS)("%s から", (chord) => {
    const candidates = nextChordCandidates([chord]);

    it("候補が1つ以上、上限以下ある", () => {
      expect(candidates.length).toBeGreaterThan(0);
      expect(candidates.length).toBeLessThanOrEqual(MAX_CANDIDATES);
    });

    it("どの候補に進んでも、その先の候補がある（セッションが行き止まらない）", () => {
      for (const candidate of candidates) {
        expect(KNOWN_CHORDS).toContain(candidate.chord);
      }
    });

    it("候補はすべて、音を出せるコードである", () => {
      for (const candidate of candidates) {
        expect(() => parseChord(candidate.chord)).not.toThrow();
      }
    });
  });
});
