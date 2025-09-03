// /app/api/shift-record-def/item-defs/[id]/route.ts
import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin as db } from "@/lib/supabase/service"

const INPUT_TYPES = ["checkbox","select","number","text","textarea","image","display"] as const
type InputType = typeof INPUT_TYPES[number]

function extractId(req: NextRequest): string {
  const { pathname } = new URL(req.url)
  // .../api/shift-record-def/item-defs/<id>
  return pathname.split("/").pop() as string
}

// "0" → 0, "true" → true, '["a","b"]' → ["a","b"] など柔軟に変換
function parseDefaultLoose(v: unknown): unknown {
  if (v === undefined) return undefined        // ← 未送信（項目に触れない）
  if (v === null || v === "") return null      // ← 明示的クリア
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

export async function PUT(req: NextRequest) {
  const id = extractId(req)
  const b = await req.json()

  if (b.input_type && !INPUT_TYPES.includes(b.input_type as InputType)) {
    return NextResponse.json({ error: "invalid input_type" }, { status: 400 })
  }

  // options は string でも object でも受ける
  let optionsParsed: Record<string, unknown> | undefined = undefined
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

  const patch: Record<string, unknown> = {
    l_id: b.l_id ?? (b.l_id === null ? null : undefined),
    s_id: b.s_id ?? (b.s_id === null ? null : undefined),
    code: b.code,
    label: b.label,
    input_type: (b.input_type as InputType | undefined),
    unit: b.unit ?? (b.unit === null ? null : undefined),
    required: typeof b.required === "boolean" ? b.required : undefined,
    sort_order:
      b.sort_order === undefined
        ? undefined
        : (typeof b.sort_order === "number" ? b.sort_order : Number(b.sort_order)),
    active: typeof b.active === "boolean" ? b.active : undefined,
    options: optionsParsed,
    // default_value は「送ってきた時だけ」更新。空文字/null ならクリア。
    default_value: Object.prototype.hasOwnProperty.call(b, "default_value")
      ? parseDefaultLoose(b.default_value)
      : undefined,
  }

  // undefined はアップデート対象から除外
  Object.keys(patch).forEach((k) => { if (patch[k] === undefined) delete patch[k] })

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
