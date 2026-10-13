import { describe, expect, it } from "vitest";
import { REPLIES, describeCall, prepareBeat, replyEnergy, summarizeCall, turnOf } from "./call.ts";

describe("turnOf", () => {
  it("2小節ずつ交代する。先にJevが弾いて場を作り、次にあなたが弾く", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(turnOf)).toEqual(["jev", "jev", "you", "you", "jev", "jev", "you", "you"]);
  });
});

describe("summarizeCall", () => {
  const line = (pitches: number[]) => pitches.map((pitch, index) => ({ pitch, beat: index * 0.5 }));

  it("何も弾かなかったら null", () => {
    expect(summarizeCall([])).toBeNull();
  });

  it("音の数から、まばら・ほどほど・細かい を見分ける", () => {
    expect(summarizeCall(line([64, 67, 69]))!.density).toBe("sparse");
    expect(summarizeCall(line([64, 67, 69, 71, 72, 74, 76]))!.density).toBe("moderate");
    expect(summarizeCall(line(Array.from({ length: 12 }, (_, index) => 64 + (index % 3))))!.density).toBe("busy");
  });

  it("上がっていったか、下がっていったかを見分ける", () => {
    expect(summarizeCall(line([64, 67, 69, 72]))!.direction).toBe("rising");
    expect(summarizeCall(line([76, 72, 69, 64]))!.direction).toBe("falling");
  });

  it("狭い範囲にとどまっていたら「同じあたり」、動いて元の高さへ戻ったら「波」", () => {
    expect(summarizeCall(line([67, 69, 67, 69]))!.direction).toBe("level");
    expect(summarizeCall(line([64, 72, 76, 65]))!.direction).toBe("wavy");
  });

  it("最後に弾いた音の高さを残す（Jevがそこから弾き始めるため）", () => {
    expect(summarizeCall([{ pitch: 72, beat: 3 }, { pitch: 64, beat: 1 }])!.lastPitch).toBe(72);
  });
});

describe("describeCall", () => {
  it("Jevは数えるのが苦手なので、数ではなく言葉で伝える", () => {
    const text = describeCall({ density: "busy", direction: "rising", lastPitch: 72 });
    expect(text).toMatch(/busy/i);
    expect(text).toMatch(/ris/i);
    expect(text).not.toMatch(/\d/);
  });
});

describe("replyEnergy", () => {
  const call = (density: "sparse" | "moderate" | "busy") => ({ density, direction: "level" as const, lastPitch: 67 });

  it("応え方は4つ: 真似る、返す、畳みかける、落ち着かせる", () => {
    expect(Object.keys(REPLIES)).toEqual(["echo", "answer", "push", "calm"]);
  });

  it("「真似る」は相手と同じくらいの音数にする", () => {
    expect(replyEnergy("echo", call("sparse"), 3)).toBe(1);
    expect(replyEnergy("echo", call("busy"), 1)).toBe(4);
  });

  it("「畳みかける」は相手より多く、「落ち着かせる」は相手より少なくする", () => {
    expect(replyEnergy("push", call("moderate"), 2)).toBeGreaterThan(replyEnergy("echo", call("moderate"), 2));
    expect(replyEnergy("calm", call("moderate"), 2)).toBeLessThan(replyEnergy("echo", call("moderate"), 2));
    expect(replyEnergy("push", call("busy"), 2)).toBe(4);
    expect(replyEnergy("calm", call("sparse"), 2)).toBe(1);
  });

  it("「返す」は、つまみの盛り上がりのまま弾く", () => {
    expect(replyEnergy("answer", call("busy"), 2)).toBe(2);
  });
});

describe("prepareBeat", () => {
  it("あなたの番の最後の小節で、Jevに聞くのに間に合ういちばん遅い拍を返す（できるだけ多く聴いてから応える）", () => {
    // 1拍が1秒以上あれば、最後の拍まで待てる
    expect(prepareBeat(60)).toBe(3);
    expect(prepareBeat(80)).toBe(2);
    expect(prepareBeat(120)).toBe(2);
    // 速いテンポでは、小節の頭で聞いておく
    expect(prepareBeat(240)).toBe(0);
  });
});
