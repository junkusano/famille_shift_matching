// src/lib/alert_add/shift_record_unfinished_check.ts

import { supabaseAdmin } from "@/lib/supabase/service";
import { ensureSystemAlert } from "@/lib/alert/ensureSystemAlert";

type ShiftRecordRow = {
  shift_id: number;
  kaipoke_cs_id: string | null;
  shift_start_date: string; // 'YYYY-MM-DD'
  shift_start_time: string | null;
  record_status: string | null;
  client_name: string | null; // 実際のカラム名に合わせて変更
};

type RunResult = {
  scanned: number; // ← CheckResult が期待している形に合わせる
  created: number;
};

function toYmd(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * 未完了の訪問記録（3日以上放置）のアラートチェック
 */
export async function runShiftRecordUnfinishedCheck(): Promise<RunResult> {
  const now = new Date();

  // 3日前までを対象
  const cutoff = new Date(now.getTime() - 3 * 86400000);
  const cutoffYmd = toYmd(cutoff);

  // 必要なら下限日
  const minDate = "2024-01-01";

  const { data, error } = await supabaseAdmin
    .from("shift_shift_record_view")
    .select(
      "shift_id, kaipoke_cs_id, shift_start_date, shift_start_time, record_status, client_name",
    )
    .gte("shift_start_date", minDate)
    .lte("shift_start_date", cutoffYmd)
    // record_status is null OR record_status <> 'submitted'
    .or("record_status.is.null,record_status.neq.submitted");

  if (error) {
    console.error("[shift_record_unfinished] select error", error);
    throw new Error(
      `shift_shift_record_view select failed: ${error.message}`,
    );
  }

  const rows = (data ?? []) as ShiftRecordRow[];

  // テスト用 CS などあればここで除外
  const targets = rows.filter((r) => {
    if (!r.kaipoke_cs_id) return false;
    // 例: 9999〜 をテスト扱いで除外
    if (r.kaipoke_cs_id.startsWith("9999")) return false;
    return true;
  });

  if (targets.length === 0) {
    console.info("[shift_record_unfinished] 対象 0 件");
    return { scanned: 0, created: 0 };
  }

  let createdCount = 0;
  let updatedCount = 0;

  for (const r of targets) {
    const name = r.client_name ?? "利用者名不明";
    const date = r.shift_start_date;
    const csid = r.kaipoke_cs_id!;

    const url =
      `https://myfamille.shi-on.net/portal/shift-view` +
      `?client=${encodeURIComponent(csid)}` +
      `&date=${encodeURIComponent(date)}`;

    // メッセージは severity によらず固定
    const message =
      "【訪問記録3日以上エラー放置】早急に対処してください。" +
      `<a href="${url}" target="_blank" rel="noreferrer">` +
      `${name}　${date}` +
      `</a>`;

    try {
      const res = await ensureSystemAlert({
        message,
        visible_roles: ["manager", "staff"],
        status: "open",
        kaipoke_cs_id: csid,
        shift_id: String(r.shift_id), // ★ ensureSystemAlert 側が string 型なので変換
      });

      if (res.created) {
        createdCount++;
      } else {
        updatedCount++;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[shift_record_unfinished] ensureSystemAlert error", {
        shift_id: r.shift_id,
        csid,
        msg,
      });
    }
  }

  console.info("[shift_record_unfinished] アラート upsert:", {
    scanned: targets.length,
    created: createdCount,
    updated: updatedCount,
  });

  return {
    scanned: targets.length,
    created: createdCount,
  };
}
