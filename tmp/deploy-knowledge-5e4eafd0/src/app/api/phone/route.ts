import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// Supabaseクライアントの生成
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// 型定義
type PhoneEntry = {
  phone: string; // 主キー
  name: string;
};

// POST: 新規追加
export async function POST(req: Request) {
  const body: PhoneEntry = await req.json();

  if (!body.phone || !body.name) {
    return NextResponse.json({ error: "電話番号と名前は必須です" }, { status: 400 });
  }

  const { error } = await supabase.from("phone").insert([body]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

// GET: 一覧取得
export async function GET() {
  const { data, error } = await supabase
    .from("phone")
    .select("*")
    .order("phone", { ascending: true });

  if (error) {
    console.error("Supabase GET error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// PATCH: 更新（phoneが主キー）
export async function PATCH(req: Request) {
  const body: PhoneEntry = await req.json();

  if (!body.phone) {
    return NextResponse.json({ error: "電話番号が必要です" }, { status: 400 });
  }

  const { error } = await supabase
    .from("phone")
    .update({ name: body.name })
    .eq("phone", body.phone);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

// DELETE: 削除（phoneが主キー）
export async function DELETE(req: Request) {
  const { phone } = await req.json();

  if (!phone) {
    return NextResponse.json({ error: "電話番号が必要です" }, { status: 400 });
  }

  const { error } = await supabase.from("phone").delete().eq("phone", phone);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
