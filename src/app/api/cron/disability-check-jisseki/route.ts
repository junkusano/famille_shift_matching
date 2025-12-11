import { NextRequest, NextResponse } from "next/server";
import { refreshDisabilityCheckJissekiStaff } from "@/lib/disabilityCheckJisseki";

export async function GET(_req: NextRequest) {
  try {
    // 基準日は「今日」で OK（関数内で YYYY-MM-DD に変換）
    await refreshDisabilityCheckJissekiStaff();
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("disability_check jisseki cron error:", e);
    return NextResponse.json(
      { ok: false, error: String(e) },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";
