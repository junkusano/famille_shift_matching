import { NextRequest, NextResponse } from "next/server";
import { getRecordingTranscriptAuthUserId } from "@/lib/recording-transcript-auth";
import { deleteRecordingTranscript } from "@/lib/recording-transcript-mutations";
import {
  isRecordingTranscriptPortal,
  RecordingTranscriptAccessError,
} from "@/lib/recording-transcripts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const portal = request.nextUrl.searchParams.get("portal");
  if (!isRecordingTranscriptPortal(portal)) {
    return NextResponse.json({ ok: false, error: "Portalの指定が不正です" }, { status: 400 });
  }

  const authUserId = await getRecordingTranscriptAuthUserId(request);
  if (!authUserId) {
    return NextResponse.json({ ok: false, error: "ログインしてください" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const deleted = await deleteRecordingTranscript(authUserId, portal, id);
    if (!deleted) {
      return NextResponse.json({ ok: false, error: "文字起こしが見つかりません" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof RecordingTranscriptAccessError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    }
    console.error("[recording-transcripts/delete]", error);
    return NextResponse.json(
      { ok: false, error: "文字起こしを削除できませんでした" },
      { status: 500 },
    );
  }
}
