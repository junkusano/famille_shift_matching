import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import {
  getHealthCheckDate,
  getHealthCheckFiscalYear,
  getHealthCheckType,
  HEALTH_CHECK_SUBMITTED_STATUSES,
} from "@/lib/healthCheck";

type RequestRow = {
  id: string; applicant_user_id: string; status: string; submitted_at: string | null; created_at: string;
  payload: Record<string, unknown> | null; health_check_occupational_physician_checked: boolean | null;
  health_check_occupational_physician_checked_at: string | null; health_check_occupational_physician_checked_by: string | null;
  health_check_doctor_comment: string | null;
  health_check_occupational_physician_required: boolean | null;
  health_check_rejection_reason?: string | null; health_check_rejected_at?: string | null; health_check_rejected_by?: string | null;
  health_check_admin_checked: boolean | null; health_check_admin_checked_at: string | null; health_check_admin_checked_by: string | null;
};

async function requireHealthCheckManager(req: NextRequest) {
  const token = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new Error("UNAUTHORIZED");
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) throw new Error("UNAUTHORIZED");
  const { data: me, error: meError } = await supabaseAdmin.from("users").select("user_id,system_role").eq("auth_user_id", data.user.id).maybeSingle();
  if (meError || !me || !["admin", "manager"].includes((me.system_role ?? "").toLowerCase()) || me.user_id === "servicesuport") throw new Error("FORBIDDEN");
  return me;
}

function failure(error: unknown) {
  const message = error instanceof Error ? error.message : "処理に失敗しました。";
  return NextResponse.json({ ok: false, error: message }, { status: message === "UNAUTHORIZED" ? 401 : message === "FORBIDDEN" ? 403 : 500 });
}

export async function GET(req: NextRequest) {
  try {
    await requireHealthCheckManager(req);
    const fiscalYear = Number(req.nextUrl.searchParams.get("fiscal_year"));
    if (!Number.isInteger(fiscalYear) || fiscalYear < 2000 || fiscalYear > 2100) return NextResponse.json({ ok: false, error: "年度が不正です。" }, { status: 400 });
    const [{ data: staff, error: staffError }, { data: type, error: typeError }] = await Promise.all([
      supabaseAdmin.from("user_entry_united_view_single").select("user_id,entry_id,last_name_kanji,first_name_kanji,orgunitname,system_role,status").neq("status", "removed_from_lineworks_kaipoke").not("user_id", "is", null),
      supabaseAdmin.from("wf_request_type").select("id").eq("code", "health_check").maybeSingle(),
    ]);
    if (staffError || typeError) throw staffError ?? typeError;
    const { data: requests, error: requestError } = type?.id
      ? await supabaseAdmin.from("wf_request").select("id,applicant_user_id,status,submitted_at,created_at,payload").eq("request_type_id", type.id).in("status", [...HEALTH_CHECK_SUBMITTED_STATUSES, "rejected"])
      : { data: [], error: null };
    if (requestError) throw requestError;
    // Keep the list usable until the accompanying schema migration has been applied.
    // Review controls remain unavailable rather than failing the whole sensitive-data page.
    let reviewMetadataAvailable = true;
    const reviewMetadataByRequestId = new Map<string, Partial<RequestRow>>();
    if ((requests?.length ?? 0) > 0) {
      const { data: reviewRows, error: reviewError } = await supabaseAdmin
        .from("wf_request")
        .select("id,health_check_doctor_comment,health_check_occupational_physician_checked,health_check_occupational_physician_checked_at,health_check_occupational_physician_checked_by,health_check_admin_checked,health_check_admin_checked_at,health_check_admin_checked_by")
        .in("id", (requests ?? []).map((row) => row.id));
      if (reviewError) {
        if (reviewError.code === "42703") reviewMetadataAvailable = false;
        else throw reviewError;
      }
      for (const reviewRow of reviewRows ?? []) reviewMetadataByRequestId.set(reviewRow.id, reviewRow as Partial<RequestRow>);
    }
    const { data: attachments, error: attachmentError } = (requests?.length ?? 0) > 0
      ? await supabaseAdmin.from("wf_request_attachment").select("id,request_id,file_name,file_path,mime_type,file_size,kind,created_at").in("request_id", (requests ?? []).map((row) => row.id)).eq("kind", "health_result")
      : { data: [], error: null };
    if (attachmentError) throw attachmentError;
    const attachmentsByRequest = new Map<string, typeof attachments>();
    for (const attachment of attachments ?? []) attachmentsByRequest.set(attachment.request_id, [...(attachmentsByRequest.get(attachment.request_id) ?? []), attachment]);
    const latestByUser = new Map<string, RequestRow>();
    for (const request of (requests ?? []) as RequestRow[]) {
      const date = getHealthCheckDate(request.payload);
      if (!date || getHealthCheckFiscalYear(date) !== fiscalYear) continue;
      const current = latestByUser.get(request.applicant_user_id);
      if (!current || (request.submitted_at ?? request.created_at) > (current.submitted_at ?? current.created_at)) latestByUser.set(request.applicant_user_id, request);
    }
    const rows = (staff ?? []).map((person) => {
      const request = latestByUser.get(person.user_id);
      const review = request ? reviewMetadataByRequestId.get(request.id) : undefined;
      const payload = (request?.payload ?? {}) as Record<string, unknown>;
      const payloadRejectionReason = typeof payload.health_check_rejection_reason === "string" ? payload.health_check_rejection_reason : null;
      return {
        user_id: person.user_id, entry_id: person.entry_id, staff_name: `${person.last_name_kanji ?? ""}${person.first_name_kanji ?? ""}`.trim() || person.user_id,
        orgunitname: person.orgunitname, role: person.system_role, status: person.status,
        submitted: request ? Boolean(attachmentsByRequest.get(request.id)?.length) && request.status !== "rejected" : false,
        request: request ? { ...request, ...review, health_check_occupational_physician_checked: typeof review?.health_check_occupational_physician_checked === "boolean" ? review.health_check_occupational_physician_checked : payload.health_check_occupational_physician_checked === true, health_check_admin_checked: typeof review?.health_check_admin_checked === "boolean" ? review.health_check_admin_checked : payload.health_check_admin_checked === true, health_check_occupational_physician_required: typeof review?.health_check_occupational_physician_required === "boolean" ? review.health_check_occupational_physician_required : payload.health_check_occupational_physician_required === true, health_check_rejection_reason: review?.health_check_rejection_reason ?? payloadRejectionReason, health_check_rejected_at: review?.health_check_rejected_at ?? (typeof payload.health_check_rejected_at === "string" ? payload.health_check_rejected_at : null), health_check_rejected_by: review?.health_check_rejected_by ?? (typeof payload.health_check_rejected_by === "string" ? payload.health_check_rejected_by : null), health_check_date: getHealthCheckDate(request.payload), health_check_type: getHealthCheckType(request.payload), attachments: attachmentsByRequest.get(request.id) ?? [] } : null,
      };
    }).sort((a, b) => a.staff_name.localeCompare(b.staff_name, "ja"));
    return NextResponse.json({ ok: true, rows, review_metadata_available: reviewMetadataAvailable });
  } catch (error) { return failure(error); }
}

export async function PATCH(req: NextRequest) {
  try {
    const actor = await requireHealthCheckManager(req);
    const body = await req.json() as { request_id?: string; field?: "occupational_physician" | "admin" | "doctor_comment" | "occupational_physician_required" | "reject"; checked?: boolean; required?: boolean; doctor_comment?: string | null; rejection_reason?: string };
    if (body.field === "occupational_physician_required") {
      if (!body.request_id || typeof body.required !== "boolean") return NextResponse.json({ ok: false, error: "産業医意見聴取の設定が不正です。" }, { status: 400 });
      const now = new Date().toISOString();
      const update = body.required
        ? { health_check_occupational_physician_required: true, health_check_occupational_physician_checked: false, health_check_occupational_physician_checked_at: null, health_check_occupational_physician_checked_by: null, updated_at: now }
        : { health_check_occupational_physician_required: false, health_check_occupational_physician_checked: true, health_check_occupational_physician_checked_at: now, health_check_occupational_physician_checked_by: actor.user_id, updated_at: now };
      const { data: current, error: currentError } = await supabaseAdmin.from("wf_request").select("payload").eq("id", body.request_id).maybeSingle();
      if (currentError || !current) throw currentError ?? new Error("健診申請が見つかりません。");
      const currentPayload = current.payload && typeof current.payload === "object" && !Array.isArray(current.payload) ? current.payload as Record<string, unknown> : {};
      const { error } = await supabaseAdmin.from("wf_request").update({ ...update, payload: { ...currentPayload, health_check_occupational_physician_required: body.required } }).eq("id", body.request_id);
      if (error?.code === "42703") {
        const fallbackUpdate = body.required
          ? { health_check_occupational_physician_checked: false, health_check_occupational_physician_checked_at: null, health_check_occupational_physician_checked_by: null, payload: { ...currentPayload, health_check_occupational_physician_required: true }, updated_at: now }
          : { health_check_occupational_physician_checked: true, health_check_occupational_physician_checked_at: now, health_check_occupational_physician_checked_by: actor.user_id, payload: { ...currentPayload, health_check_occupational_physician_required: false }, updated_at: now };
        const { error: fallbackError } = await supabaseAdmin.from("wf_request").update(fallbackUpdate).eq("id", body.request_id);
        if (fallbackError) throw fallbackError;
      } else if (error) throw error;
      return NextResponse.json({ ok: true, required: body.required, checked: !body.required, checked_at: body.required ? null : now, checked_by: body.required ? null : actor.user_id });
    }
    if (body.field === "reject") {
      if (!body.request_id || typeof body.rejection_reason !== "string" || body.rejection_reason.trim().length > 10000) return NextResponse.json({ ok: false, error: "差し戻し理由が不正です。" }, { status: 400 });
      const now = new Date().toISOString();
      const reason = body.rejection_reason.trim() || "健診結果の内容を確認してください。";
      const { data: current, error: currentError } = await supabaseAdmin.from("wf_request").select("payload").eq("id", body.request_id).maybeSingle();
      if (currentError || !current) throw currentError ?? new Error("健診申請が見つかりません。");
      const currentPayload = current.payload && typeof current.payload === "object" && !Array.isArray(current.payload) ? current.payload as Record<string, unknown> : {};
      const { error } = await supabaseAdmin.from("wf_request").update({ status: "rejected", payload: { ...currentPayload, health_check_rejection_reason: reason, health_check_rejected_at: now, health_check_rejected_by: actor.user_id }, updated_at: now }).eq("id", body.request_id);
      if (error) throw error;
      return NextResponse.json({ ok: true, status: "rejected", rejection_reason: reason, rejected_at: now, rejected_by: actor.user_id });
    }
    if (body.field === "doctor_comment") {
      if (!body.request_id || typeof body.doctor_comment !== "string" || body.doctor_comment.length > 10000) return NextResponse.json({ ok: false, error: "医師の意見が不正です。" }, { status: 400 });
      const comment = body.doctor_comment.trim() || null;
      const now = new Date().toISOString();
      const { data: current } = await supabaseAdmin.from("wf_request").select("health_check_occupational_physician_required").eq("id", body.request_id).maybeSingle();
      const { error } = await supabaseAdmin.from("wf_request").update({ health_check_doctor_comment: comment, ...(current?.health_check_occupational_physician_required !== true || comment ? { health_check_occupational_physician_checked: true, health_check_occupational_physician_checked_at: now, health_check_occupational_physician_checked_by: actor.user_id } : {}), updated_at: now }).eq("id", body.request_id);
      if (error) throw error;
      return NextResponse.json({ ok: true, doctor_comment: comment });
    }
    if (!body.request_id || !body.field || typeof body.checked !== "boolean") return NextResponse.json({ ok: false, error: "不正なリクエストです。" }, { status: 400 });
    const prefix = body.field === "occupational_physician" ? "health_check_occupational_physician" : "health_check_admin";
    const now = new Date().toISOString();
    const update = body.checked
      ? { [`${prefix}_checked`]: true, [`${prefix}_checked_at`]: now, [`${prefix}_checked_by`]: actor.user_id, updated_at: now }
      : { [`${prefix}_checked`]: false, [`${prefix}_checked_at`]: null, [`${prefix}_checked_by`]: null, updated_at: now };
    const { error } = await supabaseAdmin.from("wf_request").update(update).eq("id", body.request_id);
    if (error) {
      if (error.code !== "42703") throw error;
      const { data: current, error: currentError } = await supabaseAdmin.from("wf_request").select("payload").eq("id", body.request_id).maybeSingle();
      if (currentError || !current) throw currentError ?? new Error("健診申請が見つかりません。");
      const currentPayload = current.payload && typeof current.payload === "object" && !Array.isArray(current.payload) ? current.payload as Record<string, unknown> : {};
      const fallbackUpdate = { payload: { ...currentPayload, [`health_check_${body.field}_checked`]: body.checked, [`health_check_${body.field}_checked_at`]: body.checked ? now : null, [`health_check_${body.field}_checked_by`]: body.checked ? actor.user_id : null }, updated_at: now };
      const { error: fallbackError } = await supabaseAdmin.from("wf_request").update(fallbackUpdate).eq("id", body.request_id);
      if (fallbackError) throw fallbackError;
    }
    return NextResponse.json({ ok: true, checked: body.checked, checked_at: body.checked ? now : null, checked_by: body.checked ? actor.user_id : null });
  } catch (error) { return failure(error); }
}
