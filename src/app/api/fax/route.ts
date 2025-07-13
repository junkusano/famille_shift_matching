import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// Supabaseクライアントの生成
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// 型定義
type FaxEntry = {
  fax: string; // ← これが主キー
  office_name: string;
  email: string;
  service_kind: string;
};

// POST: 新規追加
export async function POST(req: Request) {
  const body: FaxEntry = await req.json();

  if (!body.fax || !body.office_name) {
    return NextResponse.json({ error: "FAX番号と事業所名は必須です" }, { status: 400 });
  }

  const { error } = await supabase.from("fax").insert([body]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

// GET: 一覧取得
export async function GET() {
  const { data, error } = await supabase.from("fax").select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// PATCH: 更新（faxが主キー）
export async function PATCH(req: Request) {
  const body: FaxEntry = await req.json();

  if (!body.fax) {
    return NextResponse.json({ error: "FAX番号が必要です" }, { status: 400 });
  }

  const { error } = await supabase
    .from("fax")
    .update({
      office_name: body.office_name,
      email: body.email,
      service_kind: body.service_kind,
    })
    .eq("fax", body.fax);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

// DELETE: 削除（faxが主キー）
export async function DELETE(req: Request) {
  const { fax } = await req.json();

  if (!fax) {
    return NextResponse.json({ error: "FAX番号が必要です" }, { status: 400 });
  }

  const { error } = await supabase.from("fax").delete().eq("fax", fax);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
