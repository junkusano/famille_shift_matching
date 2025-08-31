//api/shift-record/category-l[id]
import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin as db } from "@/lib/supabase/service" // ← あなたのサービスに合わせて

function extractId(req: NextRequest): string {
  const { pathname } = new URL(req.url)
  // .../api/shift-record-def/category-l/<id>
  return pathname.split("/").pop() as string
}

export async function PUT(req: NextRequest) {
  const id = extractId(req)
  const body = await req.json()

  const { error } = await db
    .from("shift_record_category_l")
    .update({
      code: body.code,
      name: body.name,
      sort_order: body.sort_order,
      active: body.active,
    })
    .eq("id", id)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const id = extractId(req)
  const { error } = await db.from("shift_record_category_l").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return new NextResponse(null, { status: 204 })
}

