import type { NextRequest } from "next/server";
import { requireBasicAuth } from "./lib/auth/basic-auth.ts";

// 公開URLを知っている人だけが使えるように、画面もAPIもまとめて固定ID・パスワードで守る
export function proxy(request: NextRequest): Response | undefined {
  return requireBasicAuth(request.headers.get("authorization"), {
    user: process.env.BASIC_AUTH_USER,
    password: process.env.BASIC_AUTH_PASSWORD,
  });
}

export const config = {
  // Next.jsが配るビルド済みファイルとファビコンは対象外にする
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
