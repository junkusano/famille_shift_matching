import { NextRequest, NextResponse } from "next/server";
import { requireManagerOrAdmin } from "@/lib/auth/requireManagerOrAdmin";
import { WordPressApiError } from "@/lib/wordpress/server";
import { LegacySiteMigrationError } from "@/lib/site-migration/legacy-home";
import { createLegacyHomeMigrationDraft } from "@/lib/site-migration/wordpress-home-draft";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let activeDraftCreation = false;

export async function POST(request: NextRequest) {
  const authError = await requireManagerOrAdmin(request);
  if (authError) return authError;
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return NextResponse.json(
      { ok: false, error: "Content-Typeはapplication/jsonを指定してください。" },
      { status: 415 }
    );
  }
  const body = await request.json().catch(() => null);
  if (!body || body.confirm !== true) {
    return NextResponse.json(
      { ok: false, error: "下書き作成の確認が必要です。" },
      { status: 400 }
    );
  }
  if (activeDraftCreation) {
    return NextResponse.json(
      { ok: false, error: "トップページ下書きを作成中です。完了までお待ちください。" },
      { status: 409 }
    );
  }

  activeDraftCreation = true;
  try {
    const result = await createLegacyHomeMigrationDraft();
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (error) {
    if (error instanceof WordPressApiError) {
      return NextResponse.json({ ok: false, error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof LegacySiteMigrationError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { ok: false, error: "WordPress下書きを作成できませんでした。" },
      { status: 500 }
    );
  } finally {
    activeDraftCreation = false;
  }
}
