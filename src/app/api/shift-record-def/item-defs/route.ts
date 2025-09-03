// /app/api/shift-record-def/item-defs/route.ts
import { NextResponse } from "next/server"
import { supabaseAdmin as db } from "@/lib/supabase/service"

const INPUT_TYPES = ["checkbox","select","number","text","textarea","image","display"] as const
type InputType = typeof INPUT_TYPES[number]

// "0" → 0, '["a"]' → ["a"], "true" → true
function parseDefaultLoose(v: unknown): unknown {
  if (v === undefined) return undefined
  if (v === null || v === "") return null
  if (typeof v !== "string") return v
  const t = v.trim()
  if (!t) return null
  if (t.startsWith("[") || t.startsWith("{")) {
    try { return JSON.parse(t) } catch { return t }
  }
  if (/^-?\d+(?:\.\d+)?$/.test(t)) return Number(t)
  if (t === "true" || t === "false") return t === "true"
  return t
}

export async function GET() {
  const { data, error } = await db
    .from("shift_record_item_defs")
    .select("*")
    .order("l_id", { nullsFirst: true })
    .order("s_id", { nullsFirst: true })
    .order("sort_order", { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: Request) {
  const b = await req.json()

  if (b.input_type && !INPUT_TYPES.includes(b.input_type as InputType)) {
    return NextResponse.json({ error: "invalid input_type" }, { status: 400 })
  }

  // options は string(JSON) でも object でもOK
  let optionsParsed: Record<string, unknown> = {}
  if (b.options !== undefined) {
    if (typeof b.options === "string") {
      try { optionsParsed = JSON.parse(b.options) } catch {
        return NextResponse.json({ error: "options must be valid JSON" }, { status: 400 })
      }
    } else if (typeof b.options === "object" && b.options !== null) {
      optionsParsed = b.options
    } else {
      return NextResponse.json({ error: "options must be object or JSON string" }, { status: 400 })
    }
  }

  const payload = {
    l_id: b.l_id ?? null,
    s_id: b.s_id ?? null,
    code: b.code,
    label: b.label,
    input_type: b.input_type as InputType,
    unit: b.unit ?? null,
    required: !!b.required,
    sort_order: typeof b.sort_order === "number" ? b.sort_order : Number(b.sort_order ?? 1000),
    active: b.active !== false,
    options: optionsParsed,
    default_value: parseDefaultLoose(b.default_value),
  }

  const { data, error } = await db
    .from("shift_record_item_defs")
    .insert(payload)
    .select("*")
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data, { status: 201 })
}

// ← ここに PUT/DELETE は置かない（[id]/route.ts 側で対応）
