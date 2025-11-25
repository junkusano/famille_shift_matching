// app/api/cron/tokutei-sum-order-clone/route.ts
import "server-only";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { runTokuteiSumOrderClone } from "@/lib/tokutei_sum_order_clone";

// 文字列 → 数値（不正なら null）
function parseIntOrNull(v: string | null): number | null {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// GET: クローン実行（認証なし・添付の sum-order と同じくそのまま実行）
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const limitParam = parseIntOrNull(url.searchParams.get("limit"));
    const fromDate = url.searchParams.get("from") || undefined;

    const result = await runTokuteiSumOrderClone({
      limit: limitParam ?? undefined,
      fromDate,
    });

    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[tokutei/clone] error", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST でも叩けるようにしておく（必要なければ削ってOK）
export async function POST(req: NextRequest) {
  return GET(req);
}
