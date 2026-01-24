// src/app/api/wf-requests/[id]/approve/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import { getUserFromBearer } from "@/lib/auth/getUserFromBearer";
import { sendLWBotMessage } from "@/lib/lineworks/sendLWBotMessage";
import { getAccessToken } from "@/lib/getAccessToken";

export const dynamic = "force-dynamic";

function json(message: unknown, status = 200) {
  return NextResponse.json(message, { status });
}

async function readUser(req: NextRequest) {
  try {
    const { user } = await getUserFromBearer(req);
    return user ?? null;
  } catch {
    return null;
  }
}

async function getMyUserIdAndAdmin(authUid: string) {
  const { data: u, error: uErr } = await supabaseAdmin
    .from("users")
    .select("user_id")
    .eq("auth_user_id", authUid)
    .maybeSingle();

  if (uErr) throw uErr;
  if (!u?.user_id) return { myUserId: null as string | null, isAdmin: false };

  const { data: v, error: vErr } = await supabaseAdmin
    .from("user_entry_united_view_single")
    .select("user_id, level_sort")
    .eq("user_id", u.user_id)
    .maybeSingle();

  if (vErr) throw vErr;

  const levelSort = Number(v?.level_sort ?? 99999999);
  const isAdmin = levelSort < 4500000; // いったん admin=approver

  return { myUserId: u.user_id as string, isAdmin };
}

async function notifyApplicant(params: {
  applicant_user_id: string;
  text: string;
}) {
  const { applicant_user_id, text } = params;

  const { data: applicantView, error: aErr } = await supabaseAdmin
    .from("user_entry_united_view_single")
    .select("user_id, channel_id")
    .eq("user_id", applicant_user_id)
    .maybeSingle();

  if (aErr) throw aErr;

  const channelId = applicantView?.channel_id ?? null;
  if (!channelId) return;

  try {
    const accessToken = await getAccessToken();
    await sendLWBotMessage(channelId, text, accessToken);
  } catch (e) {
    console.error("[wf-approve] notify error", e);
  }
}

/**
 * POST /api/wf-requests/:id/approve
 * body: { action: "approve" | "reject", comment?: string }
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;

  const user = await readUser(req);
  if (!user) return json({ message: "Unauthorized" }, 401);

  const { myUserId, isAdmin } = await getMyUserIdAndAdmin(user.id);
  if (!myUserId) return json({ message: "User not found" }, 401);

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action ?? "").toLowerCase();
  const comment = typeof body?.comment === "string" ? body.comment.trim() : "";

  if (action !== "approve" && action !== "reject") {
    return json({ message: "action must be approve or reject" }, 400);
  }

  // request取得
  const { data: r, error: rErr } = await supabaseAdmin
    .from("wf_request")
    .select("id, applicant_user_id, status, title, request_type_id")
    .eq("id", id)
    .maybeSingle();

  if (rErr) return json({ message: rErr.message }, 500);
  if (!r) return json({ message: "Not found" }, 404);

  // 承認対象は submitted のみ（運用をシンプルに）
  if (r.status !== "submitted") {
    return json({ message: `Cannot approve from status=${r.status}` }, 400);
  }

  // 自分の pending step を特定（admin は最初の pending を処理できる扱い）
  let myStep: { id: string; step_no: number; approver_user_id: string } | null = null;

  if (isAdmin) {
    const { data: s0, error: s0Err } = await supabaseAdmin
      .from("wf_approval_step")
      .select("id, step_no, approver_user_id")
      .eq("request_id", id)
      .eq("status", "pending")
      .order("step_no", { ascending: true })
      .limit(1);

    if (s0Err) return json({ message: s0Err.message }, 500);
    myStep = (s0 ?? [])[0] ?? null;
  } else {
    const { data: s1, error: s1Err } = await supabaseAdmin
      .from("wf_approval_step")
      .select("id, step_no, approver_user_id")
      .eq("request_id", id)
      .eq("approver_user_id", myUserId)
      .eq("status", "pending")
      .maybeSingle();

    if (s1Err) return json({ message: s1Err.message }, 500);
    myStep = s1 ?? null;
  }

  if (!myStep) {
    return json({ message: "No pending step for you" }, 403);
  }

  // step 更新
  const nextStatus = action === "approve" ? "approved" : "rejected";

  const { error: updStepErr } = await supabaseAdmin
    .from("wf_approval_step")
    .update({
      status: nextStatus,
      action_comment: comment || null,
      acted_at: new Date().toISOString(),
    })
    .eq("id", myStep.id);

  if (updStepErr) return json({ message: updStepErr.message }, 500);

  if (action === "reject") {
    // request を rejected に
    const { data: updReq, error: updReqErr } = await supabaseAdmin
      .from("wf_request")
      .update({ status: "rejected" })
      .eq("id", id)
      .select("*")
      .single();

    if (updReqErr) return json({ message: updReqErr.message }, 500);

    const typeRow = await supabaseAdmin
      .from("wf_request_type")
      .select("label")
      .eq("id", r.request_type_id)
      .maybeSingle();

    const typeLabel = typeRow.data?.label ?? "申請";
    const title = (r.title ?? "").trim() || "(無題)";

    await notifyApplicant({
      applicant_user_id: r.applicant_user_id,
      text:
        `【精算・申請】差戻しされました\n` +
        `種別：${typeLabel}\n` +
        `件名：${title}\n` +
        (comment ? `理由：${comment}\n` : "") +
        `申請ID：${id}`,
    });

    return json({ data: { request: updReq, action: "rejected" } });
  }

  // approve の場合：まだ pending が残っているか確認
  const { data: remain, error: remErr } = await supabaseAdmin
    .from("wf_approval_step")
    .select("id, step_no, approver_user_id")
    .eq("request_id", id)
    .eq("status", "pending")
    .order("step_no", { ascending: true })
    .limit(1);

  if (remErr) return json({ message: remErr.message }, 500);

  const nextPending = (remain ?? [])[0] ?? null;

  if (nextPending) {
    // まだ次がいる → request は submitted のまま
    const typeRow = await supabaseAdmin
      .from("wf_request_type")
      .select("label")
      .eq("id", r.request_type_id)
      .maybeSingle();

    const typeLabel = typeRow.data?.label ?? "申請";
    const title = (r.title ?? "").trim() || "(無題)";

    await notifyApplicant({
      applicant_user_id: r.applicant_user_id,
      text:
        `【精算・申請】承認が進みました（次の承認者へ）\n` +
        `種別：${typeLabel}\n` +
        `件名：${title}\n` +
        `申請ID：${id}`,
    });

    return json({
      data: { action: "approved_step", next_pending: nextPending },
    });
  }

  // pending が無い → 最終承認
  const { data: finalReq, error: finErr } = await supabaseAdmin
    .from("wf_request")
    .update({ status: "approved", approved_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();

  if (finErr) return json({ message: finErr.message }, 500);

  const typeRow = await supabaseAdmin
    .from("wf_request_type")
    .select("label")
    .eq("id", r.request_type_id)
    .maybeSingle();

  const typeLabel = typeRow.data?.label ?? "申請";
  const title = (r.title ?? "").trim() || "(無題)";

  await notifyApplicant({
    applicant_user_id: r.applicant_user_id,
    text:
      `【精算・申請】承認されました\n` +
      `種別：${typeLabel}\n` +
      `件名：${title}\n` +
      `申請ID：${id}`,
  });

  return json({ data: { request: finalReq, action: "approved_final" } });
}
