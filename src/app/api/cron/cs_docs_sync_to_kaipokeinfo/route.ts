// src/app/api/cron/cs_docs_sync_to_kaipokeinfo/route.ts
import { NextResponse } from "next/server";
import { runCsDocsSyncToKaipokeInfo } from "@/lib/cs_docs_sync";

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  // 1) Authorization: Bearer xxx
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice("Bearer ".length).trim();
    if (token === secret) return true;
  }

  // 2) ?key=xxx でもOKにする（Vercel設定が面倒なとき）
  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  if (key && key === secret) return true;

  return false;
}

export async function GET(req: Request) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const startedAt = Date.now();
    const { updatedInfos } = await runCsDocsSyncToKaipokeInfo();
    const ms = Date.now() - startedAt;

    return NextResponse.json({
      ok: true,
      updated_infos: updatedInfos,
      elapsed_ms: ms,
      ran_at: new Date().toISOString(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[cron][cs_docs_sync_to_kaipokeinfo] error:", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

// POSTでも叩けるように（手動実行用）
export async function POST(req: Request) {
  return GET(req);
}