//api/shift-record-def/category-s
import { NextResponse } from "next/server"
import { supabaseAdmin as db } from "@/lib/supabase/service"

export async function GET() {
  const { data, error } = await db
    .from("shift_record_category_s")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: Request) {
  const b = await req.json()
  if (!b.l_id) return NextResponse.json({ error: "l_id is required" }, { status: 400 })
  const row = {
    l_id: b.l_id,
    code: b.code,
    name: b.name,
    sort_order: b.sort_order ?? 1000,
    active: b.active ?? true,
  }
  const { data, error } = await db.from("shift_record_category_s").insert(row).select("id").single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ id: data.id }, { status: 201 })
}
