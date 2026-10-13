import { describe, expect, it } from "vitest";
import type { SoloNote } from "./api.ts";
import { planScoops } from "./expression.ts";

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

describe("planScoops（下からしゃくって入る音を決める）", () => {
  it("フレーズの最初の音は、しゃくって入る候補になる", () => {
    const scoops = planScoops([note(62, 0, 1), note(64, 1, 1)], options, always);
    expect(scoops[0]).not.toBeNull();
  });

  it("休符の後に入り直す音も、しゃくる候補になる", () => {
    // 2つ目の音は、前の音が終わってから1拍空いて始まる
    const scoops = planScoops([note(62, 0, 0.5), note(64, 1.5, 1)], options, always);
    expect(scoops[1]).not.toBeNull();
  });

  it("大きく跳び上がった先の音は、しゃくる候補になる", () => {
    const scoops = planScoops([note(60, 0, 0.5), note(67, 0.5, 1)], options, always);
    expect(scoops[1]).not.toBeNull();
  });

  it("なめらかに続く音や、跳び下りた先の音はしゃくらない", () => {
    const scoops = planScoops([note(62, 0, 0.5), note(64, 0.5, 0.5), note(55, 1, 1)], options, always);
    expect(scoops[1]).toBeNull();
    expect(scoops[2]).toBeNull();
  });

  it("短すぎる音はしゃくらない（曲げる間が無い）", () => {
    // 16分音符（0.25拍 = 0.125秒）
    const scoops = planScoops([note(62, 0, 0.25), note(70, 0.25, 0.25)], options, always);
    expect(scoops).toEqual([null, null]);
  });

  it("候補のすべてをしゃくるわけではない（毎回かかると機械的になる）", () => {
    const scoops = planScoops([note(62, 0, 1)], options, never);
    expect(scoops[0]).toBeNull();
  });

  it("長い音は深く（全音下から）、短い音は浅く（半音下から）入る", () => {
    const [long] = planScoops([note(62, 0, 2)], options, always);
    const [short] = planScoops([note(62, 0, 0.5)], options, always);
    expect(long!.semitones).toBe(2);
    expect(short!.semitones).toBe(1);
  });

  it("曲げ終わるまでの時間は、音の長さの半分を超えず、長くても0.14秒まで", () => {
    const [long] = planScoops([note(62, 0, 2)], options, always);
    const [short] = planScoops([note(62, 0, 0.5)], options, always);
    expect(long!.seconds).toBeCloseTo(0.14);
    expect(short!.seconds).toBeCloseTo(0.125);
  });

  it("音の数だけ結果を返す", () => {
    expect(planScoops([], options, always)).toEqual([]);
    expect(planScoops([note(62, 0, 1), note(64, 1, 1), note(65, 2, 1)], options, always)).toHaveLength(3);
  });
});
