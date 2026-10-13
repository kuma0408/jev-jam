import { describe, expect, it } from "vitest";
import { liveEnergy, touchOf } from "./energy.ts";

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
