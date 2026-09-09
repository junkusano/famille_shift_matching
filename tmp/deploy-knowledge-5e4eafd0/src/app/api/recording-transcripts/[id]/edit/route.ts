import { NextRequest, NextResponse } from "next/server";
import { getRecordingTranscriptAuthUserId } from "@/lib/recording-transcript-auth";
import {
  updateRecordingTranscript,
  type RecordingTranscriptUpdateInput,
} from "@/lib/recording-transcript-mutations";
import {
  isRecordingTranscriptPortal,
  RecordingTranscriptAccessError,
  type RecordingTranscriptParticipant,
} from "@/lib/recording-transcripts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

class InputError extends Error {}

function nullableText(value: unknown, label: string, maxLength: number): string | null {
  if (value !== null && typeof value !== "string") {
    throw new InputError(`${label}の形式が不正です`);
  }
  const cleaned = typeof value === "string" ? value.trim() : "";
  if (cleaned.length > maxLength) throw new InputError(`${label}が長すぎます`);
  return cleaned || null;
}

function participantText(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== "string") throw new InputError(`${label}の形式が不正です`);
  const cleaned = value.trim();
  if (!cleaned || cleaned.length > maxLength) throw new InputError(`${label}の形式が不正です`);
  return cleaned;
}

function parseParticipants(value: unknown): RecordingTranscriptParticipant[] {
  if (!Array.isArray(value) || value.length > 20) {
    throw new InputError("参加者は20名以内で入力してください");
  }
  return value.map((item, index) => {
    if (!item || typeof item !== "object") throw new InputError("参加者の形式が不正です");
    const row = item as Record<string, unknown>;
    const kind = row.kind;
    if (kind !== "staff" && kind !== "other") throw new InputError("参加者の種別が不正です");
    const staffUserId = row.staffUserId;
    if (staffUserId !== null && staffUserId !== undefined && typeof staffUserId !== "string") {
      throw new InputError("参加者の職員IDが不正です");
    }
    return {
      id: participantText(row.id, `参加者${index + 1}のID`, 200),
      kind,
      label: participantText(row.label, `参加者${index + 1}の名前`, 200),
      staffUserId: typeof staffUserId === "string" ? staffUserId.trim() || null : null,
    };
  });
}

function parseBody(value: unknown): RecordingTranscriptUpdateInput {
  if (!value || typeof value !== "object") throw new InputError("入力内容が不正です");
  const body = value as Record<string, unknown>;
  return {
    clientId: nullableText(body.clientId, "利用者ID", 200),
    clientName: nullableText(body.clientName, "利用者名", 200),
    contextId: nullableText(body.contextId, "コンテキストID", 200),
    contextName: nullableText(body.contextName, "コンテキスト名", 300),
    participants: parseParticipants(body.participants),
    transcriptRaw: nullableText(body.transcriptRaw, "文字起こし本文", 2_000_000),
  };
}

export async function PATCH(
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
    const input = parseBody(await request.json());
    const { id } = await params;
    const detail = await updateRecordingTranscript(authUserId, portal, id, input);
    if (!detail) {
      return NextResponse.json({ ok: false, error: "文字起こしが見つかりません" }, { status: 404 });
    }
    return NextResponse.json(
      { ok: true, detail },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof InputError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }
    if (error instanceof RecordingTranscriptAccessError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    }
    console.error("[recording-transcripts/edit]", error);
    return NextResponse.json(
      { ok: false, error: "文字起こしを保存できませんでした" },
      { status: 500 },
    );
  }
}
