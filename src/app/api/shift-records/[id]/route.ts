// src/app/api/shift-records/[id]/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;                 // ← ★ ここが Next.js 15 の新仕様
  const body = await req.json();

  const patch: Record<string, unknown> = {};
  if (typeof body.status === "string") patch.status = body.status;
  if (typeof body.client_name === "string") patch.client_name = body.client_name;

  const sb = supabaseAdmin;                    // supabaseAdmin() にしている箇所があればプロジェクト方針に合わせて
  const { error } = await sb.from("shift_records").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
