import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getUserFromBearer } from "@/lib/auth/getUserFromBearer";
import { OPENAI_PROFILES } from "@/lib/openaiProfiles";
import {
  RecordingTranscriptAccessError,
  requireRecordingTranscriptPortalAccess,
} from "@/lib/recording-transcripts";
import { supabaseAdmin } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Body = {
  assessment_id?: string;
  transcript_ids?: string[];
};

type TranscriptRow = {
  id: string;
  client_id: string | null;
  context_name: string | null;
  file_name: string;
  recorder_email: string | null;
  recorded_at: string;
  transcript_status: string;
  transcript_raw: string | null;
  participants: unknown;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_TRANSCRIPTS = 10;
const MAX_COMBINED_TRANSCRIPT_CHARS = 120_000;

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await getUserFromBearer(request);
    if (!user) {
      return NextResponse.json({ ok: false, error: "認証が必要です" }, { status: 401 });
    }

    const body = (await request.json()) as Body;
    const assessmentId = clean(body.assessment_id);
    const transcriptIds = [...new Set(body.transcript_ids ?? [])]
      .map(clean)
      .filter((id) => UUID_RE.test(id));

    if (!assessmentId || transcriptIds.length === 0) {
      return NextResponse.json(
        { ok: false, error: "アセスメントと文字起こしを指定してください" },
        { status: 400 },
      );
    }
    if (transcriptIds.length > MAX_TRANSCRIPTS) {
      return NextResponse.json(
        { ok: false, error: `文字起こしは${MAX_TRANSCRIPTS}件まで選択できます` },
        { status: 400 },
      );
    }

    await requireRecordingTranscriptPortalAccess(user.id, "helper");

    const { data: assessment, error: assessmentError } = await supabaseAdmin
      .from("assessments_records")
      .select("assessment_id,client_info_id,kaipoke_cs_id")
      .eq("assessment_id", assessmentId)
      .eq("is_deleted", false)
      .maybeSingle();
    if (assessmentError) throw assessmentError;
    if (!assessment) {
      return NextResponse.json(
        { ok: false, error: "アセスメントが見つかりません" },
        { status: 404 },
      );
    }

    const allowedClientIds = [
      clean(assessment.client_info_id),
      clean(assessment.kaipoke_cs_id),
    ].filter(Boolean);

    const { data, error } = await supabaseAdmin
      .from("recording_transcripts")
      .select(
        "id,client_id,context_name,file_name,recorder_email,recorded_at,transcript_status,transcript_raw,participants",
      )
      .in("id", transcriptIds)
      .in("client_id", allowedClientIds)
      .eq("transcript_status", "completed");
    if (error) throw error;

    const rows = (data ?? []) as TranscriptRow[];
    if (rows.length !== transcriptIds.length || rows.some((row) => !clean(row.transcript_raw))) {
      return NextResponse.json(
        { ok: false, error: "選択した文字起こしを取得できないか、文字起こしが未完了です" },
        { status: 422 },
      );
    }

    const rowsById = new Map(rows.map((row) => [row.id, row]));
    const orderedRows = transcriptIds
      .map((id) => rowsById.get(id))
      .filter((row): row is TranscriptRow => Boolean(row));
    const perTranscriptLimit = Math.max(
      8_000,
      Math.floor(MAX_COMBINED_TRANSCRIPT_CHARS / orderedRows.length),
    );
    const transcriptText = orderedRows
      .map((row, index) =>
        [
          `## 文字起こし ${index + 1}`,
          `録音日時: ${row.recorded_at}`,
          `会議・録音名: ${clean(row.context_name) || clean(row.file_name)}`,
          `録音者: ${clean(row.recorder_email) || "記載なし"}`,
          `参加者情報: ${JSON.stringify(row.participants ?? [])}`,
          clean(row.transcript_raw).slice(0, perTranscriptLimit),
        ].join("\n"),
      )
      .join("\n\n");

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await openai.chat.completions.create({
      model: OPENAI_PROFILES.standard.model,
      messages: [
        {
          role: "system",
          content:
            "あなたは介護・障害福祉のサービス担当者会議議事録を作成する専門職です。文字起こしに無い事実を補わず、不明な項目は『記載なし』としてください。",
        },
        {
          role: "user",
          content: [
            "以下の複数の文字起こしを統合し、アセスメントの『担当者会議議事録』欄へ貼り付けられる日本語の議事録に整理してください。",
            "録音ごとの内容を時系列で確認し、重複、相づち、雑談を除いてください。内容が食い違う場合は新しい録音を優先し、重要な相違は明記してください。",
            "決定事項、本人・家族の意向、担当者の役割、残された課題を明確にしてください。",
            "次の見出しをこの順番で使用してください。",
            "【開催日時・対象録音】",
            "【出席者】",
            "【本人・家族の意向】",
            "【検討内容・各担当者からの情報】",
            "【決定事項・支援方針】",
            "【役割分担】",
            "【残された課題・次回確認事項】",
            transcriptText,
          ].join("\n\n"),
        },
      ],
      max_completion_tokens: 4_000,
    });

    const meetingMinutes = response.choices[0]?.message?.content?.trim() ?? "";
    if (!meetingMinutes) throw new Error("議事録の生成結果が空です");

    return NextResponse.json({
      ok: true,
      meeting_minutes: meetingMinutes,
      transcript_ids: transcriptIds,
    });
  } catch (error) {
    if (error instanceof RecordingTranscriptAccessError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    }
    console.error("[assessment][meeting-minutes-summary] error", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "議事録を生成できませんでした" },
      { status: 500 },
    );
  }
}
