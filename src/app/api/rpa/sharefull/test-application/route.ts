import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TEXT_LIMIT = 500;

function text(value: unknown, limit = TEXT_LIMIT): string {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function tokenMatches(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.SHAREFULL_TEST_GAS_TOKEN?.trim();
  if (!expected) return false;
  const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
  const headerToken = request.headers.get("x-sharefull-test-token")?.trim() ?? "";
  return tokenMatches(bearer || headerToken, expected);
}

export async function POST(request: NextRequest) {
  // This endpoint must never become a production application-ingest path.
  if (process.env.SHAREFULL_RPA_MODE?.trim().toLowerCase() !== "test") {
    return NextResponse.json({ ok: false, error: "Test endpoint is disabled" }, { status: 404 });
  }
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json() as Record<string, unknown>;
    const requestId = text(body.request_id, 80);
    const sharefullJobId = text(body.sharefull_job_id, 80);
    const sharefullOrderId = text(body.sharefull_order_id, 160);
    const provider = text(body.provider, 40);
    const applicationKey = text(body.application_key, 160);
    const eventId = text(body.event_id, 160);
    const state = text(body.state, 20);
    const occurredAt = text(body.occurred_at, 80);
    const applicantName = text(body.applicant_name, 160);
    const applicantSex = text(body.applicant_sex, 40);
    const applicantControlUrl = text(body.applicant_control_url, 500);

    if ((requestId && !UUID.test(requestId)) || (!requestId && !sharefullJobId && !sharefullOrderId)) {
      return NextResponse.json({ ok: false, error: "request_idまたはSharefull求人ID・管理番号が必要です" }, { status: 400 });
    }
    if (provider !== "sharefull" || !applicationKey || !eventId || !occurredAt || !["applied", "confirmed", "cancelled"].includes(state)) {
      return NextResponse.json({ ok: false, error: "応募イベントの項目が不正です" }, { status: 400 });
    }
    if (!Number.isFinite(Date.parse(occurredAt))) {
      return NextResponse.json({ ok: false, error: "occurred_atが不正です" }, { status: 400 });
    }

    let query = supabaseAdmin
      .from("sharefull_rpa_test_spot_offer_request_table" as never)
      .select("id,sharefull_job_id,sharefull_order_id,shift_start_date,shift_start_time,template_title")
      .limit(2);
    if (requestId) query = query.eq("id", requestId);
    else if (sharefullJobId) query = query.eq("sharefull_job_id", sharefullJobId);
    else query = query.eq("sharefull_order_id", sharefullOrderId);
    const { data: requests, error: requestError } = await query;
    if (requestError) throw requestError;
    if (!requests?.length) return NextResponse.json({ ok: false, error: "テスト案件が見つかりません" }, { status: 404 });
    if (requests.length > 1) return NextResponse.json({ ok: false, error: "Sharefull管理番号が一意ではありません" }, { status: 409 });

    const target = requests[0] as Record<string, unknown>;
    const { data, error } = await supabaseAdmin.rpc("record_sharefull_rpa_test_application", {
      p_request_id: target.id,
      p_provider: provider,
      p_application_key: applicationKey,
      p_event_id: eventId,
      p_state: state,
      p_occurred_at: new Date(occurredAt).toISOString(),
      p_name: applicantName || null,
      p_sex: applicantSex || null,
      p_url: applicantControlUrl || null,
    });
    if (error) throw error;

    return NextResponse.json({
      ok: true,
      duplicate: Boolean((data as Record<string, unknown> | null)?.duplicate),
      result: data,
      request: {
        request_id: target.id,
        sharefull_job_id: target.sharefull_job_id,
        sharefull_order_id: target.sharefull_order_id,
        shift_start_date: target.shift_start_date,
        shift_start_time: target.shift_start_time,
        template_title: target.template_title,
      },
    });
  } catch (error) {
    console.error("[rpa/sharefull/test-application] failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: "テスト応募イベントの登録に失敗しました" }, { status: 500 });
  }
}
