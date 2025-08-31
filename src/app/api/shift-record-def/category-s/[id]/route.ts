import { NextResponse } from "next/server"
import { supabaseAdmin as db } from "@/lib/supabase/service"

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const b = await req.json()
  const { error } = await db.from("shift_record_category_s").update({
    l_id: b.l_id,
    code: b.code,
    name: b.name,
    sort_order: b.sort_order,
    active: b.active,
  }).eq("id", params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { error } = await db.from("shift_record_category_s").delete().eq("id", params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return new NextResponse(null, { status: 204 })
}
