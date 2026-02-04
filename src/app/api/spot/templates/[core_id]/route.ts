// src/app/api/spot/templates/[core_id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export async function PATCH(req: NextRequest, ctx: { params: { core_id: string } }) {
  const core_id = ctx.params.core_id;
  const body = await req.json().catch(() => ({}));

  const { data, error } = await supabaseAdmin
    .from("spot_offer_template_unified")
    .update({
      ...body,
      updated_at: new Date().toISOString(),
    })
    .eq("core_id", core_id)
    .select("*")
    .single();

  if (error) return json({ error: error.message }, 500);
  return json(data);
}

export async function DELETE(_req: NextRequest, ctx: { params: { core_id: string } }) {
  const core_id = ctx.params.core_id;

  const { error } = await supabaseAdmin
    .from("spot_offer_template_unified")
    .delete()
    .eq("core_id", core_id);

  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
}
