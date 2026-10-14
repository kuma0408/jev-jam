import { describe, expect, it } from "vitest";
import { parseChord } from "../music/chord.ts";
import { KNOWN_CHORDS, MAX_CANDIDATES, MIN_CANDIDATES, nextChordCandidates } from "./candidates.ts";

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

  it("続きが1通りしか無かったコードにも、別の道がある", () => {
    // ドミナントの連鎖
    expect(chordsOf(["E7"])).toContain("A7");
    expect(chordsOf(["A7"])).toContain("D7");
    // 裏コードを挟んでIVへ
    expect(chordsOf(["Gm7"])).toContain("Gb7");
  });

  it("同じコードにもう1小節とどまることを、いつでも選べる", () => {
    for (const chord of KNOWN_CHORDS) {
      const stay = nextChordCandidates([chord]).find((candidate) => candidate.chord === chord);
      expect(stay).toMatchObject({ adventure: 1 });
      expect(stay!.reason).toContain("とどまる");
    }
  });

  it("とどまる候補は、既定（先頭）にはしない", () => {
    for (const chord of KNOWN_CHORDS) {
      expect(nextChordCandidates([chord])[0]!.chord).not.toBe(chord);
    }
  });

  it("定番の続きが足りないときは、トニックへ帰る道などで補う", () => {
    // Db7 の定番の続きは Cmaj7 だけ
    const candidates = nextChordCandidates(["Dm7", "Db7"]);
    expect(candidates[0]!.chord).toBe("Cmaj7");
    expect(candidates.length).toBeGreaterThanOrEqual(MIN_CANDIDATES);
  });

  it("とどまった後も、とどまる前の流れの続きを候補にする", () => {
    expect(chordsOf(["Dm7", "G7", "G7"])[0]).toBe("Cmaj7");
  });

  describe.each(KNOWN_CHORDS)("%s から", (chord) => {
    const candidates = nextChordCandidates([chord]);

    it("候補が3つ以上、上限以下ある", () => {
      expect(MIN_CANDIDATES).toBe(3);
      expect(candidates.length).toBeGreaterThanOrEqual(MIN_CANDIDATES);
      expect(candidates.length).toBeLessThanOrEqual(MAX_CANDIDATES);
    });

    it("同じコードを重複して返さない", () => {
      const chords = candidates.map((candidate) => candidate.chord);
      expect(new Set(chords).size).toBe(chords.length);
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

describe("nextChordCandidates（1小節に2つのコードを置く）", () => {
  /** 自動で（先頭の候補へ）進めたときの、小節ごとのコード。後半のコードがあれば「前半 後半」と書く */
  const autoBars = (history: string[], count: number): string[] => {
    const flow = [...history];
    const bars: string[] = [];
    for (let index = 0; index < count; index++) {
      const [first] = nextChordCandidates(flow);
      flow.push(first!.chord);
      if (first!.then) flow.push(first!.then);
      bars.push(first!.then ? `${first!.chord} ${first!.then}` : first!.chord);
    }
    return bars;
  };

  it("Just the Two of Us進行では、Am7 の次の小節に Gm7 と C7 を半分ずつ置く", () => {
    expect(nextChordCandidates(["Fmaj7", "E7", "Am7"])[0]).toMatchObject({ chord: "Gm7", then: "C7" });
  });

  it("後半のコードの次からは、その続きを候補にする", () => {
    expect(nextChordCandidates(["Fmaj7", "E7", "Am7", "Gm7", "C7"])[0]).toMatchObject({ chord: "Fmaj7" });
    expect(nextChordCandidates(["Fmaj7", "E7", "Am7", "Gm7", "C7"])[0]!.then).toBeUndefined();
  });

  it("自動で進めると、Just the Two of Us進行は4小節で1周する", () => {
    expect(autoBars(["Fmaj7", "E7", "Am7"], 8)).toEqual([
      "Gm7 C7",
      "Fmaj7",
      "E7",
      "Am7",
      "Gm7 C7",
      "Fmaj7",
      "E7",
      "Am7",
    ]);
  });

  it("1小節に2つ置くのは、その形の進行の続きのときだけ。ほかの候補は1小節まるごと1つのコード", () => {
    // 循環（I-VI-II-V）の途中
    const [first] = nextChordCandidates(["Cmaj7", "Am7"]);
    expect(first).toMatchObject({ chord: "Dm7" });
    expect(first!.then).toBeUndefined();
  });
});

describe("nextChordCandidates（乗っている進行に沿わせる）", () => {
  it("いま乗っている進行を指定すると、その進行の続きを先頭にする", () => {
    expect(nextChordCandidates(["Am7"], { prefer: "小室進行" })[0]).toMatchObject({ chord: "Fmaj7" });
  });

  it("その進行が1小節に2つ置く形なら、後半のコードも付ける", () => {
    expect(nextChordCandidates(["Cmaj7", "Am7"])[0]!.chord).toBe("Dm7");
    expect(nextChordCandidates(["Cmaj7", "Am7"], { prefer: "Just the Two of Us進行" })[0]).toMatchObject({
      chord: "Gm7",
      then: "C7",
    });
  });

  it("候補には、どの進行の続きかを持たせる", () => {
    const [first] = nextChordCandidates(["Em7", "Am7", "Fmaj7", "G7"]);
    expect(first!.progression).toBe("王道進行");
  });
});
