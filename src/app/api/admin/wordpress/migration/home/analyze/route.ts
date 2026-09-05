import { NextRequest, NextResponse } from "next/server";
import { requireManagerOrAdmin } from "@/lib/auth/requireManagerOrAdmin";
import { LegacySiteMigrationError, fetchAndAnalyzeLegacyHome } from "@/lib/site-migration/legacy-home";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const authError = await requireManagerOrAdmin(request);
  if (authError) return authError;
  try {
    const analysis = await fetchAndAnalyzeLegacyHome();
    return NextResponse.json({ ok: true, analysis });
  } catch (error) {
    const message = error instanceof LegacySiteMigrationError
      ? error.message
      : "現行サイトを取得・解析できませんでした。";
    const status = error instanceof LegacySiteMigrationError ? error.status : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
