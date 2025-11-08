// app/api/postal-districts/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";  // supabaseAdmin をインポート

export async function GET(req: NextRequest) {
  try {
    // リクエストのクエリパラメータから postalCode3 を取得
    const postalCode3 = req.nextUrl.searchParams.get('postalCode3');  // URLのクエリパラメータから取得
    
    // クエリの作成
    const query = supabaseAdmin
      .from("postal_district")
      .select("postal_code_3,district");  // 必要なカラムを選択

    if (postalCode3) {
      query.eq("postal_code_3", postalCode3);  // postal_code_3 に基づく絞り込み
    }

    // 結果を district で昇順に並べ替え
    query.order("district", { ascending: true });

    // データを取得
    const { data, error } = await query;

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json(data);  // 結果をレスポンスとして返す
  } catch (err) {
    console.error("Error fetching districts", err);
    return NextResponse.json({ error: "Error fetching districts" }, { status: 500 });
  }
}
