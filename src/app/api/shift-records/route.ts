// ===============================
// app/api/shift-records/route.ts
// GET /api/shift-records?shift_id=xxx 既存レコード取得（単一）
// POST /api/shift-records レコード新規作成
// ===============================
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";


export async function GET(req: NextRequest) {
const sp = req.nextUrl.searchParams;
const shiftId = sp.get("shift_id");
if (!shiftId) return NextResponse.json({ error: "missing shift_id" }, { status: 400 });
const sb = supabaseAdmin;
const { data, error } = await sb
.from("shift_records")
.select("id,status,values,client_name")
.eq("shift_id", shiftId)
.maybeSingle();
if (error) return NextResponse.json({ error: error.message }, { status: 500 });
if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
return NextResponse.json(data);
}


export async function POST(req: NextRequest) {
const body = await req.json();
const shift_id = String(body?.shift_id || "");
const status = String(body?.status || "入力中");
const client_name = body?.client_name ?? null;
if (!shift_id) return NextResponse.json({ error: "missing shift_id" }, { status: 400 });
const sb = supabaseAdmin;
const { data, error } = await sb
.from("shift_records")
.insert({ shift_id, status, client_name })
.select("id,status")
.single();
if (error) return NextResponse.json({ error: error.message }, { status: 500 });
return NextResponse.json(data, { status: 201 });
}