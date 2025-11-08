//api/disability-check/update-ido-jukyusyasho/route.ts
import { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

// Supabase クライアントの作成
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,  // .envからSupabase URLを取得
  process.env.SUPABASE_SERVICE_ROLE_KEY!  // サービスロールキー
);

const updateIjoJukyusyashoHandler = async (
  req: NextApiRequest,
  res: NextApiResponse
) => {
  const { id, idoJukyusyasho } = req.body;

  try {
    // Supabaseで移動受給者所の情報を更新
    const { error } = await supabaseAdmin
      .from("disability_check")
      .update({ ido_jukyusyasho: idoJukyusyasho })
      .eq("id", id);

    if (error) {
      throw new Error(error.message);
    }

    res.status(200).send("Updated successfully");
  } catch (err) {
    console.error("Error updating ido_jukyusyasho", err);
    res.status(500).send("Error updating ido_jukyusyasho");
  }
};

export default updateIjoJukyusyashoHandler;
