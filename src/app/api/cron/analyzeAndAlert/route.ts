import { NextResponse } from "next/server";

/**
 * 旧「依頼事項未対応」分析は停止中。
 *
 * vercel.json の定時実行からも外しているが、古い外部設定や手動呼び出しで
 * 誤通知しないよう、送信処理は実行せず停止状態だけを返す。
 */
export async function GET() {
  return NextResponse.json(
    { status: "disabled", message: "依頼事項未対応のアラートは停止中です。" },
    { status: 410 },
  );
}
