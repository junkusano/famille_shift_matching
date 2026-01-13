// src/app/api/_debug/ping/route.ts
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic"; // キャッシュでログが出ない事故を避ける

export async function GET(req: NextRequest) {
  const url = new URL(req.url);

  // ここが Vercel Logs に出ます（Serverless Function logs）
  console.log("[DEBUG PING] method=GET", {
    pathname: url.pathname,
    search: url.search,
    headers: {
      "x-request-id": req.headers.get("x-request-id"),
      "user-agent": req.headers.get("user-agent"),
      "x-forwarded-for": req.headers.get("x-forwarded-for"),
    },
  });

  return NextResponse.json({
    ok: true,
    now: new Date().toISOString(),
    path: url.pathname,
    query: Object.fromEntries(url.searchParams.entries()),
    requestId: req.headers.get("x-request-id"),
  });
}
