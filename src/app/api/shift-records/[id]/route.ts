import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";


export async function PATCH(_req: NextRequest, { params }: { params: { id: string } }) {
const id = params.id;
const body = await _req.json();
const patch: Record<string, unknown> = {};
if (typeof body.status === "string") patch.status = body.status;
if (typeof body.client_name === "string") patch.client_name = body.client_name;
const sb = supabaseAdmin;
const { error } = await sb.from("shift_records").update(patch).eq("id", id);
if (error) return NextResponse.json({ error: error.message }, { status: 500 });
return NextResponse.json({ ok: true });
}