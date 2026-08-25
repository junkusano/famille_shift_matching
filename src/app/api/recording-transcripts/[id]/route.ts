import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
  getRecordingTranscriptDetail,
  isRecordingTranscriptPortal,
  RecordingTranscriptAccessError,
} from "@/lib/recording-transcripts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const portalParam = request.nextUrl.searchParams.get("portal");
  if (!isRecordingTranscriptPortal(portalParam)) {
    return NextResponse.json({ ok: false, error: "Portalの指定が不正です" }, { status: 400 });
  }

  const auth = createRouteHandlerClient({ cookies });
  const { data, error } = await auth.auth.getUser();
  if (error || !data.user) {
    return NextResponse.json({ ok: false, error: "ログインしてください" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const detail = await getRecordingTranscriptDetail(data.user.id, portalParam, id);
    if (!detail) {
      // 他サービスのIDを指定した場合も存在を漏らさず404にする。
      return NextResponse.json({ ok: false, error: "文字起こしが見つかりません" }, { status: 404 });
    }
    return NextResponse.json(
      { ok: true, detail },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof RecordingTranscriptAccessError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    }
    console.error("[recording-transcripts/detail]", error);
    return NextResponse.json(
      { ok: false, error: "文字起こし詳細を取得できませんでした" },
      { status: 500 },
    );
  }
}
