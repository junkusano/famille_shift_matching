import { NextResponse } from "next/server";
import { refreshDisabilityCheckJissekiStaff } from "@/lib/disabilityCheckJisseki";

export async function GET() {
  try {
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
