// /app/api/shift-record-def/item-defs/[id]/route.ts
import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin as db } from "@/lib/supabase/service"

const INPUT_TYPES = ["checkbox","select","number","text","textarea","image","display"] as const
type InputType = typeof INPUT_TYPES[number]

// ★ 追加: 型ガード
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

function extractId(req: NextRequest): string {
  const { pathname } = new URL(req.url)
  return pathname.split("/").pop() as string
}

function parseDefaultLoose(v: unknown): unknown {
  if (v === undefined) return undefined
  if (v === null || v === "") return null
  if (typeof v !== "string") return v
  const t = v.trim()
  if (!t) return null
  if (t.startsWith("[") || t.startsWith("{")) {
    try { return JSON.parse(t) as unknown } catch { return t }
  }
  if (/^-?\d+(?:\.\d+)?$/.test(t)) return Number(t)
  if (t === "true" || t === "false") return t === "true"
  return t
}

// ★ 追加: JSON文字列 or オブジェクトを受け、必ず Record<string,unknown> に正規化
function parseJsonObjectLoose(name: string, v: unknown): Record<string, unknown> | undefined {
  if (v === undefined) return undefined              // 未送信→更新しない
  if (v === null)      return {}                     // 明示クリア→ {}
  if (typeof v === "string") {
    let tmp: unknown
    try { tmp = JSON.parse(v) as unknown } catch {
      throw new Error(`${name} must be a JSON object string`)
    }
    if (!isRecord(tmp)) throw new Error(`${name} must be an object`)
    return tmp
  }
  if (isRecord(v)) return v
  throw new Error(`${name} must be object or JSON object string`)
}

export async function PUT(req: NextRequest) {
  const id = extractId(req)
  const b: unknown = await req.json()

  // ★ b の最低限の型絞り込み（必要十分の範囲）
  if (!isRecord(b)) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 })
  }

  if (b.input_type && !INPUT_TYPES.includes(b.input_type as InputType)) {
    return NextResponse.json({ error: "invalid input_type" }, { status: 400 })
  }

  // options
  let optionsParsed: Record<string, unknown> | undefined
  try {
    optionsParsed = parseJsonObjectLoose("options", b.options)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  // ★ rules_json / meta_json
  let rulesParsed: Record<string, unknown> | undefined
  let metaParsed:  Record<string, unknown> | undefined
  try {
    rulesParsed = parseJsonObjectLoose("rules_json", b.rules_json)
    metaParsed  = parseJsonObjectLoose("meta_json",  b.meta_json)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  const patch: Record<string, unknown> = {
    l_id: b.l_id ?? (b.l_id === null ? null : undefined),
    s_id: b.s_id ?? (b.s_id === null ? null : undefined),
    code: b.code as string | undefined,
    label: b.label as string | undefined,
    input_type: (b.input_type as InputType | undefined),
    unit: b.unit ?? (b.unit === null ? null : undefined),
    required: typeof b.required === "boolean" ? b.required : undefined,
    sort_order:
      b.sort_order === undefined
        ? undefined
        : (typeof b.sort_order === "number" ? b.sort_order : Number(b.sort_order)),
    active: typeof b.active === "boolean" ? b.active : undefined,
    options: optionsParsed,
    default_value: Object.prototype.hasOwnProperty.call(b, "default_value")
      ? parseDefaultLoose(b.default_value)
      : undefined,

    // ★ 追加
    rules_json: rulesParsed,
    meta_json:  metaParsed,
  }

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
