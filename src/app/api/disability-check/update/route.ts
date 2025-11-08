//api/disability-check/update/route.ts
import { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

// Supabase クライアントの作成
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,  // .envからSupabase URLを取得
  process.env.SUPABASE_SERVICE_ROLE_KEY!  // サービスロールキー
);

const updateDisabilityCheckHandler = async (
  req: NextApiRequest,
  res: NextApiResponse
) => {
  const { id, check } = req.body;

  try {
    // Supabaseでチェックボックスの状態を更新
    const { error } = await supabaseAdmin
      .from("disability_check")
      .update({ is_checked: check })
      .eq("id", id);

    if (error) {
      throw new Error(error.message);
    }

    res.status(200).send("Updated successfully");
  } catch (err) {
    console.error("Error updating check", err);
    res.status(500).send("Error updating check");
  }
};

export default updateDisabilityCheckHandler;
