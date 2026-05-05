// src/app/api/assessment/by-client/[kaipokeCsId]/auto-generate/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import { getUserFromBearer } from "@/lib/auth/getUserFromBearer";
import {
  buildAssessmentContentForKind,
  detectAssessmentKindsFromWeeklyRows,
  isKnownAssessmentKind,
  type AutoAssessmentKind,
  type ClientAssessmentSource,
  type WeeklyAssessmentSourceRow,
} from "@/lib/assessment/assessment-kind-detector";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ kaipokeCsId: string }> };

type RequestBody = {
  assessed_on?: string;
  author_name?: string;
  overwrite?: boolean;
  service_kind?: AutoAssessmentKind;
  source_text?: string;
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function trimString(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const { user } = await getUserFromBearer(req);
    const { kaipokeCsId } = await params;
    const clientKey = decodeURIComponent(kaipokeCsId);
    const body = (await req.json().catch(() => ({}))) as RequestBody;

    const requestedKind = body.service_kind;
    if (requestedKind && !isKnownAssessmentKind(requestedKind)) {
      return json({ ok: false, error: `未対応の service_kind です: ${requestedKind}` }, 400);
    }

    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    // 注意:
    // cs_kaipoke_info.id は uuid、kaipoke_cs_id は text。
    // 数値の kaipoke_cs_id（例: 13000512）を id.eq に入れると
    // Supabase/PostgREST 側で "invalid input syntax for type uuid" になり 400 -> API 500 になる。
    // そのため UUID のときだけ id も検索し、それ以外は kaipoke_cs_id のみで検索する。
    const clientQuery = supabaseAdmin
      .from("cs_kaipoke_info")
      .select(
        "id, kaipoke_cs_id, name, kana, gender, address, phone_01, phone_02, birth_yyyy_mm_dd, service_kind, kaigo_hoken_no, kaigo_start_at, kaigo_end_at, documents",
      );

    const { data: client, error: clientError } = uuidRe.test(clientKey)
      ? await clientQuery.or(`kaipoke_cs_id.eq.${clientKey},id.eq.${clientKey}`).maybeSingle()
      : await clientQuery.eq("kaipoke_cs_id", clientKey).maybeSingle();

    if (clientError) {
      console.error("[assessment/by-client/auto-generate] client lookup failed", {
        clientKey,
        message: clientError.message,
        code: clientError.code,
        details: clientError.details,
        hint: clientError.hint,
      });
      throw clientError;
    }
    if (!client) {
      return json({ ok: false, error: "利用者が見つかりません", kaipoke_cs_id: clientKey }, 404);
    }

    const { data: weeklyRowsRaw, error: weeklyError } = await supabaseAdmin
      .from("plan_generation_source_view")
      .select(
        "template_id, kaipoke_cs_id, weekday, weekday_jp, start_time, end_time, duration_minutes, service_code, kaipoke_servicek, kaipoke_servicecode, plan_document_kind, plan_service_category, plan_display_name",
      )
      .eq("kaipoke_cs_id", client.kaipoke_cs_id)
      .eq("active", true);

    if (weeklyError) throw weeklyError;

    const weeklyRows = (weeklyRowsRaw ?? []) as WeeklyAssessmentSourceRow[];
    const detectedKinds = detectAssessmentKindsFromWeeklyRows(weeklyRows);
    const targetKinds = requestedKind ? [requestedKind] : detectedKinds;

    if (targetKinds.length === 0) {
      return json({
        ok: true,
        created: [],
        updated: [],
        skipped: [],
        detected_kinds: [],
        message: "週間シフトから生成対象のアセスメント種別を判定できませんでした。",
      });
    }

    const { data: existingRaw, error: existingError } = await supabaseAdmin
      .from("assessments_records")
      .select("assessment_id, service_kind, is_deleted")
      .eq("kaipoke_cs_id", client.kaipoke_cs_id)
      .eq("is_deleted", false);

    if (existingError) throw existingError;

    const existingByKind = new Map<string, { assessment_id: string; service_kind: string | null }>();
    for (const row of existingRaw ?? []) {
      if (row.service_kind) existingByKind.set(row.service_kind, row as { assessment_id: string; service_kind: string | null });
    }

    const created: unknown[] = [];
    const updated: unknown[] = [];
    const skipped: unknown[] = [];
    const assessedOn = trimString(body.assessed_on) || todayYmd();
    const authorName = trimString(body.author_name) || null;
    const sourceText = trimString(body.source_text);

    for (const kind of targetKinds) {
      const existing = existingByKind.get(kind);
      const content = buildAssessmentContentForKind({
        kind,
        client: client as ClientAssessmentSource,
        weeklyRows,
        sourceText,
      });

      if (existing && !body.overwrite) {
        skipped.push({
          service_kind: kind,
          assessment_id: existing.assessment_id,
          reason: "already_exists",
        });
        continue;
      }

      if (existing && body.overwrite) {
        const { data, error } = await supabaseAdmin
          .from("assessments_records")
          .update({
            assessed_on: assessedOn,
            author_user_id: user?.id ?? null,
            author_name: authorName,
            content,
            updated_at: new Date().toISOString(),
          })
          .eq("assessment_id", existing.assessment_id)
          .select("*")
          .single();

        if (error) throw error;
        updated.push(data);
        continue;
      }

      const { data, error } = await supabaseAdmin
        .from("assessments_records")
        .insert({
          client_info_id: client.id,
          kaipoke_cs_id: client.kaipoke_cs_id,
          service_kind: kind,
          assessed_on: assessedOn,
          author_user_id: user?.id ?? null,
          author_name: authorName,
          content,
          is_deleted: false,
        })
        .select("*")
        .single();

      if (error) throw error;
      created.push(data);
    }

    return json({
      ok: true,
      created,
      updated,
      skipped,
      detected_kinds: detectedKinds,
      target_kinds: targetKinds,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ ok: false, error: msg }, 500);
  }
}
