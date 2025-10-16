// /src/app/api/cron/shift-record-check/route.ts
import { NextRequest, NextResponse } from "next/server";
import { runShiftRecordCheck } from "@/lib/shiftRecordCheck";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET ?? "";
  const auth = req.headers.get("authorization") || "";
  const headerKey = req.headers.get("x-cron-secret") || "";
  const vercelCron = req.headers.get("x-vercel-cron");

  // 許可する認証パターン
  const okBearer = !!secret && auth === `Bearer ${secret}`;
  const okHeader = !!secret && headerKey === secret;
  const okVercel = !!vercelCron; // Vercel Cron からの実行時に付与される

  if (!(okBearer || okHeader || okVercel)) {
    return NextResponse.json({ ok: false, error: "unauthorized_cron" }, { status: 401 });
  }

  // まずはDRY RUN（本番で更新したいときは false に）
  const result = await runShiftRecordCheck({ dryRun: true });
  return NextResponse.json({ source: "cron-api", ...result });
}
