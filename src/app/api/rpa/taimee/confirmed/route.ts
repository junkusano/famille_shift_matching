import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { reconcileSpotProviders } from "@/lib/spot-sync/reconcile";
import { supabaseAdmin } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
const ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;

function text(value: unknown, limit = 160): string {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function authorized(request: NextRequest): boolean {
  const expected = process.env.TAIMEE_CONFIRMATION_GAS_TOKEN?.trim() ?? "";
  const supplied = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
  if (!expected || !supplied) return false;
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const taimeeJobId = text(body.taimee_job_id, 80);
    const eventId = text(body.event_id, 200);
    const applicationKey = text(body.application_key, 200);
    const occurredAt = text(body.occurred_at, 80);
    const applicantName = text(body.applicant_name);
    if (!ID_PATTERN.test(taimeeJobId)) return NextResponse.json({ ok: false, error: "有効なタイミー案件IDが必要です" }, { status: 400 });
    if (!eventId || !applicationKey || !occurredAt || !Number.isFinite(Date.parse(occurredAt))) {
      return NextResponse.json({ ok: false, error: "確定通知の識別情報が不正です" }, { status: 400 });
    }

    const { data: requests, error: requestError } = await supabaseAdmin
      .from("spot_offer_request_table").select("id, taimee_job_id").eq("taimee_job_id", taimeeJobId).limit(2);
    if (requestError) throw requestError;
    if (!requests?.length) return NextResponse.json({ ok: false, error: "該当するタイミー案件が見つかりません" }, { status: 404 });
    if (requests.length !== 1) return NextResponse.json({ ok: false, error: "タイミー案件IDが複数の募集に一致します" }, { status: 409 });

    const { data: recorded, error: recordError } = await supabaseAdmin.rpc("record_spot_offer_application", {
      p_request_id: requests[0].id, p_provider: "taimee", p_application_key: applicationKey,
      p_event_id: eventId, p_state: "confirmed", p_occurred_at: new Date(occurredAt).toISOString(),
      p_name: applicantName || null, p_sex: null, p_url: null,
    });
    if (recordError) throw recordError;
    const eventResult = recorded as Record<string, unknown> | null;
    // 確定を記録した後に既存の同期判定を実行し、シェアフル停止を待たせない。
    const sync = await reconcileSpotProviders();
    if (!sync.enabled || sync.errors.some((item) => item.request_id === requests[0].id)) {
      return NextResponse.json({ ok: false, error: "シェアフル停止を同期キューへ登録できませんでした" }, { status: 503 });
    }
    return NextResponse.json({ ok: true, duplicate: Boolean(eventResult?.duplicate), sharefull_sync_enabled: sync.enabled, sharefull_sync_processed: sync.processed, sharefull_sync_errors: sync.errors.length });
  } catch (error) {
    console.error("[rpa/taimee/confirmed] failed", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ ok: false, error: "タイミー確定通知の処理に失敗しました" }, { status: 500 });
  }
}
