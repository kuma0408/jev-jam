import { describe, expect, it } from "vitest";
import { COMP_PATTERNS, accompaniment, bassApproach } from "./accompaniment.ts";

const first = () => 0;
const partOf = (chord: string, part: string, options: Parameters<typeof accompaniment>[1] = { bar: 1 }) =>
  accompaniment(chord, options, first).filter((event) => event.part === part);

describe("accompaniment", () => {
  it("どの音も1小節（4拍）の中に収まる", () => {
    for (const chord of ["Cmaj7", "Dm7", "G7", "Abmaj7", "Bb7"]) {
      for (let bar = 1; bar <= 8; bar++) {
        for (const event of accompaniment(chord, { bar })) {
          expect(event.startBeats).toBeGreaterThanOrEqual(0);
          expect(event.startBeats + event.durationBeats).toBeLessThanOrEqual(4 + 1e-9);
          expect(event.velocity).toBeGreaterThan(0);
          expect(event.velocity).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  describe("ベース", () => {
    it("4分音符で歩き、1拍目はルートを弾く", () => {
      const bass = partOf("Dm7", "bass");
      expect(bass.map((event) => event.startBeats)).toEqual([0, 1, 2, 3]);
      expect(bass[0]!.pitches[0]! % 12).toBe(2);
    });

    it("ウッドベースの低い音域で弾く", () => {
      for (const chord of ["Cmaj7", "Dm7", "G7", "Abmaj7", "Bb7"]) {
        for (const event of partOf(chord, "bass")) {
          expect(event.pitches).toHaveLength(1);
          expect(event.pitches[0]).toBeGreaterThanOrEqual(28);
          expect(event.pitches[0]).toBeLessThanOrEqual(52);
        }
      }
    });

    it("2拍目と3拍目はコードの構成音を弾く", () => {
      const bass = partOf("Dm7", "bass");
      // Dm7 = D F A C
      expect([2, 5, 9, 0]).toContain(bass[1]!.pitches[0]! % 12);
      expect([2, 5, 9, 0]).toContain(bass[2]!.pitches[0]! % 12);
    });

    it("次のコードが分かっていれば、4拍目はそのルートへ半音で寄る", () => {
      const bass = partOf("Dm7", "bass", { bar: 1, nextChord: "G7" });
      const last = bass[3]!.pitches[0]! % 12;
      // G の半音下（F#）か半音上（Ab）
      expect([6, 8]).toContain(last);
    });
  });

  describe("ベース（最後の1拍を後から決める場合）", () => {
    it("4拍目を省いて返せる", () => {
      const bass = partOf("Dm7", "bass", { bar: 1, deferLastBass: true });
      expect(bass.map((event) => event.startBeats)).toEqual([0, 1, 2]);
    });

    it("省いた4拍目の音は、次のコードが決まってから求められる", () => {
      // G の半音下（F#）か半音上（Ab）
      expect([6, 8]).toContain(bassApproach("Dm7", "G7") % 12);
      // C の半音下（B）か半音上（Db）
      expect([11, 1]).toContain(bassApproach("Dm7", "Cmaj7") % 12);
      expect(bassApproach("Dm7", "G7")).toBeGreaterThanOrEqual(28);
      expect(bassApproach("Dm7", "G7")).toBeLessThanOrEqual(52);
    });
  });

  describe("盛り上がり", () => {
    const count = (part: string, energy: 1 | 2 | 3 | 4) => {
      let total = 0;
      for (let index = 0; index < 20; index++) {
        total += accompaniment("Dm7", { bar: 1, energy }, () => (index + 0.5) / 20).filter((event) => event.part === part).length;
      }
      return total;
    };

    it("静かなときは、ベースは2分音符で2つだけ弾く", () => {
      const bass = partOf("Dm7", "bass", { bar: 1, energy: 1 });
      expect(bass.map((event) => event.startBeats)).toEqual([0, 2]);
    });

    it("激しいほどコード伴奏の手数が増える", () => {
      expect(count("comp", 4)).toBeGreaterThan(count("comp", 1));
    });

    it("激しいほどシンバルを強く叩く", () => {
      const loudness = (energy: 1 | 2 | 3 | 4) =>
        partOf("Dm7", "ride", { bar: 1, energy }).reduce((sum, event) => sum + event.velocity, 0);
      expect(loudness(4)).toBeGreaterThan(loudness(1));
    });

    it("指定が無ければ、中くらい（歩くベース）にする", () => {
      expect(partOf("Dm7", "bass").map((event) => event.startBeats)).toEqual([0, 1, 2, 3]);
    });
  });

  describe("コード伴奏", () => {
    it("ルートを省いた構成音を、中音域で鳴らす", () => {
      for (const event of partOf("Dm7", "comp")) {
        // ルートのDはベースに任せる
        expect(event.pitches.map((pitch) => pitch % 12).sort((a, b) => a - b)).toEqual([0, 5, 9]);
        for (const pitch of event.pitches) {
          expect(pitch).toBeGreaterThanOrEqual(52);
          expect(pitch).toBeLessThanOrEqual(68);
        }
      }
    });

    it("リズムの型を複数持ち、乱数で選ぶ", () => {
      expect(COMP_PATTERNS.length).toBeGreaterThanOrEqual(4);
      const starts = (random: () => number) =>
        accompaniment("Dm7", { bar: 1 }, random)
          .filter((event) => event.part === "comp")
          .map((event) => event.startBeats)
          .join(",");
      const variants = new Set(Array.from({ length: 40 }, (_, index) => starts(() => (index + 0.5) / 40)));
      expect(variants.size).toBeGreaterThanOrEqual(3);
    });

    it("裏拍から入る型がある", () => {
      const hasOffbeat = COMP_PATTERNS.some((pattern) => pattern.hits.some((hit) => hit.at % 1 === 0.5));
      expect(hasOffbeat).toBe(true);
    });
  });

  describe("シンバル", () => {
    it("毎拍と、2拍目・4拍目の裏を刻む（チン・チンチキ）", () => {
      expect(partOf("Dm7", "ride").map((event) => event.startBeats)).toEqual([0, 1, 1.5, 2, 3, 3.5]);
    });

    it("4小節ごとの最後の小節は、4拍目に刻みを足して区切りを付ける", () => {
      const normal = partOf("Dm7", "ride", { bar: 3 });
      const fill = partOf("Dm7", "ride", { bar: 4 });
      expect(fill.length).toBeGreaterThan(normal.length);
      expect(partOf("Dm7", "ride", { bar: 8 }).length).toBe(fill.length);
    });
  });
});
