import { describe, expect, it } from "vitest";
import { POST } from "./route.ts";

/** ダミー（mock）で動かす、いちばん小さいソロの依頼 */
const body = (memo: Record<string, unknown>) => ({
  chords: ["Dm7"],
  strategy: "cells",
  bpm: 120,
  previousPitch: 62,
  range: { low: 53, high: 84 },
  memo,
  mock: true,
});

const post = (payload: unknown) =>
  POST(new Request("http://localhost/api/solo", { method: "POST", body: JSON.stringify(payload) }));

describe("POST /api/solo（メモの音量）", () => {
  it("前の小節の終わりの音量をメモで受け付ける", async () => {
    const response = await post(body({ level: 0.5 }));
    expect(response.status).toBe(200);
  });

  it("音量が数でなければ受け付けない", async () => {
    const response = await post(body({ level: "loud" }));
    expect(response.status).toBe(400);
  });
});

describe("POST /api/solo（判断する人の切り替え）", () => {
  it("decider が rules なら、Jevを呼ばずにルールで判断する", async () => {
    const response = await post({ ...body({}), mock: false, decider: "rules" });
    expect(response.status).toBe(200);
    expect((await response.json()).client).toBe("rules");
  });

  it("decider に知らない値が来たら受け付けない", async () => {
    const response = await post({ ...body({}), decider: "llm" });
    expect(response.status).toBe(400);
  });
});
