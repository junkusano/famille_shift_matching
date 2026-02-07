//api/assessment/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import { getUserFromBearer } from "@/lib/auth/getUserFromBearer";
import type { AssessmentServiceKind } from "@/types/assessment";

export const dynamic = "force-dynamic";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

async function getMyUser(req: NextRequest) {
  const { user } = await getUserFromBearer(req);
  if (!user) throw new Error("Unauthorized");
  return user; // ここは auth user（例: user.id が auth_user_id）
}

async function getMyProfileByAuthId(authUserId: string) {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("user_id, name, full_name")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (error) throw error;

  const author_user_id = data?.user_id ?? authUserId; // fallback
  const author_name = (data?.name ?? data?.full_name ?? "").trim() || author_user_id;

  return { author_user_id, author_name };
}

export async function GET(req: NextRequest) {
  try {
    await getMyUser(req); // 認証チェックだけ

    const { searchParams } = new URL(req.url);
    const client_id = (searchParams.get("client_id") ?? "").trim();
    const service_kind = (searchParams.get("service_kind") ?? "").trim() as AssessmentServiceKind;

    if (!client_id) return json({ ok: true, data: [] });

    const q = supabaseAdmin
      .from("assessments_records")
      .select("*")
      .eq("client_id", client_id)
      .eq("is_deleted", false)
      .order("assessed_on", { ascending: false })
      .order("created_at", { ascending: false });

    if (service_kind) q.eq("service_kind", service_kind);

    const { data, error } = await q;
    if (error) throw error;

    return json({ ok: true, data: data ?? [] });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ ok: false, error: msg }, msg === "Unauthorized" ? 401 : 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const authUser = await getMyUser(req);
    const { author_user_id, author_name } = await getMyProfileByAuthId(authUser.id);

    const body = await req.json();
    const client_id = String(body.client_id ?? "").trim();
    const service_kind = String(body.service_kind ?? "").trim() as AssessmentServiceKind;
    const content = body.content ?? {};

    if (!client_id) return json({ ok: false, error: "client_id is required" }, 400);
    if (!service_kind) return json({ ok: false, error: "service_kind is required" }, 400);

    const { data, error } = await supabaseAdmin
      .from("assessments_records")
      .insert([
        {
          client_id,
          service_kind,
          assessed_on: body.assessed_on ?? new Date().toISOString().slice(0, 10),
          author_user_id,
          author_name,
          content,
          is_deleted: false,
        },
      ])
      .select("*")
      .single();

    if (error) throw error;

    return json({ ok: true, data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ ok: false, error: msg }, msg === "Unauthorized" ? 401 : 500);
  }
}
