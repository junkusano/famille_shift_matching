//api/disability-check/route.ts
import { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

// Supabase クライアントの作成
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,  // .envからSupabase URLを取得
  process.env.SUPABASE_SERVICE_ROLE_KEY!  // サービスロールキー
);

export async function POST(req: NextApiRequest, res: NextApiResponse) {
  const { yearMonth, kaipokeServicek } = req.body;

  try {
    // Supabaseでデータを取得
    const { data, error } = await supabaseAdmin
      .from("disability_check")
      .select("id, name, ido_jukyusyasho, is_checked")
      .eq("year_month", yearMonth)
      .eq("kaipoke_servicek", kaipokeServicek);

    if (error) {
      throw new Error(error.message);
    }

    res.status(200).json(data);  // 取得したデータを返す
  } catch (err) {
    console.error("Error fetching records", err);
    res.status(500).json({ error: "Error fetching records" });
  }
}
