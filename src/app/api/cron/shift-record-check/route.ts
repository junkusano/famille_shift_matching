// /src/app/api/cron/shift-record-check/route.ts
import { NextResponse } from "next/server";
import { runShiftRecordCheck } from "@/lib/shiftRecordCheck";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const hasVercelCron = !!req.headers.get('x-vercel-cron'); // Vercel Cron からの実行判定
  const hasSharedKey  = req.headers.get('x-cron-key') === process.env.CRON_SECRET;

  if (!hasVercelCron && !hasSharedKey) {
    return NextResponse.json({ ok: false, error: 'unauthorized_cron' }, { status: 401 });
  }

  const result = await runShiftRecordCheck({ dryRun: false }); // ← 送信する
  return NextResponse.json({ source: 'cron-api', ...result });
}

