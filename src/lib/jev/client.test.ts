import { afterEach, describe, expect, it, vi } from "vitest";
import { createJevClient } from "./client.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createJevClient", () => {
  it("モデルを指定しなければ、jev-1.14.0 に固定して送る（エイリアスだと勝手に変わるため）", async () => {
    // 本物のJevは呼ばず、送った中身だけを見る
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => Response.json({ answers: { q: { choice: "a", probabilities: { a: 1 } } } }));
    vi.stubGlobal("fetch", fetchMock);

    await createJevClient("dummy-key").decide({}, { q: { type: "choice", instructions: "", criteria: { a: "" } } } as never);

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(init.body as string).model).toBe("jev-1.14.0");
  });
});
