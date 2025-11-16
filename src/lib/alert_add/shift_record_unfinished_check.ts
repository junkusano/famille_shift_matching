// src/lib/alert_add/shift_record_unfinished_check.ts
// 3日以上前で record_status が submitted 以外のシフトに対してアラートを出す

import { supabaseAdmin } from "@/lib/supabase/service";
import { ensureSystemAlert } from "@/lib/alert/ensureSystemAlert";

type ShiftRecordRow = {
  shift_id: number;
  kaipoke_cs_id: string | null;
  client_name: string | null;
  shift_start_date: string; // 'YYYY-MM-DD'
  shift_start_time: string | null;
  record_status: string | null;
};

export type ShiftRecordUnfinishedResult = {
  scanned: number;
  created: number;
};

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function runShiftRecordUnfinishedCheck(): Promise<ShiftRecordUnfinishedResult> {
  // 「3日以上前」のカットオフ日付を算出（サーバ時刻ベースでOK）
  const now = new Date();
  const cutoff = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
  const cutoffYmd = ymd(cutoff);

  const MIN_DATE = "2025-10-01";

  console.info("[shift_record_unfinished] cutoffYmd =", cutoffYmd);

  // あなたが貼ってくれた SQL と同じ条件に揃える：
  //
  // select
  //   shift_id,
  //   kaipoke_cs_id,
  //   shift_start_date,
  //   shift_start_time,
  //   record_status
  // from shift_shift_record_view
  // where shift_start_date between '2025-10-01' and '2025-11-12'
  //   and (record_status is null or record_status <> 'submitted')
  //   and kaipoke_cs_id not like '99999999%';
  //
  const { data, error } = await supabaseAdmin
    .from("shift_shift_record_view")
    .select(
      "shift_id, kaipoke_cs_id, client_name, shift_start_date, shift_start_time, record_status",
    )
    .gte("shift_start_date", MIN_DATE)
    .lte("shift_start_date", cutoffYmd)
    .or("record_status.is.null,record_status.neq.submitted")
    .not("kaipoke_cs_id", "like", "99999999%");

  if (error) {
    console.error("[shift_record_unfinished] select error", error);
    throw new Error(
      `shift_shift_record_view select failed: ${error.message}`,
    );
  }

  const rows = (data ?? []) as ShiftRecordRow[];

  console.info("[shift_record_unfinished] fetched rows:", rows.length);

  if (!rows.length) {
    console.info("[shift_record_unfinished] done", {
      scanned: 0,
      created: 0,
    });
    return { scanned: 0, created: 0 };
  }

  let created = 0;
  let updated = 0;

  for (const r of rows) {
    const csid = r.kaipoke_cs_id ?? "不明";
    const date = r.shift_start_date;
    const time = r.shift_start_time? r.shift_start_time.slice(0, 5) : ""; 
    //const status = r.record_status ?? "(未作成)";

     const clientName =  r.client_name ?? "（利用者名非該当）";

    // 利用者別シフト画面へのリンク
    const url =
      r.kaipoke_cs_id
        ? `https://myfamille.shi-on.net/portal/shift-view?client=${encodeURIComponent(
            r.kaipoke_cs_id,
          )}&date=${encodeURIComponent(date)}`
        : "";

    const baseText =
      "【訪問記録3日以上エラー放置】早急に対処してください。";

    // AlertBar 側で <a> をそのまま描画するので、ここでリンクまで組み立てる
    const message = url
      ? `${baseText}<a href="${url}" target="_blank" rel="noreferrer">${clientName} / ${date} ${time} </a>`
      : `${baseText}${clientName} / ${date} ${time}`;

    try {
      const res = await ensureSystemAlert({
        message,
        visible_roles: ["manager", "staff"],
        status: "open",
        kaipoke_cs_id: r.kaipoke_cs_id,
        shift_id: String(r.shift_id),
      });

      if (res.created) {
        created++;
      } else {
        updated++;
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

  console.info("[shift_record_unfinished] done", {
    scanned: rows.length,
    created,
    updated,
  });

  return {
    scanned: rows.length,
    created,
  };
}
