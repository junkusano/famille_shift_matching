import { supabase } from "@/lib/supabaseClient";

// ChatGPTの返答から rpa_command_requests に登録する関数
export async function handleParsedResult({
  responseText,
  user_id,
}: {
  responseText: string;
  user_id: string;
}) {
  // JSON形式でなければ無視
  if (!responseText?.includes("{") || responseText.includes("処理なし")) return;

  let parsed;
  try {
    parsed = JSON.parse(responseText);
  } catch (error) {
    console.error("❌ JSON parse error:", error);
    return;
  }

  const { template_id, request_detail } = parsed;

  if (!template_id || !request_detail) {
    console.error("❌ Invalid response: missing template_id or request_detail");
    return;
  }

  const insertPayload = {
    template_id: template_id,
    request_detail: request_detail,
    requester_name: user_id, // 呼び出し元ユーザーID
    approver_name: null, // 今は承認なし
    status_label: "approved", // 初期は承認済みで扱う
    requested_at: new Date().toISOString(), // 現在時刻
  };

  const { error } = await supabase.from("rpa_command_requests").insert(insertPayload);
  if (error) {
    console.error("❌ Supabase insert error:", error);
  } else {
    console.log("✅ RPAリクエストを登録しました");
  }
}
