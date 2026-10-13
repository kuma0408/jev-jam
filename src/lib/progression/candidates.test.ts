import { describe, expect, it } from "vitest";
import { parseChord } from "../music/chord.ts";
import { KNOWN_CHORDS, nextChordCandidates } from "./candidates.ts";

describe("nextChordCandidates", () => {
  it("最も自然な進行を先頭に返す", () => {
    expect(nextChordCandidates(["Dm7"])[0]).toMatchObject({ chord: "G7", adventure: 1 });
    expect(nextChordCandidates(["G7"])[0]).toMatchObject({ chord: "Cmaj7", adventure: 1 });
  });

  it("冒険度の高い候補も含める", () => {
    const candidates = nextChordCandidates(["Dm7"]);
    // 裏コード
    expect(candidates).toContainEqual(expect.objectContaining({ chord: "Db7", adventure: 2 }));
  });

  it("未対応のコードはエラーにする", () => {
    expect(() => nextChordCandidates(["Xyz"])).toThrow();
  });

  describe.each(KNOWN_CHORDS)("%s から", (chord) => {
    const candidates = nextChordCandidates([chord]);

    it("候補が1つ以上ある", () => {
      expect(candidates.length).toBeGreaterThan(0);
    });

    it("どの候補に進んでも、その先の候補がある（セッションが行き止まらない）", () => {
      for (const candidate of candidates) {
        expect(KNOWN_CHORDS).toContain(candidate.chord);
      }
    });

    it("候補のルート音が重複しない（鍵盤の1つの鍵に1つのコードを割り当てるため）", () => {
      const roots = candidates.map((candidate) => parseChord(candidate.chord).root);
      expect(new Set(roots).size).toBe(roots.length);
    });

    it("冒険度の低い順に並ぶ", () => {
      const levels = candidates.map((candidate) => candidate.adventure);
      expect(levels).toEqual([...levels].sort((a, b) => a - b));
    });
  });
});
