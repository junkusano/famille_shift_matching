import { NextResponse } from "next/server"
import { supabaseAdmin as db } from "@/lib/supabase/service"

export async function GET() {
  const { data, error } = await db
    .from("shift_record_category_l")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: Request) {
  const body = await req.json()
  const row = {
    code: body.code,
    name: body.name,
    sort_order: body.sort_order ?? 1000,
    active: body.active ?? true,
  }
  const { data, error } = await db.from("shift_record_category_l").insert(row).select("id").single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ id: data.id }, { status: 201 })
}
