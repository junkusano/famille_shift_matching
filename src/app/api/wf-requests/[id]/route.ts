// src/app/api/wf-requests/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import { getUserFromBearer } from "@/lib/auth/getUserFromBearer";

export const dynamic = "force-dynamic";

function json(message: unknown, status = 200) {
  return NextResponse.json(message, { status });
}

async function getMyUserIdAndAdmin(authUid: string) {
  const { data: u, error: uErr } = await supabaseAdmin
    .from("users")
    .select("user_id, auth_user_id")
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

async function canViewRequest(params: {
  requestId: string;
  myUserId: string;
  isAdmin: boolean;
}) {
  const { requestId, myUserId, isAdmin } = params;
  if (isAdmin) return true;

  const { data: r, error: rErr } = await supabaseAdmin
    .from("wf_request")
    .select("id, applicant_user_id")
    .eq("id", requestId)
    .maybeSingle();

  if (rErr) throw rErr;
  if (!r) return false;
  if (r.applicant_user_id === myUserId) return true;

  const { data: s, error: sErr } = await supabaseAdmin
    .from("wf_approval_step")
    .select("id")
    .eq("request_id", requestId)
    .eq("approver_user_id", myUserId)
    .limit(1);

  if (sErr) throw sErr;
  return (s ?? []).length > 0;
}

async function canEditRequest(params: {
  requestId: string;
  myUserId: string;
  isAdmin: boolean;
}) {
  const { requestId, myUserId, isAdmin } = params;
  if (isAdmin) return true;

  const { data: r, error: rErr } = await supabaseAdmin
    .from("wf_request")
    .select("id, applicant_user_id, status")
    .eq("id", requestId)
    .maybeSingle();

  if (rErr) throw rErr;
  if (!r) return false;

  return r.applicant_user_id === myUserId && r.status !== "completed";
}

async function readUser(req: NextRequest) {
  try {
    const { user } = await getUserFromBearer(req);
    return user ?? null;
  } catch {
    return null;
  }
}

/**
 * GET /api/wf-requests/:id
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;

  const user = await readUser(req);
  if (!user) return json({ message: "Unauthorized" }, 401);

  const { myUserId, isAdmin } = await getMyUserIdAndAdmin(user.id);
  if (!myUserId) return json({ message: "User not found" }, 401);

  const ok = await canViewRequest({ requestId: id, myUserId, isAdmin });
  if (!ok) return json({ message: "Forbidden" }, 403);

  const { data: requestRow, error: reqErr } = await supabaseAdmin
    .from("wf_request")
    .select(
      `
      *,
      request_type:wf_request_type(id, code, label, is_general)
    `
    )
    .eq("id", id)
    .single();

  if (reqErr) return json({ message: reqErr.message }, 500);

  const { data: steps, error: stepErr } = await supabaseAdmin
    .from("wf_approval_step")
    .select("*")
    .eq("request_id", id)
    .order("step_no", { ascending: true });

  if (stepErr) return json({ message: stepErr.message }, 500);

  const { data: attachments, error: attErr } = await supabaseAdmin
    .from("wf_request_attachment")
    .select("*")
    .eq("request_id", id)
    .order("created_at", { ascending: false });

  if (attErr) return json({ message: attErr.message }, 500);

  return json({
    data: {
      request: requestRow,
      steps: steps ?? [],
      attachments: attachments ?? [],
      perms: {
        isAdmin,
        canEdit: await canEditRequest({ requestId: id, myUserId, isAdmin }),
      },
    },
  });
}

/**
 * PATCH /api/wf-requests/:id
 */
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;

  const user = await readUser(req);
  if (!user) return json({ message: "Unauthorized" }, 401);

  const { myUserId, isAdmin } = await getMyUserIdAndAdmin(user.id);
  if (!myUserId) return json({ message: "User not found" }, 401);

  const ok = await canEditRequest({ requestId: id, myUserId, isAdmin });
  if (!ok) return json({ message: "Forbidden" }, 403);

  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};

  if (typeof body.title === "string") patch.title = body.title;
  if (typeof body.body === "string" || body.body === null) patch.body = body.body;

  if (body.payload && typeof body.payload === "object" && !Array.isArray(body.payload)) {
    patch.payload = body.payload;
  }

  if (Object.keys(patch).length === 0) {
    return json({ message: "No fields to update" }, 400);
  }

  const { data, error: updErr } = await supabaseAdmin
    .from("wf_request")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (updErr) return json({ message: updErr.message }, 500);

  return json({ data });
}
