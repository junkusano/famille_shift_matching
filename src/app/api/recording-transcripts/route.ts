import { NextRequest, NextResponse } from "next/server";
import { getRecordingTranscriptAuthUserId } from "@/lib/recording-transcript-auth";
import {
  getRecordingTranscriptsPageData,
  isRecordingTranscriptPortal,
  RecordingTranscriptAccessError,
} from "@/lib/recording-transcripts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function positiveInteger(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export async function GET(request: NextRequest) {
  const portal = request.nextUrl.searchParams.get("portal");
  if (!isRecordingTranscriptPortal(portal)) {
    return NextResponse.json({ ok: false, error: "Portalの指定が不正です" }, { status: 400 });
  }

  const authUserId = await getRecordingTranscriptAuthUserId(request);
  if (!authUserId) {
    return NextResponse.json({ ok: false, error: "ログインしてください" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  try {
    const data = await getRecordingTranscriptsPageData(authUserId, portal, {
      page: positiveInteger(params.get("page"), 1),
      perPage: positiveInteger(params.get("perPage"), 50),
      dateFrom: params.get("date_from"),
      dateTo: params.get("date_to"),
      recorderUserId: params.get("recorder_user_id"),
      clientName: params.get("client_name"),
      clientId: params.get("client_id"),
      contextName: params.get("context_name"),
      status: params.get("status"),
      keyword: params.get("keyword"),
    });
    return NextResponse.json(
      { ok: true, data },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof RecordingTranscriptAccessError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    }
    console.error("[recording-transcripts/list]", error);
    return NextResponse.json(
      { ok: false, error: "文字起こし一覧を取得できませんでした" },
      { status: 500 },
    );
  }
}
