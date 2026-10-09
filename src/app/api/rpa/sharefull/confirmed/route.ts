import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createCloseRequest } from "@/lib/spot_offer/spot_offer_sync_check";
import { supabaseAdmin } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

const TEXT_LIMIT = 160;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;

function text(value: unknown, limit = TEXT_LIMIT): string {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function authorized(request: NextRequest): boolean {
  const expected = process.env.SHAREFULL_CONFIRMATION_GAS_TOKEN?.trim() ?? "";
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
    const jobId = text(body.sharefull_job_id);
    const orderId = text(body.sharefull_order_id);
    const eventId = text(body.event_id);
    const applicationKey = text(body.application_key);
    const occurredAt = text(body.occurred_at, 80);
    const applicantName = text(body.applicant_name);

    if ((!jobId && !orderId) || (jobId && !ID_PATTERN.test(jobId)) || (orderId && !ID_PATTERN.test(orderId))) {
      return NextResponse.json({ ok: false, error: "有効なSharefull求人IDまたは管理番号が必要です" }, { status: 400 });
    }
    if (!eventId || !applicationKey || !occurredAt || !Number.isFinite(Date.parse(occurredAt))) {
      return NextResponse.json({ ok: false, error: "確定メールの識別情報が不正です" }, { status: 400 });
    }

    let query = supabaseAdmin.from("spot_offer_request_table").select("*").limit(2);
    query = jobId ? query.eq("sharefull_job_id", jobId) : query.eq("sharefull_order_id", orderId);
    const { data: requests, error: requestError } = await query;
    if (requestError) throw requestError;
    if (!requests?.length) return NextResponse.json({ ok: false, error: "該当するSharefull掲載案件が見つかりません" }, { status: 404 });
    if (requests.length !== 1) return NextResponse.json({ ok: false, error: "Sharefull掲載案件を一意に特定できません" }, { status: 409 });

    const target = requests[0] as Record<string, unknown>;
    if ((jobId && target.sharefull_job_id !== jobId) || (orderId && target.sharefull_order_id !== orderId)) {
      return NextResponse.json({ ok: false, error: "メール内の求人IDと管理番号が一致しません" }, { status: 409 });
    }

    const { data: recorded, error: recordError } = await supabaseAdmin.rpc("record_spot_offer_application", {
      p_request_id: target.id as string,
      p_provider: "sharefull",
      p_application_key: applicationKey,
      p_event_id: eventId,
      p_state: "confirmed",
      p_occurred_at: new Date(occurredAt).toISOString(),
      p_name: applicantName || null,
      p_sex: null,
      p_url: null,
    });
    if (recordError) throw recordError;

    const eventResult = recorded as Record<string, unknown> | null;
    if (eventResult?.stale) {
      return NextResponse.json({ ok: true, stale: true });
    }

    // Gmailから確定通知を受けた時点でPAD向けclose_jobを登録する。
    // 同じ同期キーはcreateCloseRequest側で重複登録されない。
    const closeOperationKey = ["spot-sync", "taimee", "close", String(target.taimee_job_id), "sharefull-confirmed", eventId].join(":");
    await createCloseRequest(target, "other_application", {
      syncOperationKey: closeOperationKey,
      createdFrom: "/api/rpa/sharefull/confirmed",
    });

    return NextResponse.json({ ok: true, duplicate: Boolean(eventResult?.duplicate) });
  } catch (error) {
    console.error("[rpa/sharefull/confirmed] failed", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ ok: false, error: "Sharefull確定メールの処理に失敗しました" }, { status: 500 });
  }
}
