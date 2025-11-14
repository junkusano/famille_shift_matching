// src/app/api/cron/shift-record-check/route.ts
// 認証だけ行い、lib の実体を dryRun:true で呼ぶ（＝送信なし・実施のみ）
// ※ このファイルでは supabase を import しない

import { NextRequest, NextResponse } from 'next/server';
import { assertCronAuth } from '../../alert_add/_shared';
import { runShiftRecordCheck } from "@/lib/shift/shift_record_check";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  assertCronAuth(req);
  // Vercel Cron or 共有鍵のどちらかを満たせばOK
  const hasVercelCron = !!req.headers.get("x-vercel-cron");
  const hasSharedKey = req.headers.get("x-cron-key") === process.env.CRON_SECRET;
  if (!hasVercelCron && !hasSharedKey) {
    return NextResponse.json({ ok: false, error: "unauthorized_cron" }, { status: 401 });
  }

  // 実施のみ（送信なし）
  const result = await runShiftRecordCheck({ dryRun: true });
  return NextResponse.json({ source: "cron-api", ...result });
}