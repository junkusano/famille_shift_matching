import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { supabaseAdmin } from "@/lib/supabase/service";
import { isRpaTaimeeError, requireTaimeeRpaOperator } from "@/lib/rpa/taimee";
import { OPENAI_PROFILES } from "@/lib/openaiProfiles";

export const dynamic = "force-dynamic";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const MAX_IDS = 20;
const MAX_CHARS = 120_000;
type RecordingTranscriptRow = {
  id: string;
  client_id: string | null;
  client_name: string | null;
  context_name: string | null;
  recorded_at: string;
  recorder_email: string | null;
  participants: unknown;
  transcript_status: string;
  transcript_raw: string | null;
};

function errorResponse(error: unknown) {
  if (isRpaTaimeeError(error)) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error("[rpa/recording-transcripts] request failed", error);
  return NextResponse.json({ error: "録音データの取得に失敗しました" }, { status: 500 });
}

export async function GET(request: NextRequest) {
  try {
    await requireTaimeeRpaOperator(request);
    const clientId = request.nextUrl.searchParams.get("client_id")?.trim() ?? "";
    const clientName = request.nextUrl.searchParams.get("client_name")?.trim() ?? "";
    const select = "id, client_id, client_name, context_name, recorded_at, recorder_email, participants, transcript_status, transcript_raw";
    let data: RecordingTranscriptRow[] = [];
    if (clientId || clientName) {
      let query = supabaseAdmin
        .from("recording_transcripts")
        .select(select)
        .eq("transcript_status", "completed")
        .not("transcript_raw", "is", null)
        .order("recorded_at", { ascending: false })
        .limit(100);

      if (clientId && clientName) {
        query = query.or(`client_id.eq.${clientId},client_name.ilike.*${clientName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}*`);
      } else if (clientId) {
        query = query.eq("client_id", clientId);
      } else {
        query = query.ilike("client_name", `%${clientName.replace(/[%_]/g, "\\$&")}%`);
      }

      const matched = await query;
      if (matched.error) throw matched.error;
      data = matched.data ?? [];
    }

    const candidates = (data ?? []).map((row) => ({
      ...row,
      summary: null,
      match_kind: clientId && row.client_id === clientId ? "client_id" : "client_name",
    }));

    const { data: unassigned, error: unassignedError } = await supabaseAdmin
      .from("recording_transcripts")
      .select(select)
      .eq("transcript_status", "completed")
      .is("client_id", null)
      .is("client_name", null)
      .not("transcript_raw", "is", null)
      .order("recorded_at", { ascending: false })
      .limit(100);
    if (unassignedError) throw unassignedError;

    const ids = new Set(candidates.map((item) => item.id));
    for (const row of unassigned ?? []) {
      if (!ids.has(row.id)) candidates.push({ ...row, summary: null, match_kind: "unassigned" });
    }
    return NextResponse.json({ candidates });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireTaimeeRpaOperator(request);
    const body = await request.json().catch(() => null) as { transcript_ids?: unknown } | null;
    const transcriptIds = Array.isArray(body?.transcript_ids)
      ? [...new Set(body.transcript_ids.filter((id): id is string => typeof id === "string"))]
      : [];
    if (transcriptIds.length === 0 || transcriptIds.length > MAX_IDS) {
      return NextResponse.json({ error: `文字起こしは1〜${MAX_IDS}件で指定してください` }, { status: 400 });
    }
    const { data, error } = await supabaseAdmin
      .from("recording_transcripts")
      .select("id, recorded_at, context_name, transcript_raw")
      .in("id", transcriptIds)
      .eq("transcript_status", "completed");
    if (error) throw error;
    const byId = new Map((data ?? []).map((row) => [row.id, row]));
    const source = transcriptIds.map((id, index) => {
      const row = byId.get(id);
      return `【記録${index + 1} ${row?.recorded_at ?? "日時不明"} ${row?.context_name ?? "項目未設定"}】\n${(row?.transcript_raw ?? "").slice(0, Math.floor(MAX_CHARS / transcriptIds.length))}`;
    }).join("\n\n");
    const response = await openai.chat.completions.create({
      model: OPENAI_PROFILES.standard.model,
      max_completion_tokens: 4000,
      messages: [{
        role: "user",
        content: `以下の複数の録音文字起こしを、障害福祉のカイポケ経過記録へ貼り付けられる文章に整理してください。文字起こしにない事実は補わず、記録ごとの日時・項目を残し、簡潔な日本語で出力してください。\n\n${source}`,
      }],
    });
    const summary = response.choices[0]?.message?.content?.trim();
    if (!summary) return NextResponse.json({ error: "要約結果が空でした" }, { status: 502 });
    return NextResponse.json({ summary });
  } catch (error) {
    return errorResponse(error);
  }
}
