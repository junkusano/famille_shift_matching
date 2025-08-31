import { NextResponse } from "next/server"
import { supabaseAdmin as db } from "@/lib/supabase/service"

const INPUT_TYPES = ["checkbox","select","number","text","textarea","image","display"] as const
type InputType = typeof INPUT_TYPES[number]

export async function PUT(req: Request, { params }: { params: { id: string } }) {
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
  // undefined を落とす
  Object.keys(patch).forEach(k => patch[k] === undefined && delete patch[k])

  const { error } = await db.from("shift_record_item_defs").update(patch).eq("id", params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { error } = await db.from("shift_record_item_defs").delete().eq("id", params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return new NextResponse(null, { status: 204 })
}
