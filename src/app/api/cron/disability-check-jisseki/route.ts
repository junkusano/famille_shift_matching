//api/cron/disability-check-jisseki/route.ts
import { NextResponse } from "next/server";

export async function GET() {
  try {
    // 手動で保存された disability_check.asigned_jisseki_staff を、
    // cs_kaipoke_info の自動割当値で上書きしない。未設定行は表示APIが
    // シフト実績から補完するため、このcronでのDB同期は不要。
    console.info("[jisseki-staff:auto-assign]", {
      source: "cron/disability-check-jisseki",
      result: "skipped_to_preserve_manual_assignments",
    });
    return NextResponse.json({ ok: true, skipped: "preserve_manual_assignments" });
  } catch (e) {
    console.error("disability_check jisseki cron error:", e);
    return NextResponse.json(
      { ok: false, error: String(e) },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";
