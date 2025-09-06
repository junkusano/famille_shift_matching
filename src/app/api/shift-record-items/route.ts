// app/api/shift-record-items/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service"; // 互換エクスポートにしてあれば関数/値どちらでもOK

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!Array.isArray(body)) {
    return NextResponse.json({ error: "array required" }, { status: 400 });
  }
  const rows = body.map((r) => ({
    record_id: String(r.record_id),
    item_def_id: String(r.item_def_id),
    value: r.value,
  }));

  const sb = supabaseAdmin; // or supabaseAdmin()
  const { error } = await sb
    .from("shift_record_items")
    .upsert(rows, { onConflict: "record_id,item_def_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
