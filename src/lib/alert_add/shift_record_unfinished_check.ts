// /src/lib/alert_add/shift_record_unfinished_check.ts
// shift_shift_record_view から「実施記録が submitted になっていないシフト」を探して alert を出す。
// /src/lib/alert_add/shift_record_unfinished_check.ts
// shift_shift_record_view から「実施記録が submitted になっていないシフト」を探して alert を出す。

import { supabaseAdmin } from '@/lib/supabase/service';
import { ensureSystemAlert } from '@/app/api/alert_add/_shared';

type ShiftRecordRow = {
  shift_id: number;
  kaipoke_cs_id: string | null;
  shift_start_date: string; // 'YYYY-MM-DD'
  shift_start_time: string | null;
  record_status: string | null;
  staff_01_user_id: string | null; // ← URL 用
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
  const { data, error } = await supabaseAdmin
    .from('shift_shift_record_view')
    .select(
      'shift_id, kaipoke_cs_id, shift_start_date, shift_start_time, record_status, staff_01_user_id',
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

  // 利用者名をまとめて取得（cs_kaipoke_info.name）
  const csIds = Array.from(
    new Set(
      rows
        .map((r) => r.kaipoke_cs_id)
        .filter((id): id is string => !!id),
    ),
  );

  const clientNameMap: Record<string, string> = {};

  if (csIds.length > 0) {
    const { data: csRows, error: csError } = await supabaseAdmin
      .from('cs_kaipoke_info')
      .select('kaipoke_cs_id, name')
      .in('kaipoke_cs_id', csIds);

    if (csError) {
      console.error('[shift_record_unfinished] cs_kaipoke_info select error', csError);
    } else {
      for (const r of csRows ?? []) {
        if (r.kaipoke_cs_id) {
          clientNameMap[r.kaipoke_cs_id] = r.name ?? '';
        }
      }
    }
  }

  for (const r of rows) {
    const csid = r.kaipoke_cs_id ?? '不明';
    const date = r.shift_start_date;
    const time = r.shift_start_time ?? '';
    const status = r.record_status ?? '(未作成)';
    const clientName =
      (r.kaipoke_cs_id && clientNameMap[r.kaipoke_cs_id]) || '利用者名不明';

    // URL 作成
    const baseUrl = 'https://myfamille.shi-on.net/portal/shift-view';
    const clientParam = encodeURIComponent(r.kaipoke_cs_id ?? '');
    const dateParam = encodeURIComponent(date);
    const userIdParam = r.staff_01_user_id ? encodeURIComponent(r.staff_01_user_id) : '';

    let url = `${baseUrl}?client=${clientParam}&date=${dateParam}`;
    if (userIdParam) {
      url += `&user_id=${userIdParam}`;
    }

    const message =
      `【訪問記録3日以上エラー放置】早急に対処してください。` +
      `利用者: ${clientName}（CS ID: ${csid}）` +
      ` / シフトID: ${r.shift_id} / 日時: ${date} ${time} / 状態: ${status}` +
      ` / 訪問記録画面: ${url}`;

    try {
      const res = await ensureSystemAlert({
        message,
        severity: 2,
        visible_roles: ['manager', 'staff'],
        kaipoke_cs_id: r.kaipoke_cs_id,
      });
      if (res.created) created++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[shift_record_unfinished] ensureSystemAlert error', {
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
