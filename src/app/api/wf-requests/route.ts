// src/app/api/wf-requests/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

export const dynamic = "force-dynamic";

/**
 * GET /api/wf-requests
 * 申請一覧取得
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const status = searchParams.get("status"); // 任意: draft/submitted/approved...
  const typeCode = searchParams.get("type"); // 任意: expense/training/...

  let query = supabase
    .from("wf_request")
    .select(
      `
        id,
        status,
        title,
        created_at,
        updated_at,
        submitted_at,
        request_type: wf_request_type (
          id,
          code,
          label
        )
      `
    )
    .order("created_at", { ascending: false });

  if (status) {
    query = query.eq("status", status);
  }

  if (typeCode) {
    query = query.eq("wf_request_type.code", typeCode);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json(
      { message: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ data });
}

/**
 * POST /api/wf-requests
 * 下書き申請作成
 */
export async function POST(req: NextRequest) {
  const body = await req.json();

  const {
    request_type_code, // 'expense' | 'training' | ...
    title = "",
    body_text = "",
    payload = {},
  } = body;

  if (!request_type_code) {
    return NextResponse.json(
      { message: "request_type_code is required" },
      { status: 400 }
    );
  }

  // request_type を code から取得
  const { data: typeRow, error: typeErr } = await supabase
    .from("wf_request_type")
    .select("id")
    .eq("code", request_type_code)
    .eq("is_active", true)
    .single();

  if (typeErr || !typeRow) {
    return NextResponse.json(
      { message: "Invalid request_type_code" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("wf_request")
    .insert({
      request_type_id: typeRow.id,
      title,
      body: body_text,
      payload,
      status: "draft",
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { message: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ data });
}
