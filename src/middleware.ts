// src/middleware.ts
import { NextRequest, NextResponse } from "next/server";

// 乱数の簡易ID（外部ライブラリ不要）
function makeReqId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function middleware(req: NextRequest) {
  const reqId = makeReqId();
  const url = req.nextUrl;
  const method = req.method;

  // ここが Vercel Logs に出ます（Edge Function logs）
  console.log(
    `[REQ ${reqId}] ${method} ${url.pathname}${url.search} ` +
      `ua="${req.headers.get("user-agent") ?? "-"}" ` +
      `ip="${req.headers.get("x-forwarded-for") ?? "-"}"`
  );

  // 後続の API/ページでも同じ reqId を見れるようにヘッダ付与
  const res = NextResponse.next();
  res.headers.set("x-request-id", reqId);
  return res;
}

// 不要なものを除外（静的ファイルや画像など）
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
