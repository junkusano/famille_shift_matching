// /pages/api/cron/dispatch-rpa-from-talks.ts
import type { NextApiRequest, NextApiResponse } from "next";
import analyzeTalksAndDispatchToRPA from "@/lib/supabase/analyzeTalksAndDispatchToRPA";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    await analyzeTalksAndDispatchToRPA();
    return res
      .status(200)
      .json({ message: "トーク分析およびRPA登録が完了しました" });
  } catch (error: any) {
    console.error("トーク分析処理エラー:", error);
    return res
      .status(500)
      .json({ message: "サーバーエラー", error: error?.message || error });
  }
}
