import { describe, expect, it } from "vitest";
import type { SoloNote } from "./api.ts";
import { type NoteExpression, planExpression, renderExpression } from "./expression.ts";

const note = (pitch: number, startBeats: number, durationBeats: number, velocity = 0.7): SoloNote => ({
  pitch,
  startBeats,
  durationBeats,
  velocity,
  swing: true,
});

const always = () => 0;
const never = () => 0.999;
const options = { secondsPerBeat: 0.5 };
const plan = (notes: SoloNote[], random = always) => planExpression(notes, options, random);

describe("planExpression: しゃくり（下から入る）", () => {
  it("フレーズの最初の音、休符の後に入り直す音、大きく跳び上がった先の音が候補になる", () => {
    expect(plan([note(62, 0, 1)])[0]!.scoopSemitones).toBe(1);
    expect(plan([note(62, 0, 0.5), note(64, 1.5, 1)])[1]!.scoopSemitones).toBe(1);
    expect(plan([note(60, 0, 0.5), note(67, 0.5, 1)])[1]!.scoopSemitones).toBe(1);
  });

  it("なめらかに続く音や、跳び下りた先の音はしゃくらない", () => {
    const planned = plan([note(62, 0, 0.5), note(64, 0.5, 0.5), note(55, 1, 1)]);
    expect(planned[1]!.scoopSemitones).toBe(0);
    expect(planned[2]!.scoopSemitones).toBe(0);
  });

  it("長い音でも半音下からにとどめる（全音は深すぎた）", () => {
    expect(plan([note(62, 0, 4)])[0]!.scoopSemitones).toBe(1);
  });

  it("短すぎる音はしゃくらない", () => {
    expect(plan([note(62, 0, 0.25), note(70, 0.25, 0.25)]).map((e) => e.scoopSemitones)).toEqual([0, 0]);
  });

  it("候補のすべてをしゃくるわけではない", () => {
    expect(plan([note(62, 0, 1)], never)[0]!.scoopSemitones).toBe(0);
  });

  it("曲げ終わるまでの時間は、音の長さの半分を超えず、長くても0.14秒まで", () => {
    expect(plan([note(62, 0, 2)])[0]!.scoopSeconds).toBeCloseTo(0.14);
    expect(plan([note(62, 0, 0.5)])[0]!.scoopSeconds).toBeCloseTo(0.125);
  });
});

describe("planExpression: 音量の変化", () => {
  it("伸ばした音には、ふくらむ・しぼむ・ふくらんで戻る、のどれかを付ける", () => {
    const shapes = new Set([0, 0.4, 0.7, 0.95].map((value) => plan([note(62, 0, 2)], () => value)[0]!.shape));
    expect(shapes).toEqual(new Set(["swell", "fade", "bloom", "flat"]));
  });

  it("短い音には付けない", () => {
    expect(plan([note(62, 0, 0.5)])[0]!.shape).toBe("flat");
  });
});

describe("planExpression: ビブラートとフォール", () => {
  it("十分に長い音は、後半にビブラートをかける", () => {
    expect(plan([note(62, 0, 2)])[0]!.vibrato).toBe(true);
    expect(plan([note(62, 0, 0.5)])[0]!.vibrato).toBe(false);
  });

  it("フレーズの最後の長い音は、音程を落として消えることがある", () => {
    // 次の音まで1拍空く
    expect(plan([note(62, 0, 1), note(64, 2, 1)])[0]!.fall).toBe(true);
    // この小節で最後の音。小節の終わりより手前で終わる
    expect(plan([note(62, 2, 1)])[0]!.fall).toBe(true);
  });

  it("小節の終わりまで伸びる音は落とさない（次の小節へ持ち越すかもしれない）", () => {
    expect(plan([note(62, 3, 1)])[0]!.fall).toBe(false);
    expect(plan([note(62, 0, 4)])[0]!.fall).toBe(false);
  });

  it("次の音へすぐつながる音や、短い音は落とさない", () => {
    expect(plan([note(62, 0, 1), note(64, 1, 1)])[0]!.fall).toBe(false);
    expect(plan([note(62, 0, 0.5), note(64, 2, 1)])[0]!.fall).toBe(false);
  });

  it("毎回は落とさない", () => {
    expect(plan([note(62, 2, 1)], never)[0]!.fall).toBe(false);
  });
});

describe("planExpression: 音のつなぎ", () => {
  it("隣の音へ切れ目なく進むときは、立ち上がりをやわらかくしてなめらかにつなぐ", () => {
    const [first, second] = plan([note(62, 0, 0.5), note(64, 0.5, 0.5)]);
    expect(second!.attackSeconds).toBeGreaterThan(first!.attackSeconds);
  });

  it("跳躍した先や、休符の後の音は、はっきり発音する", () => {
    const leap = plan([note(62, 0, 0.5), note(69, 0.5, 0.5)]);
    const gap = plan([note(62, 0, 0.5), note(64, 1.5, 0.5)]);
    expect(leap[1]!.attackSeconds).toBe(leap[0]!.attackSeconds);
    expect(gap[1]!.attackSeconds).toBe(gap[0]!.attackSeconds);
  });

  it("音の数だけ結果を返す", () => {
    expect(plan([])).toEqual([]);
    expect(plan([note(62, 0, 1), note(64, 1, 1), note(65, 2, 1)])).toHaveLength(3);
  });
});

describe("renderExpression（1音の中の、音程と音量の動き）", () => {
  const plain: NoteExpression = {
    scoopSemitones: 0,
    scoopSeconds: 0,
    shape: "flat",
    vibrato: false,
    fall: false,
    attackSeconds: 0.01,
  };
  const pitchOf = (expression: NoteExpression, seconds = 1) => renderExpression(expression, seconds).pitch;
  const gainOf = (expression: NoteExpression, seconds = 1) => renderExpression(expression, seconds).gain;

  it("およそ10ミリ秒ごとの値を返し、音程と音量の点数はそろえる", () => {
    const { pitch, gain } = renderExpression(plain, 1);
    expect(pitch).toHaveLength(101);
    expect(gain).toHaveLength(101);
    // ごく短い音でも、曲線として成り立つ最低2点を返す
    expect(renderExpression(plain, 0.001).gain).toHaveLength(2);
  });

  it("何も付けなければ、音程は動かない", () => {
    expect(pitchOf(plain).every((value) => value === 0)).toBe(true);
  });

  it("音量は0から立ち上がり、すぐ一定になる", () => {
    const gain = gainOf(plain);
    expect(gain[0]).toBe(0);
    expect(gain[5]).toBeCloseTo(1);
    expect(gain.at(-1)).toBeCloseTo(1);
  });

  it("しゃくりは、半音下から始まって目的の音程に届く", () => {
    const pitch = pitchOf({ ...plain, scoopSemitones: 1, scoopSeconds: 0.1 });
    expect(pitch[0]).toBeCloseTo(-1);
    expect(pitch[5]).toBeLessThan(0);
    expect(pitch[5]).toBeGreaterThan(-1);
    expect(pitch[10]).toBeCloseTo(0);
    expect(pitch[50]).toBe(0);
  });

  it("ビブラートは音の後半から始まり、目的の音程の上下に揺れる", () => {
    const pitch = pitchOf({ ...plain, vibrato: true }, 2);
    expect(pitch.slice(0, 70).every((value) => value === 0)).toBe(true);
    const late = pitch.slice(120);
    expect(Math.max(...late)).toBeGreaterThan(0.1);
    expect(Math.min(...late)).toBeLessThan(-0.1);
    // 揺れは半音の3分の1までに収める
    expect(Math.max(...pitch.map(Math.abs))).toBeLessThan(0.34);
  });

  it("ビブラートは音の終わりで収まり、目的の音程に戻る（次の小節へ持ち越しても音程がずれない）", () => {
    const pitch = pitchOf({ ...plain, vibrato: true }, 2);
    expect(pitch.at(-1)).toBeCloseTo(0, 5);
  });

  it("フォールは、音の終わりで音程が落ち、音量も絞られる", () => {
    const { pitch, gain } = renderExpression({ ...plain, fall: true }, 1);
    expect(pitch[50]).toBe(0);
    expect(pitch.at(-1)).toBeLessThan(-2);
    expect(gain.at(-1)!).toBeLessThan(0.4);
  });

  it("「ふくらむ」は小さく始まって大きくなり、「しぼむ」はその逆", () => {
    const swell = gainOf({ ...plain, shape: "swell" });
    const fade = gainOf({ ...plain, shape: "fade" });
    expect(swell[20]!).toBeLessThan(swell[80]!);
    expect(swell.at(-1)).toBeCloseTo(1);
    expect(fade[20]!).toBeGreaterThan(fade[80]!);
    expect(fade.at(-1)!).toBeLessThan(0.6);
  });

  it("「ふくらんで戻る」は、途中がいちばん大きい", () => {
    const bloom = gainOf({ ...plain, shape: "bloom" });
    const peak = Math.max(...bloom);
    expect(bloom.indexOf(peak)).toBeGreaterThan(30);
    expect(bloom.indexOf(peak)).toBeLessThan(80);
    expect(bloom.at(-1)!).toBeLessThan(peak);
  });

  it("音量は0〜1に収める", () => {
    for (const shape of ["flat", "swell", "fade", "bloom"] as const) {
      for (const value of gainOf({ ...plain, shape, fall: true })) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });
});
