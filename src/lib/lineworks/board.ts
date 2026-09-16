import "server-only";
import jwt from "jsonwebtoken";

// LINE WORKS IDs exceed Number.MAX_SAFE_INTEGER. Keep them as decimal strings.
export function parseWorksJson(text: string) {
  return JSON.parse(text.replace(/("(?:boardId|postId)"\s*:\s*)(\d+)/g, '$1"$2"'));
}

export async function getBoardToken(): Promise<string> {
  const { LINEWORKS_CLIENT_ID: clientId, LINEWORKS_CLIENT_SECRET: secret,
    LINEWORKS_SERVICE_ACCOUNT: account, LINEWORKS_PRIVATE_KEY: key } = process.env;
  if (!clientId || !secret || !account || !key) throw new Error("掲示板の接続設定が不足しています。");
  const assertion = jwt.sign({ iss: clientId, sub: account }, key.replace(/\\n/g, "\n"), { algorithm: "RS256", expiresIn: 3600 });
  const response = await fetch("https://auth.worksmobile.com/oauth2/v2.0/token", {
    method: "POST", signal: AbortSignal.timeout(20_000),
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion,
      client_id: clientId, client_secret: secret, scope: "board" }),
  });
  if (!response.ok) throw new Error(`掲示板の認証に失敗しました (${response.status})。`);
  const data = await response.json();
  if (!data.access_token) throw new Error("掲示板の認証応答が不正です。");
  return data.access_token as string;
}

export async function boardRequest(path: string, token: string, method = "GET", body?: unknown) {
  const response = await fetch(`https://www.worksapis.com/v1.0/boards${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store", signal: AbortSignal.timeout(25_000),
  });
  if (!response.ok) throw new Error(`LINE WORKS掲示板の${method}に失敗しました (${response.status})。`);
  const text = await response.text();
  return text ? parseWorksJson(text) : {};
}

export type BoardPost = { boardId: string; postId: string; title: string; body?: string; createdTime?: string; enableComment?: boolean };

export async function listBoardPosts(boardId: string, token: string): Promise<BoardPost[]> {
  const posts: BoardPost[] = [];
  let cursor = "";
  for (let page = 0; page < 10; page++) {
    const data = await boardRequest(`/${encodeURIComponent(boardId)}/posts?count=40${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, token);
    posts.push(...(data.posts ?? []));
    cursor = data.responseMetaData?.nextCursor ?? "";
    if (!cursor) return posts;
  }
  throw new Error("掲示板の投稿数が確認上限を超えました。重複防止のため中止します。");
}
