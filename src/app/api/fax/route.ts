import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// Supabaseクライアントの生成
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// 型定義
type FaxEntry = {
  fax: string;
  office_name: string;
  email: string;
  service_kind: string;
};

// POST: 新規登録
export async function POST(req: Request) {
  const body: FaxEntry = await req.json();
  const { error } = await supabase.from("fax_directory").insert([body]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

// GET: 一覧取得（オプション）
export async function GET() {
  const { data, error } = await supabase.from("fax_directory").select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
