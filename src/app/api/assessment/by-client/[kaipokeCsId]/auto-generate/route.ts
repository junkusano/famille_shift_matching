// src/app/api/assessment/by-client/[kaipokeCsId]/auto-generate/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import { getUserFromBearer } from "@/lib/auth/getUserFromBearer";
import {
  buildAssessmentContentForKind,
  detectAssessmentKindsFromClient,
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

type ExistingAssessmentRow = {
  assessment_id: string;
  service_kind: string | null;
  is_deleted: boolean | null;
};

type SupabaseAny = typeof supabaseAdmin & {
  from: (table: string) => any;
};

const db = supabaseAdmin as SupabaseAny;

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

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

async function lookupClient(clientKey: string) {
  const selectCols = [
    "id",
    "kaipoke_cs_id",
    "name",
    "name_kana",
    "kana",
    "gender",
    "address",
    "phone_01",
    "phone_02",
    "birth_yyyy_mm_dd",
    "service_kind",
    "kaigo_hoken_no",
    "kaigo_start_at",
    "kaigo_end_at",
    "shogai_jukyusha_no",
    "shogai_start_at",
    "shogai_end_at",
    "ido_start_at",
    "ido_end_at",
    "documents",
  ].join(", ");

  // 重要: .or(`kaipoke_cs_id.eq.${x},id.eq.${x}`) は使わない。
  // x が数値の kaipoke_cs_id の場合、id.eq.13000512 が uuid型エラーになり PostgREST 400 になる。
  const byKaipoke = await db
    .from("cs_kaipoke_info")
    .select(selectCols)
    .eq("kaipoke_cs_id", clientKey)
    .maybeSingle();

  if (byKaipoke.error) {
    console.error("[assessment/by-client] client lookup by kaipoke_cs_id failed", {
      clientKey,
      code: byKaipoke.error.code,
      message: byKaipoke.error.message,
      details: byKaipoke.error.details,
      hint: byKaipoke.error.hint,
    });
    throw byKaipoke.error;
  }

  if (byKaipoke.data) return byKaipoke.data as unknown as ClientAssessmentSource;

  // UUID のときだけ id でも探す。
  // 数値IDでは絶対に id.eq を投げない。
  if (!isUuid(clientKey)) return null;

  const byId = await db
    .from("cs_kaipoke_info")
    .select(selectCols)
    .eq("id", clientKey)
    .maybeSingle();

  if (byId.error) {
    console.error("[assessment/by-client] client lookup by id failed", {
      clientKey,
      code: byId.error.code,
      message: byId.error.message,
      details: byId.error.details,
      hint: byId.error.hint,
    });
    throw byId.error;
  }

  return byId.data as unknown as ClientAssessmentSource | null;
}

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const { user } = await getUserFromBearer(req);
    const { kaipokeCsId } = await params;
    const clientKey = decodeURIComponent(kaipokeCsId).trim();
    const body = (await req.json().catch(() => ({}))) as RequestBody;

    const requestedKind = body.service_kind;
    if (requestedKind && !isKnownAssessmentKind(requestedKind)) {
      return json({ ok: false, error: `未対応の service_kind です: ${requestedKind}` }, 400);
    }

    const client = await lookupClient(clientKey);
    if (!client) {
      return json({ ok: false, error: "利用者が見つかりません", client_key: clientKey }, 404);
    }

    const { data: weeklyRowsRaw, error: weeklyError } = await db
      .from("plan_generation_source_view")
      .select(
        "template_id, kaipoke_cs_id, weekday, weekday_jp, start_time, end_time, duration_minutes, service_code, kaipoke_servicek, kaipoke_servicecode, plan_document_kind, plan_service_category, plan_display_name, active",
      )
      .eq("kaipoke_cs_id", client.kaipoke_cs_id)
      .eq("active", true);

    if (weeklyError) {
      console.error("[assessment/by-client] weekly source lookup failed", {
        kaipoke_cs_id: client.kaipoke_cs_id,
        code: weeklyError.code,
        message: weeklyError.message,
        details: weeklyError.details,
        hint: weeklyError.hint,
      });
      throw weeklyError;
    }

    let weeklyRows = (weeklyRowsRaw ?? []) as WeeklyAssessmentSourceRow[];

    // plan_generation_source_view で判定できない場合の保険。
    // 実シフト側にだけサービスがあるケースではこちらからサービスコード/カイポケ区分を拾う。
    // 失敗しても本処理は止めず、ログだけ出す。
    let shiftFallbackRows: WeeklyAssessmentSourceRow[] = [];
    if (weeklyRows.length === 0) {
      const from = new Date();
      from.setDate(from.getDate() - 30);
      const to = new Date();
      to.setDate(to.getDate() + 90);
      const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

      const { data: shiftRowsRaw, error: shiftError } = await db
        .from("shift_add_status_view")
        .select("kaipoke_cs_id, shift_start_date, shift_start_time, shift_end_time, service_code, kaipoke_servicek, kaipoke_servicecode, status")
        .eq("kaipoke_cs_id", client.kaipoke_cs_id)
        .gte("shift_start_date", ymd(from))
        .lte("shift_start_date", ymd(to))
        .limit(200);

      if (shiftError) {
        console.error("[assessment/by-client] shift fallback lookup failed", {
          kaipoke_cs_id: client.kaipoke_cs_id,
          code: shiftError.code,
          message: shiftError.message,
          details: shiftError.details,
          hint: shiftError.hint,
        });
      } else {
        shiftFallbackRows = ((shiftRowsRaw ?? []) as any[]).map((r) => ({
          kaipoke_cs_id: r.kaipoke_cs_id ?? null,
          shift_start_date: r.shift_start_date ?? null,
          start_time: r.shift_start_time ?? null,
          end_time: r.shift_end_time ?? null,
          service_code: r.service_code ?? null,
          kaipoke_servicek: r.kaipoke_servicek ?? null,
          kaipoke_servicecode: r.kaipoke_servicecode ?? null,
          status: r.status ?? null,
        }));
        weeklyRows = shiftFallbackRows;
      }
    }

    const detectedFromWeekly = detectAssessmentKindsFromWeeklyRows(weeklyRows);
    const detectedFromClient = detectAssessmentKindsFromClient(client);

    // service_kind は「この画面で選択中の種別」。
    // 以前のコードのように requestedKind だけに絞ると、複数サービス利用者で片方しか作られない。
    // そのため、週間シフト判定 + 利用者契約情報 + 画面選択中の種別を union する。
    const targetSet = new Set<AutoAssessmentKind>([...detectedFromWeekly, ...detectedFromClient]);
    if (requestedKind) targetSet.add(requestedKind);
    const detectedKinds = [...new Set<AutoAssessmentKind>([...detectedFromWeekly, ...detectedFromClient])];
    const targetKinds = [...targetSet];

    console.info("[assessment/by-client] detected assessment kinds", {
      clientKey,
      kaipoke_cs_id: client.kaipoke_cs_id,
      weeklyRows: weeklyRows.length,
      shiftFallbackRows: shiftFallbackRows.length,
      detectedFromWeekly,
      detectedFromClient,
      detectedKinds,
      requestedKind: requestedKind ?? null,
      targetKinds,
    });

    if (targetKinds.length === 0) {
      return json({
        ok: true,
        created: [],
        updated: [],
        skipped: [],
        detected_kinds: [],
        target_kinds: [],
        weekly_rows: weeklyRows.length,
        shift_fallback_rows: shiftFallbackRows.length,
        client_service_kind: client.service_kind ?? null,
        message: "週間シフト・実シフト・利用者契約情報から生成対象のアセスメント種別を判定できませんでした。",
      });
    }

    const { data: existingRaw, error: existingError } = await db
      .from("assessments_records")
      .select("assessment_id, service_kind, is_deleted")
      .eq("kaipoke_cs_id", client.kaipoke_cs_id)
      .eq("is_deleted", false);

    if (existingError) {
      console.error("[assessment/by-client] existing assessments lookup failed", {
        kaipoke_cs_id: client.kaipoke_cs_id,
        code: existingError.code,
        message: existingError.message,
        details: existingError.details,
        hint: existingError.hint,
      });
      throw existingError;
    }

    const existingByKind = new Map<string, { assessment_id: string; service_kind: string | null }>();
    for (const row of (existingRaw ?? []) as ExistingAssessmentRow[]) {
      if (row.service_kind) {
        existingByKind.set(row.service_kind, {
          assessment_id: row.assessment_id,
          service_kind: row.service_kind,
        });
      }
    }

    const created: unknown[] = [];
    const updated: unknown[] = [];
    const skipped: unknown[] = [];
    const assessedOn = trimString(body.assessed_on) || todayYmd();

    // assessments_records.author_user_id / author_name は NOT NULL。
    // null を入れると障害・介護に関係なく insert/update で落ちるため、空文字に寄せる。
    const authorUserId = user?.id ?? "";
    const authorName = trimString(body.author_name) || "";
    const sourceText = trimString(body.source_text);

    for (const kind of targetKinds) {
      const existing = existingByKind.get(kind);
      const content = buildAssessmentContentForKind({
        kind,
        client,
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
        const { data, error } = await db
          .from("assessments_records")
          .update({
            assessed_on: assessedOn,
            author_user_id: authorUserId,
            author_name: authorName,
            content,
            updated_at: new Date().toISOString(),
          })
          .eq("assessment_id", existing.assessment_id)
          .select("*")
          .single();

        if (error) {
          console.error("[assessment/by-client] update failed", {
            kind,
            assessment_id: existing.assessment_id,
            code: error.code,
            message: error.message,
            details: error.details,
            hint: error.hint,
          });
          throw error;
        }
        updated.push(data);
        continue;
      }

      const { data, error } = await db
        .from("assessments_records")
        .insert({
          client_info_id: client.id,
          kaipoke_cs_id: client.kaipoke_cs_id,
          service_kind: kind,
          assessed_on: assessedOn,
          author_user_id: authorUserId,
          author_name: authorName,
          content,
          is_deleted: false,
        })
        .select("*")
        .single();

      if (error) {
        console.error("[assessment/by-client] insert failed", {
          kind,
          kaipoke_cs_id: client.kaipoke_cs_id,
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        });
        throw error;
      }
      created.push(data);
    }

    return json({
      ok: true,
      created,
      updated,
      skipped,
      detected_kinds: detectedKinds,
      target_kinds: targetKinds,
      weekly_rows: weeklyRows.length,
      shift_fallback_rows: shiftFallbackRows.length,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[assessment/by-client] auto-generate failed", { error: msg });
    return json({ ok: false, error: msg }, 500);
  }
}
