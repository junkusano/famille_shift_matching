// /api/cron/shift-records/check/route.ts
import { NextRequest, NextResponse } from "next/server";
import { runShiftRecordCheck } from "@/lib/shiftRecordCheck";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  const headerKey = req.headers.get("x-cron-secret") || "";
  const vercelCron = req.headers.get("x-vercel-cron");

  // 1) Bearer か 2) x-cron-secret か 3) Vercel Cron の内部実行 を許可
  const okBearer = secret && auth === `Bearer ${secret}`;
  const okHeader = secret && headerKey === secret;
  const okVercel = !!vercelCron; // Vercel Cron からの実行時に付与

  if (!(okBearer || okHeader || okVercel)) {
    return NextResponse.json({ ok: false, error: "unauthorized_cron" }, { status: 401 });
  }
  // ← ここがポイント：dryRun: true で呼ぶ
  const result = await runShiftRecordCheck({ dryRun: true });
  return NextResponse.json({ source: "cron-api", ...result });
}
