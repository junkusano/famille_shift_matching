import { NextResponse } from "next/server"
import { supabaseAdmin as db } from "@/lib/supabase/service"

const INPUT_TYPES = ["checkbox","select","number","text","textarea","image","display"] as const
type InputType = typeof INPUT_TYPES[number]

export async function GET() {
  const { data, error } = await db
    .from("shift_record_item_defs")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // options は必ずオブジェクト
  const safe = (data ?? []).map((x) => ({ ...x, options: x.options ?? {} }))
  return NextResponse.json(safe)
}

export async function POST(req: Request) {
  const b = await req.json()
  if (!b.code || !b.label || !b.input_type) {
    return NextResponse.json({ error: "code / label / input_type is required" }, { status: 400 })
  }
  if (![...INPUT_TYPES].includes(b.input_type as InputType)) {
    return NextResponse.json({ error: "invalid input_type" }, { status: 400 })
  }
  if (!b.l_id && !b.s_id) {
    return NextResponse.json({ error: "l_id or s_id is required" }, { status: 400 })
  }
  const row = {
    l_id: b.l_id ?? null,
    s_id: b.s_id ?? null,
    code: b.code,
    label: b.label,
    input_type: b.input_type as InputType,
    unit: b.unit ?? null,
    required: Boolean(b.required),
    sort_order: b.sort_order ?? 1000,
    active: b.active ?? true,
    options: b.options && typeof b.options === "object" ? b.options : {},
  }
  const { data, error } = await db.from("shift_record_item_defs").insert(row).select("id").single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ id: data.id }, { status: 201 })
}
