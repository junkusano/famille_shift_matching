// /src/lib/alert_add/shift_record_unfinished_check.ts
// shift_shift_record_view から「実施記録が submitted になっていないシフト」を探して alert を出す。

import { supabaseAdmin } from '@/lib/supabase/service';
import { ensureSystemAlert } from '@/lib/alert/ensureSystemAlert';

type ShiftRecordRow = {
  shift_id: number;
  kaipoke_cs_id: string | null;
  shift_start_date: string; // 'YYYY-MM-DD'
  shift_start_time: string | null;
  record_status: string | null;
  client_name: string | null; // ★ 利用者名
};

export type ShiftRecordUnfinishedResult = {
  scanned: number; // 対象件数
  created: number; // 新規アラート件数
};

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export async function runShiftRecordUnfinishedCheck(): Promise<ShiftRecordUnfinishedResult> {
  // JST 現在日付 -3 日
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const cutoff = new Date(jst.getTime() - 3 * 24 * 60 * 60 * 1000);
  const cutoffYmd = ymd(cutoff);

  const MIN_DATE = '2025-10-01';

  // shift_shift_record_view から条件に合うシフトを取得
  // 取得時の select に client_name を追加
  const { data, error } = await supabaseAdmin
    .from('shift_shift_record_view')
    .select(
      'shift_id, kaipoke_cs_id, shift_start_date, shift_start_time, record_status, client_name',
    )
    .gte('shift_start_date', MIN_DATE)
    .lte('shift_start_date', cutoffYmd)
    // training 用などは除外
    .not('kaipoke_cs_id', 'like', '99999999%')
    // record_status is null または submitted 以外
    .or('record_status.is.null,record_status.neq.submitted');

  if (error) {
    console.error('[shift_record_unfinished] select error', error);
    throw new Error(`shift_shift_record_view select failed: ${error.message}`);
  }

  const rows = (data ?? []) as ShiftRecordRow[];
  let created = 0;

  for (const r of rows) {
    const name = r.client_name ?? "利用者名不明";
    const date = r.shift_start_date;

    const base =
      "【訪問記録3日以上エラー放置】早急に対処してください。";

    let message: string;

    if (r.kaipoke_cs_id) {
      const url =
        `https://myfamille.shi-on.net/portal/shift-view` +
        `?client=${encodeURIComponent(r.kaipoke_cs_id)}` +
        `&date=${encodeURIComponent(date)}`;

      // ★（リンク付ける以下）利用者様名　2025-/-/（ここまで） をリンク化
      message =
        base +
        `<a href="${url}" target="_blank" rel="noreferrer">` +
        `${name}　${date}` +
        `</a>`;
    } else {
      // CS ID が取れないイレギュラーケースは、リンク無しでテキストだけ
      message = `${base}${name}　${date}`;
    }

    try {
      const res = await ensureSystemAlert({
        message,
        visible_roles: ["manager", "staff"],
        kaipoke_cs_id: r.kaipoke_cs_id,
      });
      if (res.created) created++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[shift_record_unfinished] ensureSystemAlert error", {
        shift_id: r.shift_id,
        msg,
      });
    }
  }


  console.log('[shift_record_unfinished] done', {
    scanned: rows.length,
    created,
  });

  return { scanned: rows.length, created };
}
