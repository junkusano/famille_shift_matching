// ===============================
// app/api/shift-records/[id]/values/route.ts
// POST /api/shift-records/:id/values 都度保存（配列で受ける）
// 既存のフロント実装に合わせた互換 API
// ===============================
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";


export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
const id = params.id;
const payload = await req.json();
if (!Array.isArray(payload)) return NextResponse.json({ error: "body must be array" }, { status: 400 });
const rows = payload.map((p: { item_def_id: string; value: unknown }) => ({
record_id: id, item_def_id: String(p.item_def_id), value: p.value,
}));
const sb = supabaseAdmin;
const { error } = await sb.from("shift_record_items").upsert(rows, { onConflict: "record_id,item_def_id" });
if (error) return NextResponse.json({ error: error.message }, { status: 500 });
return NextResponse.json({ ok: true });
}