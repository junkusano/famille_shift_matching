// src/app/api/cron/auto_assign_jisseki_staff/route.ts

import { NextResponse } from "next/server";
import { autoAssignJissekiStaff } from "@/lib/auto_assign_staff";

// App Router 用設定
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ★ これが無いと「is not a module」と怒られる
export async function GET() {
  try {
    await autoAssignJissekiStaff();
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[CRON auto_assign_jisseki_staff] ERROR:", e);
    return NextResponse.json(
      { ok: false, error: String(e) },
      { status: 500 }
    );
  }
}
