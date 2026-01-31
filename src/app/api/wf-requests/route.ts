// src/app/api/wf-requests/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import { getUserFromBearer } from "@/lib/auth/getUserFromBearer";

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

/**
 * GET /api/wf-requests
 * 申請一覧
 * - 申請者：自分の申請
 * - 承認者：自分が step に入ってる申請
 * - admin：全件
 */
export async function GET(req: NextRequest) {
  const user = await readUser(req);
  if (!user) return json({ message: "Unauthorized" }, 401);

  const { myUserId, isAdmin } = await getMyUserIdAndAdmin(user.id);
  if (!myUserId) return json({ message: "User not found" }, 401);

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status"); // 任意
  const typeCode = searchParams.get("type"); // 任意

  // まず「見える request_id」を作る（admin以外）
  let visibleRequestIds: string[] | null = null;

  if (!isAdmin) {
    const { data: myReqs, error: myReqErr } = await supabaseAdmin
      .from("wf_request")
      .select("id")
      .eq("applicant_user_id", myUserId);

    if (myReqErr) return json({ message: myReqErr.message }, 500);

    const { data: stepReqs, error: stepErr } = await supabaseAdmin
      .from("wf_approval_step")
      .select("request_id")
      .eq("approver_user_id", myUserId);

    if (stepErr) return json({ message: stepErr.message }, 500);

    const ids = new Set<string>();
    (myReqs ?? []).forEach((r) => ids.add(r.id));
    (stepReqs ?? []).forEach((s) => ids.add(s.request_id));

    visibleRequestIds = Array.from(ids);
    if (visibleRequestIds.length === 0) return json({ data: [] });
  }

  // 一覧本体
  let q = supabaseAdmin
    .from("wf_request")
    .select(
      `
      id,
      status,
      title,
      created_at,
      updated_at,
      submitted_at,
      applicant_user_id,
      request_type:wf_request_type ( id, code, label )
    `
    )
    .order("created_at", { ascending: false });

  if (!isAdmin && visibleRequestIds) {
    q = q.in("id", visibleRequestIds);
  }

  if (status) q = q.eq("status", status);
  if (typeCode) q = q.eq("wf_request_type.code", typeCode);

  const { data, error } = await q;

  if (error) return json({ message: error.message }, 500);
  return json({ data: data ?? [] });
}

/**
 * POST /api/wf-requests
 * 下書き作成（status=draft）
 */
export async function POST(req: NextRequest) {
  const user = await readUser(req);
  if (!user) return json({ message: "Unauthorized" }, 401);

  const { myUserId } = await getMyUserIdAndAdmin(user.id);
  if (!myUserId) return json({ message: "User not found" }, 401);

  const body = await req.json().catch(() => ({}));
  const request_type_code = String(body?.request_type_code ?? "").trim();
  const title = typeof body?.title === "string" ? body.title : "";
  const body_text = typeof body?.body_text === "string" ? body.body_text : "";
  const payload =
    body?.payload && typeof body.payload === "object" && !Array.isArray(body.payload)
      ? (body.payload as Record<string, unknown>)
      : {};

  if (!request_type_code) {
    return json({ message: "request_type_code is required" }, 400);
  }

  // type id を code から取得
  const { data: typeRow, error: typeErr } = await supabaseAdmin
    .from("wf_request_type")
    .select("id")
    .eq("code", request_type_code)
    .eq("is_active", true)
    .maybeSingle();

  if (typeErr) return json({ message: typeErr.message }, 500);
  if (!typeRow?.id) return json({ message: "Invalid request_type_code" }, 400);

  // ★重要：applicant_user_id を必ず入れる（RLS用の列でもある）
  const { data, error } = await supabaseAdmin
    .from("wf_request")
    .insert({
      request_type_id: typeRow.id,
      applicant_user_id: myUserId,
      title,
      body: body_text,
      payload,
      status: "draft",
    })
    .select(
      `
      *,
      request_type:wf_request_type ( id, code, label, is_general )
    `
    )
    .single();

  if (error) return json({ message: error.message }, 500);

  return json({ data });
}
