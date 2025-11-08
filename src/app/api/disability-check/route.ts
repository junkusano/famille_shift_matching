//api/disability-check/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";  // supabaseAdmin をインポート

export async function POST(req: NextRequest) {
  const { yearMonth, kaipokeServicek, districts } = await req.json();  // リクエストボディを取得

  try {
    // districtsが選ばれていれば、districtフィルタを作成
    const districtFilter = districts && districts.length > 0 ? districts : null;

    // `disability_check_view` ビューを使用してデータを取得
    const query = supabaseAdmin
      .from("disability_check_view")
      .select(`
        disability_check_id,
        kaipoke_cs_id,
        kaipoke_servicek,
        year_month,
        is_checked,
        client_name,
        ido_jukyusyasho,
        district
      `);

    // `district` が指定されていれば、districtフィルタを適用
    if (districtFilter) {
      query.in("district", districtFilter);
    }

    // `yearMonth` と `kaipokeServicek` に基づくデータをフィルタリング
    const { data, error } = await query
      .eq("year_month", yearMonth)
      .eq("kaipoke_servicek", kaipokeServicek);

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json(data);  // 取得したデータをレスポンスとして返す
  } catch (err) {
    console.error("Error fetching records", err);
    return NextResponse.json({ error: "Error fetching records" }, { status: 500 });
  }
}
