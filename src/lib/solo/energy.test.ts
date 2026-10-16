import { describe, expect, it } from "vitest";
import { TOUCH_CUE, compTouch, liveEnergy, touchEnergy, touchOf } from "./energy.ts";

describe("touchOf（ユーザーの叩き方）", () => {
  it("直近1小節に叩いた回数を、3段階に分ける", () => {
    expect(touchOf(0)).toBe("none");
    expect(touchOf(1)).toBe("light");
    expect(touchOf(2)).toBe("light");
    expect(touchOf(3)).toBe("active");
    expect(touchOf(5)).toBe("active");
    expect(touchOf(6)).toBe("busy");
    expect(touchOf(20)).toBe("busy");
  });
});

describe("liveEnergy（つまみと叩き方を合わせた、実際の盛り上がり）", () => {
  it("叩いていなければ、つまみの値のまま", () => {
    expect(liveEnergy(2, 0)).toBe(2);
  });

  it("少し叩いただけでは変わらない", () => {
    expect(liveEnergy(2, 2)).toBe(2);
  });

  it("よく叩くと1段階、激しく叩くと2段階上がる", () => {
    expect(liveEnergy(2, 3)).toBe(3);
    expect(liveEnergy(2, 6)).toBe(4);
    expect(liveEnergy(1, 8)).toBe(3);
  });

  it("上限（激しい）は超えない", () => {
    expect(liveEnergy(3, 10)).toBe(4);
    expect(liveEnergy(4, 10)).toBe(4);
  });
});


describe("compTouch（直前1小節の伴奏の質感）", () => {
  const now = 10;
  const beat = 0.75;
  const window = beat * 4;
  /** ago 秒前に押して、seconds 秒伸ばした（null なら、まだ押している） */
  const press = (ago: number, seconds: number | null) => ({ at: now - ago, end: seconds === null ? null : now - ago + seconds });

  it("何も弾いていなければ none", () => {
    expect(compTouch([], now, window, beat)).toBe("none");
    // 1小節より前に離したものは数えない
    expect(compTouch([press(5, 0.5)], now, window, beat)).toBe("none");
  });

  it("少ない回数で長く伸ばしていたら、しっとり（sustained）", () => {
    expect(compTouch([press(2.8, 1.5), press(1, 0.9)], now, window, beat)).toBe("sustained");
    // まだ押さえている和音も、押した時からいままでの長さで数える
    expect(compTouch([press(2, null)], now, window, beat)).toBe("sustained");
  });

  it("短く数回なら light、ほどほどに刻めば active、連打なら busy", () => {
    expect(compTouch([press(2, 0.2), press(1, 0.2)], now, window, beat)).toBe("light");
    expect(compTouch([0.4, 0.8, 1.2, 1.6].map((ago) => press(ago, 0.2)), now, window, beat)).toBe("active");
    expect(compTouch([0.2, 0.5, 0.8, 1.1, 1.4, 1.7, 2].map((ago) => press(ago, 0.1)), now, window, beat)).toBe("busy");
  });

  it("速いテンポでは、少し押さえただけではしっとりにしない（押さえた長さは秒でも測る）", () => {
    // 200BPM: 1拍0.3秒、1小節1.2秒。0.4秒の押さえは1拍を超えるが、しっとりとは言えない
    const fastBeat = 0.3;
    expect(compTouch([press(1, 0.4)], now, fastBeat * 4, fastBeat)).toBe("light");
    // 0.6秒以上押さえていれば、速いテンポでもしっとり
    expect(compTouch([press(1.1, 0.8)], now, fastBeat * 4, fastBeat)).toBe("sustained");
  });

  it("速いテンポでは、1小節に押せる回数が少なくても、1秒あたりの回数が多ければ激しいとみなす", () => {
    const fastBeat = 0.3;
    // 1.2秒に4回（1秒に3回以上）。回数だけなら active だが、busy にする
    expect(compTouch([0.1, 0.4, 0.7, 1.0].map((ago) => press(ago, 0.1)), now, fastBeat * 4, fastBeat)).toBe("busy");
    // 1.2秒に2回（1秒に1.5回以上）は active
    expect(compTouch([0.3, 0.9].map((ago) => press(ago, 0.1)), now, fastBeat * 4, fastBeat)).toBe("active");
  });

  it("遅いテンポでは、これまでどおり1小節の回数と拍の長さで決める", () => {
    // 60BPM: 1拍1秒、1小節4秒
    const slowBeat = 1;
    expect(compTouch([press(3.5, 1.2), press(1.5, 1.2)], now, slowBeat * 4, slowBeat)).toBe("sustained");
    expect(compTouch([3.5, 3, 2.5, 2, 1.5, 1].map((ago) => press(ago, 0.1)), now, slowBeat * 4, slowBeat)).toBe("busy");
    expect(compTouch([3.5, 2].map((ago) => press(ago, 0.1)), now, slowBeat * 4, slowBeat)).toBe("light");
  });

  it("しっとりした伴奏には、長い音で静かに歌うようJevに伝える", () => {
    expect(TOUCH_CUE.sustained).toMatch(/long/i);
    expect(TOUCH_CUE.busy).toMatch(/sixteenth/i);
  });
});

describe("touchEnergy（伴奏の質感から決める盛り上がり）", () => {
  it("しっとりなら静か、連打なら激しい。弾いていなければゆったり", () => {
    expect(touchEnergy("sustained")).toBe(1);
    expect(touchEnergy("none")).toBe(2);
    expect(touchEnergy("light")).toBe(2);
    expect(touchEnergy("active")).toBe(3);
    expect(touchEnergy("busy")).toBe(4);
  });
});
