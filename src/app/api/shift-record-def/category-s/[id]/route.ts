//api/shift-record-def/category-s/[id]
import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin as db } from "@/lib/supabase/service"

function extractId(req: NextRequest): string {
  const { pathname } = new URL(req.url)
  // .../api/shift-record-def/category-s/<id>
  return pathname.split("/").pop() as string
}

export async function PUT(req: NextRequest) {
  const id = extractId(req)
  const b = await req.json()

  const { error } = await db
    .from("shift_record_category_s")
    .update({
      l_id: b.l_id,
      code: b.code,
      name: b.name,
      sort_order: b.sort_order,
      active: b.active,
    })
    .eq("id", id)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const id = extractId(req)
  const { error } = await db.from("shift_record_category_s").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return new NextResponse(null, { status: 204 })
}

