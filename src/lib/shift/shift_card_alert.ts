// src/lib/shift/shift_card_alert.ts
import { supabase } from "@/lib/supabaseClient";

/**
 * 時間調整アラート作成に必要な最小限のシフト情報
 */
export type ShiftLikeForAlert = {
  shift_id: number | string;
  kaipoke_cs_id: string | null;
  shift_start_date: string;          // 'YYYY-MM-DD'
  shift_start_time?: string | null;  // 'HH:MM:SS' など
  client_name?: string | null;
};

/** 'HH:MM:SS' -> 'HH:MM' */
const toHM = (t?: string | null): string => (t ? t.slice(0, 5) : "");

/**
 * cs_kaipoke_info.name を優先して利用者名を解決する。
 * 取得できない場合は shift.client_name、最後の最後は「（利用者名非該当）」。
 */
async function resolveClientName(shift: ShiftLikeForAlert): Promise<string> {
  const csId = shift.kaipoke_cs_id ?? undefined;

  // 1) cs_kaipoke_info から取得トライ
  if (csId) {
    const { data, error } = await supabase
      .from("cs_kaipoke_info")
      .select("name")
      .eq("kaipoke_cs_id", csId)
      .maybeSingle();

    if (!error && data && typeof data.name === "string") {
      const name = data.name.trim();
      if (name) return name;
    }
  }

  // 2) シフトに載っている client_name をフォールバック
  const fallback = (shift.client_name ?? "").trim();
  if (fallback) return fallback;

  // 3) それでも無ければダミー
  return "（利用者名非該当）";
}

/** YYYY-MM を shift_start_date から取り出す */
function getYearMonth(dateStr?: string | null): string | null {
  if (!dateStr || dateStr.length < 7) return null;
  return dateStr.slice(0, 7); // 'YYYY-MM'
}

/** 月間シフトのURLを生成（例: https://myfamille.shi-on.net/portal/roster/monthly?...） */
function buildMonthlyRosterUrl(kaipokeCsId?: string | null, dateStr?: string | null): string | null {
  const cs = (kaipokeCsId ?? "").trim();
  const ym = getYearMonth(dateStr ?? undefined);
  if (!cs || !ym) return null;

  const qs =
    "kaipoke_cs_id=" + encodeURIComponent(cs) +
    "&month=" + encodeURIComponent(ym);

  return `https://myfamille.shi-on.net/portal/roster/monthly?${qs}`;
}

/**
 * シフト希望（資格疑義 or 時間調整希望あり）のときに alert_log を1件追加する。
 *
 * つくる条件：
 *  ① 資格要件を満たさない警告が付いているとき
 *  ② 時間変更の希望欄（警告を除いた本体）が空欄でないとき
 *
 * 引数 timeAdjustNote には ShiftCard から渡される「合成済み」テキスト：
 *   - 資格NGのとき: 「※資格警告...\n」 + textarea の中身
 *   - 資格OKのとき: textarea の中身のみ
 */
export async function createTimeAdjustAlertFromShift(
  shift: ShiftLikeForAlert,
  timeAdjustNote?: string | null,
  requesterId?: string | null
): Promise<void> {
  const clientName = await resolveClientName(shift);
  const full = (timeAdjustNote ?? "").trim();

  // ShiftCard 側で付けている資格警告の先頭文言
  const warnPrefix =
    "※保有する資格ではこのサービスに入れない可能性があります。マネジャーに確認もしくは、保有資格の確認をポータルHomeで行ってください。";

  // ① 資格要件NGかどうか判定
  let hasCertWarn = false;
  let bodyNote = full;
  if (full.startsWith(warnPrefix)) {
    hasCertWarn = true;
    // 警告行を取り除いた「時間調整の本体」部分
    bodyNote = full.slice(warnPrefix.length).trim();
  }

  // ② 時間調整の本体が空かどうか
  const hasTimeAdjust = bodyNote.length > 0;

  // ★ ここで条件判定：
  //  どちらにも当てはまらなければ alert_log は作らないで終了
  if (!hasCertWarn && !hasTimeAdjust) {
    return;
  }

  const requester = (requesterId ?? "").trim() || undefined;
  const monthlyUrl = buildMonthlyRosterUrl(shift.kaipoke_cs_id, shift.shift_start_date);

  const lines: string[] = [];

  // ベース行
  lines.push(
    `${clientName} 様 ${shift.shift_start_date} ${toHM(shift.shift_start_time)}～ のシフト希望が登録されました。`
  );

  // 資格要件の注意
  if (hasCertWarn) {
    lines.push(
      "【資格要件の注意】保有する資格ではこのサービスに入れない可能性があります。マネジャーに確認もしくは、保有資格の確認をポータルHomeで行ってください。"
    );
  }

  // 時間調整の希望
  if (hasTimeAdjust) {
    lines.push(`【希望の時間調整】${bodyNote}`);
  }

  // 対象利用者の月間シフトリンク
  if (monthlyUrl) {
    lines.push(`月間シフト: ${monthlyUrl}`);
  }

  // リクエストした user_id
  if (requester) {
    lines.push(`リクエスト者: ${requester}`);
  }

  const message = lines.join("\n");

  await supabase.from("alert_log").insert({
    message,
    visible_roles: ["manager", "staff"],
    severity: 2,               // 既存どおり 2 のまま（必要ならここも後で調整OK）
    status: "open",
    status_source: "system",
    kaipoke_cs_id: shift.kaipoke_cs_id,
    shift_id: shift.shift_id,
    user_id: requester ?? null, // ③ リクエストした user_id を格納
  });
}
