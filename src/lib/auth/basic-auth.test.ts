import { describe, expect, it } from "vitest";
import { requireBasicAuth } from "./basic-auth.ts";

const credentials = { user: "jev", password: "session" };

describe("requireBasicAuth", () => {
  it("IDとパスワードが設定されていなければ、認証せずに通す（手元の開発用）", () => {
    expect(requireBasicAuth(null, {})).toBeUndefined();
  });

  it("設定されていて、認証ヘッダが無ければ401でログインを求める", () => {
    const response = requireBasicAuth(null, credentials);
    expect(response?.status).toBe(401);
    expect(response?.headers.get("WWW-Authenticate")).toMatch(/^Basic /);
  });
});
