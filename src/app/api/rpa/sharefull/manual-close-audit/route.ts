import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import { isRpaTaimeeError, requireTaimeeRpaOperatorUserId } from "@/lib/rpa/taimee";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHAREFULL_ID = /^[1-9]\d{0,31}$/;

/** 人がSharefull画面で募集終了を確定した監査記録を受け付ける。 */
export async function POST(request: NextRequest) {
  try {
    const operatorAuthUserId = await requireTaimeeRpaOperatorUserId(request);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "JSON形式が不正です" }, { status: 400 });
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "リクエスト形式が不正です" }, { status: 400 });
    }
    const record = body as Record<string, unknown>;
    const eventId = typeof record.event_id === "string" ? record.event_id : "";
    const orderId = typeof record.sharefull_order_id === "string" ? record.sharefull_order_id : "";
    const jobId = typeof record.sharefull_job_id === "string" ? record.sharefull_job_id : "";
    if (!UUID.test(eventId) || !SHAREFULL_ID.test(orderId) || !SHAREFULL_ID.test(jobId)
      || record.confirmation_source !== "sharefull_ui_confirmed") {
      return NextResponse.json({ error: "募集終了記録の内容が不正です" }, { status: 400 });
    }

    const { error: insertError } = await supabaseAdmin
      .from("sharefull_manual_close_audit" as never)
      .insert({
        event_id: eventId,
        sharefull_order_id: orderId,
        sharefull_job_id: jobId,
        operator_auth_user_id: operatorAuthUserId,
        confirmation_source: "sharefull_ui_confirmed",
      } as never);
    if (!insertError) return NextResponse.json({ ok: true, duplicate: false });
    if (insertError.code === "23505") {
      const { data, error: lookupError } = await supabaseAdmin
        .from("sharefull_manual_close_audit" as never)
        .select("sharefull_job_id")
        .eq("sharefull_order_id", orderId)
        .maybeSingle();
      if (lookupError) throw lookupError;
      const existing = data as unknown as { sharefull_job_id?: string } | null;
      if (existing?.sharefull_job_id === jobId) return NextResponse.json({ ok: true, duplicate: true });
      return NextResponse.json({ error: "同じ管理番号に異なる求人IDの記録があります" }, { status: 409 });
    }
    throw insertError;
  } catch (error) {
    if (isRpaTaimeeError(error)) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("[rpa/sharefull/manual-close-audit] failed", error);
    return NextResponse.json({ error: "Sharefull募集終了記録を保存できませんでした" }, { status: 500 });
  }
}
