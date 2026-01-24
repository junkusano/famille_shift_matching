// src/app/api/wf-requests/[id]/submit/route.ts
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

function uniqNonEmpty(arr: unknown[]): string[] {
    const set = new Set<string>();
    for (const x of arr) {
        const s = String(x ?? "").trim();
        if (s) set.add(s);
    }
    return Array.from(set);
}

/**
 * POST /api/wf-requests/:id/submit
 * body: { approver_user_ids: string[] }
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
    const approver_user_ids = uniqNonEmpty(Array.isArray(body?.approver_user_ids) ? body.approver_user_ids : []);

    if (approver_user_ids.length === 0) {
        return json({ message: "approver_user_ids is required" }, 400);
    }

    // 承認者候補チェック（level_sort < 4500000）
    const { data: approvers, error: apErr } = await supabaseAdmin
        .from("user_entry_united_view_single")
        .select("user_id, level_sort")
        .in("user_id", approver_user_ids);

    if (apErr) return json({ message: apErr.message }, 500);

    const bad = (approvers ?? []).filter(a => Number(a.level_sort ?? 99999999) >= 4500000);
    if (bad.length > 0) {
        return json({ message: "Invalid approver_user_ids (level_sort too high)", bad }, 400);
    }

    // 申請を取得
    const { data: r, error: rErr } = await supabaseAdmin
        .from("wf_request")
        .select("id, applicant_user_id, status, title, request_type_id")
        .eq("id", id)
        .maybeSingle();

    if (rErr) return json({ message: rErr.message }, 500);
    if (!r) return json({ message: "Not found" }, 404);

    // 提出権限：申請者本人 or admin
    if (!isAdmin && r.applicant_user_id !== myUserId) {
        return json({ message: "Forbidden" }, 403);
    }

    // 状態チェック（draft/rejected から提出可能にしておくと運用が楽）
    if (!["draft", "rejected"].includes(r.status)) {
        return json({ message: `Cannot submit from status=${r.status}` }, 400);
    }

    // 申請タイプ名も取得（通知用）
    const { data: rt, error: rtErr } = await supabaseAdmin
        .from("wf_request_type")
        .select("code, label")
        .eq("id", r.request_type_id)
        .maybeSingle();

    if (rtErr) return json({ message: rtErr.message }, 500);

    // 既存 step があれば削除（再提出時のため）
    const { error: delErr } = await supabaseAdmin
        .from("wf_approval_step")
        .delete()
        .eq("request_id", id);

    if (delErr) return json({ message: delErr.message }, 500);

    // step 作成（step_no は 1..n）
    const stepRows = approver_user_ids.map((approverUserId, i) => ({
        request_id: id,
        step_no: i + 1,
        approver_user_id: approverUserId,
        status: "pending",
    }));

    const { error: insStepErr } = await supabaseAdmin
        .from("wf_approval_step")
        .insert(stepRows);

    if (insStepErr) return json({ message: insStepErr.message }, 500);

    // request を submitted に更新
    const { data: upd, error: updErr } = await supabaseAdmin
        .from("wf_request")
        .update({ status: "submitted", submitted_at: new Date().toISOString() })
        .eq("id", id)
        .select("*")
        .single();

    if (updErr) return json({ message: updErr.message }, 500);

    // 申請者の人事労務サポートルーム(channel_id)を取得して通知
    const { data: applicantView, error: aErr } = await supabaseAdmin
        .from("user_entry_united_view_single")
        .select("user_id, channel_id, last_name_kanji, first_name_kanji")
        .eq("user_id", r.applicant_user_id)
        .maybeSingle();

    if (aErr) return json({ message: aErr.message }, 500);

    const channelId = applicantView?.channel_id ?? null;

    if (channelId) {
        const applicantName =
            (applicantView?.last_name_kanji ?? "") + " " + (applicantView?.first_name_kanji ?? "");

        const typeLabel = rt?.label ?? "申請";
        const title = (r.title ?? "").trim() || "(無題)";

        const text =
            `【精算・申請】提出しました\n` +
            `種別：${typeLabel}\n` +
            `件名：${title}\n` +
            `申請者：${applicantName.trim() || r.applicant_user_id}\n` +
            `申請ID：${id}`;

        try {
            const accessToken = await getAccessToken(); // ★ここが本命
            await sendLWBotMessage(channelId, text, accessToken);
        } catch (e) {
            console.error("[wf-submit] sendLWBotMessage error", e);
        }
    } else {
        console.warn("[wf-submit] applicant channel_id not found");
    }

    return json({ data: { request: upd, steps: stepRows } });
}
