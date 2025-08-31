//api/shift-record-def/item-defs[id]
import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin as db } from "@/lib/supabase/service"

const INPUT_TYPES = ["checkbox","select","number","text","textarea","image","display"] as const
type InputType = typeof INPUT_TYPES[number]

function extractId(req: NextRequest): string {
  const { pathname } = new URL(req.url)
  // .../api/shift-record-def/item-defs/<id>
  return pathname.split("/").pop() as string
}

export async function PUT(req: NextRequest) {
  const id = extractId(req)
  const b = await req.json()

  if (b.input_type && ![...INPUT_TYPES].includes(b.input_type as InputType)) {
    return NextResponse.json({ error: "invalid input_type" }, { status: 400 })
  }

  const patch: Record<string, unknown> = {
    l_id: b.l_id ?? null,
    s_id: b.s_id ?? null,
    code: b.code,
    label: b.label,
    input_type: b.input_type as InputType | undefined,
    unit: b.unit ?? null,
    required: typeof b.required === "boolean" ? b.required : undefined,
    sort_order: b.sort_order,
    active: typeof b.active === "boolean" ? b.active : undefined,
    options: b.options && typeof b.options === "object" ? b.options : undefined,
  }
  Object.keys(patch).forEach(k => patch[k] === undefined && delete patch[k])

  const { error } = await db.from("shift_record_item_defs").update(patch).eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const id = extractId(req)
  const { error } = await db.from("shift_record_item_defs").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return new NextResponse(null, { status: 204 })
}
