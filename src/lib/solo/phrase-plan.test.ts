import { describe, expect, it } from "vitest";
import { PHRASE_SHAPES, REGISTER_ARCS, biasShapesByEnergy, registerTarget } from "./phrase-plan.ts";

describe("PHRASE_SHAPES（4小節のどこを吹いて、どこを休むか）", () => {
  it("どの形も、半小節8つぶんの「吹く・休む」を持つ", () => {
    expect(PHRASE_SHAPES.length).toBeGreaterThanOrEqual(7);
    for (const shape of PHRASE_SHAPES) {
      expect(shape.id).toMatch(/^p-[a-z0-9-]{1,37}$/);
      expect(shape.slots).toHaveLength(8);
      expect(shape.description).toMatch(/^[\x20-\x7e]{10,}$/);
      expect(shape.label.length).toBeGreaterThan(0);
    }
  });

  it("どの形も、少なくとも3か所は吹く（4小節まるごと黙らない）", () => {
    for (const shape of PHRASE_SHAPES) {
      expect(shape.slots.filter(Boolean).length).toBeGreaterThanOrEqual(3);
    }
  });

  it("1小節まるごと休む形と、2小節以上を一息に吹く形がある", () => {
    const fullBarRest = PHRASE_SHAPES.some((shape) => [0, 2, 4, 6].some((i) => !shape.slots[i] && !shape.slots[i + 1]));
    const longBreath = PHRASE_SHAPES.some((shape) => /true,true,true,true/.test(shape.slots.join(",")));
    expect(fullBarRest).toBe(true);
    expect(longBreath).toBe(true);
  });

  it("吹く場所の並びは、形ごとに違う", () => {
    expect(new Set(PHRASE_SHAPES.map((shape) => shape.slots.join(""))).size).toBe(PHRASE_SHAPES.length);
  });
});

describe("biasShapesByEnergy", () => {
  const uniform = Object.fromEntries(PHRASE_SHAPES.map((shape) => [shape.id, 1]));
  const density = (energy: 1 | 2 | 3 | 4) => {
    const odds = biasShapesByEnergy(uniform, energy);
    const total = Object.values(odds).reduce((sum, value) => sum + value, 0);
    return PHRASE_SHAPES.reduce((sum, shape) => sum + (odds[shape.id]! / total) * shape.slots.filter(Boolean).length, 0);
  };

  it("盛り上がりが高いほど、吹く場所の多い形に寄せる", () => {
    expect(density(4)).toBeGreaterThan(density(3));
    expect(density(3)).toBeGreaterThan(density(2));
    expect(density(2)).toBeGreaterThan(density(1));
  });

  it("盛り上がりが「ゆったり」でも、平均して4小節のうち6か所以上は吹く（無音が多すぎた）", () => {
    expect(density(2)).toBeGreaterThanOrEqual(5.8);
  });

  it("どの形の確率も0にはしない", () => {
    for (const value of Object.values(biasShapesByEnergy(uniform, 1))) {
      expect(value).toBeGreaterThan(0);
    }
  });
});

describe("REGISTER_ARCS（4小節の高さの流れ）", () => {
  it("どの流れも、小節ごとの高さの目標（0=音域の底、1=てっぺん）を4つ持つ", () => {
    expect(REGISTER_ARCS.length).toBeGreaterThanOrEqual(5);
    for (const arc of REGISTER_ARCS) {
      expect(arc.id).toMatch(/^a-[a-z0-9-]{1,37}$/);
      expect(arc.targets).toHaveLength(4);
      for (const target of arc.targets) {
        expect(target).toBeGreaterThanOrEqual(0);
        expect(target).toBeLessThanOrEqual(1);
      }
      expect(arc.description).toMatch(/^[\x20-\x7e]{10,}$/);
    }
  });

  it("登る流れと降りる流れがあり、高低の差がはっきりしている", () => {
    const spans = REGISTER_ARCS.map((arc) => Math.max(...arc.targets) - Math.min(...arc.targets));
    expect(Math.max(...spans)).toBeGreaterThanOrEqual(0.6);
    expect(REGISTER_ARCS.some((arc) => arc.targets[3]! - arc.targets[0]! >= 0.5)).toBe(true);
    expect(REGISTER_ARCS.some((arc) => arc.targets[0]! - arc.targets[3]! >= 0.5)).toBe(true);
  });
});

describe("registerTarget", () => {
  const range = { low: 53, high: 77 };

  it("流れと小節の位置から、目標の音の高さを返す", () => {
    const climb = REGISTER_ARCS.find((arc) => arc.targets[3]! - arc.targets[0]! >= 0.5)!;
    const first = registerTarget(climb.id, 0, range)!;
    const last = registerTarget(climb.id, 3, range)!;
    expect(last - first).toBeGreaterThanOrEqual(10);
    expect(first).toBeGreaterThanOrEqual(range.low);
    expect(last).toBeLessThanOrEqual(range.high);
  });

  it("流れが決まっていなければ、目標は無い", () => {
    expect(registerTarget(undefined, 0, range)).toBeUndefined();
    expect(registerTarget("a-no-such", 0, range)).toBeUndefined();
  });
});
