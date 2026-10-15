export type BasicAuthCredentials = {
  user?: string;
  password?: string;
};

/**
 * 公開デモ用の固定ID・パスワードによるBasic認証。
 * 通してよければ undefined、ログインを求めるなら401のレスポンスを返す。
 */
export function requireBasicAuth(authorization: string | null, credentials: BasicAuthCredentials): Response | undefined {
  // 手元の開発では設定しないので、そのまま通す
  if (!credentials.user || !credentials.password) return undefined;

  const given = decodeBasic(authorization);
  if (given && given.user === credentials.user && given.password === credentials.password) return undefined;

  return new Response("ログインが必要です", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="jev-music-demo", charset="UTF-8"' },
  });
}

function decodeBasic(authorization: string | null): { user: string; password: string } | undefined {
  const match = authorization?.match(/^Basic\s+(.+)$/i);
  if (!match) return undefined;
  let decoded: string;
  try {
    decoded = atob(match[1]!);
  } catch {
    return undefined;
  }
  // パスワード側に「:」が含まれてもよいように、最初の「:」で分ける
  const separator = decoded.indexOf(":");
  if (separator < 0) return undefined;
  return { user: decoded.slice(0, separator), password: decoded.slice(separator + 1) };
}
