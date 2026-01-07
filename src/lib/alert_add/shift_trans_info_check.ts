// src/lib/alert_add/shift_trans_info_check.ts

import { supabaseAdmin } from "@/lib/supabase/service";
import { ensureSystemAlert } from "@/lib/alert/ensureSystemAlert";

type ShiftRow = {
  shift_id: number;
  kaipoke_cs_id: string | null;
  shift_start_date: string | null;
  service_code: string | null;
};

type ClientRow = {
  id: string;                          // ★ cs_kaipoke_info.id（UUID）
  kaipoke_cs_id: string;
  name: string | null;
  standard_trans_ways: string | null;
  standard_purpose: string | null;
};

export type ShiftTransInfoCheckResult = {
  scannedShiftCount: number;
  scannedClientCount: number;
  targetClientCount: number;
  alertsCreated: number;
  alertsUpdated: number;
};

function calcFromDate(): string {
  // 今日から 2ヶ月前（同日）
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setMonth(d.getMonth() - 2);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function todayJstYmd(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(
    new Date(),
  ); // YYYY-MM-DD
}

function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}


function chunk<T>(arr: T[], size: number): T[][] {
  if (size <= 0) return [arr];
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

export async function runShiftTransInfoCheck(): Promise<ShiftTransInfoCheckResult> {
  const fromDate = calcFromDate();

  // ★追加：開始2日前からチェック開始（= 今日+2日までのシフトだけ拾う）
  const gateTo = addDaysYmd(todayJstYmd(), 2);

  // 1) idou_f = true のサービスコード一覧
  const { data: svcRows, error: svcError } = await supabaseAdmin
    .from("shift_service_code")
    .select("service_code")
    .eq("idou_f", true);

  if (svcError) {
    console.error("[shift_trans_info_check] service_code error", svcError);
    throw svcError;
  }

  const transServiceCodes = (svcRows ?? [])
    .map((r) => r.service_code as string | null)
    .filter((v): v is string => !!v);

  if (transServiceCodes.length === 0) {
    console.info("[shift_trans_info_check] no idou_f=true service_code");
    return {
      scannedShiftCount: 0,
      scannedClientCount: 0,
      targetClientCount: 0,
      alertsCreated: 0,
      alertsUpdated: 0,
    };
  }

  // 2) 過去2ヶ月のシフト（移動系サービスのみ）
  const { data: shiftRowsRaw, error: shiftError } = await supabaseAdmin
    .from("shift")
    .select("shift_id, kaipoke_cs_id, shift_start_date, service_code")
    .gte("shift_start_date", fromDate)
    .lte("shift_start_date", gateTo) // ★追加：未来を取りすぎない
    .in("service_code", transServiceCodes);

  if (shiftError) {
    console.error("[shift_trans_info_check] shift error", shiftError);
    throw shiftError;
  }

  const shiftRows = (shiftRowsRaw ?? []) as ShiftRow[];

  if (shiftRows.length === 0) {
    console.info("[shift_trans_info_check] no target shifts", { fromDate });
    return {
      scannedShiftCount: 0,
      scannedClientCount: 0,
      targetClientCount: 0,
      alertsCreated: 0,
      alertsUpdated: 0,
    };
  }

  // 3) 対象 CS をユニークに抽出（99999999* は除外）
  const csSet = new Set<string>();
  for (const s of shiftRows) {
    const cs = s.kaipoke_cs_id;
    if (!cs) continue;
    if (cs.startsWith("99999999")) continue;
    csSet.add(cs);
  }

  const csIds = Array.from(csSet);
  if (csIds.length === 0) {
    console.info("[shift_trans_info_check] no valid kaipoke_cs_id");
    return {
      scannedShiftCount: shiftRows.length,
      scannedClientCount: 0,
      targetClientCount: 0,
      alertsCreated: 0,
      alertsUpdated: 0,
    };
  }

  // 4) cs_kaipoke_info を分割取得（is_active = false は除外）
  const chunks = chunk(csIds, 200);
  const clients: ClientRow[] = [];

  for (const ids of chunks) {
    const { data, error } = await supabaseAdmin
      .from("cs_kaipoke_info")
      .select(
        "id, kaipoke_cs_id, name, standard_trans_ways, standard_purpose, is_active",// ★ id を追加
      )
      .in("kaipoke_cs_id", ids);

    if (error) {
      console.error("[shift_trans_info_check] cs_kaipoke_info error", error);
      throw error;
    }

    for (const row of data ?? []) {
      if (row.is_active === false) continue;
      clients.push({
        id: row.id,                                   // ★ 追加
        kaipoke_cs_id: row.kaipoke_cs_id,
        name: row.name ?? null,
        standard_trans_ways: row.standard_trans_ways ?? null,
        standard_purpose: row.standard_purpose ?? null,
      });
    }
  }

  if (clients.length === 0) {
    console.info("[shift_trans_info_check] no active clients");
    return {
      scannedShiftCount: shiftRows.length,
      scannedClientCount: 0,
      targetClientCount: 0,
      alertsCreated: 0,
      alertsUpdated: 0,
    };
  }

  // 5) 標準移動が未設定（どちらかでも空/null）の利用者だけ抽出
  const targets = clients.filter((c) => {
    const ways = (c.standard_trans_ways ?? "").trim();
    const purpose = (c.standard_purpose ?? "").trim();
    return !ways || !purpose;
  });

  if (targets.length === 0) {
    console.info(
      "[shift_trans_info_check] all clients have standard_trans_ways & standard_purpose",
    );
    return {
      scannedShiftCount: shiftRows.length,
      scannedClientCount: clients.length,
      targetClientCount: 0,
      alertsCreated: 0,
      alertsUpdated: 0,
    };
  }

  // 6) alert_log へ upsert
  let alertsCreated = 0;
  let alertsUpdated = 0;

  for (const c of targets) {
    const message = buildAlertMessage(c);
    const result = await ensureSystemAlert({
      message,
      kaipoke_cs_id: c.kaipoke_cs_id,
      shift_id: null,
      user_id: null,
      rpa_request_id: null,
    });

    if (result.created) alertsCreated += 1;
    else alertsUpdated += 1;
  }

  console.info("[shift_trans_info_check] done", {
    fromDate,
    gateTo,
    scannedShiftCount: shiftRows.length,
    scannedClientCount: clients.length,
    targetClientCount: targets.length,
    alertsCreated,
    alertsUpdated,
  });

  return {
    scannedShiftCount: shiftRows.length,
    scannedClientCount: clients.length,
    targetClientCount: targets.length,
    alertsCreated,
    alertsUpdated,
  };
}

function buildAlertMessage(c: ClientRow): string {
  const name = c.name ?? "利用者名不明";
  const csId = c.kaipoke_cs_id;
  // ★ cs_kaipoke_info.id を使った詳細ページ URL
  const detailUrl = `https://myfamille.shi-on.net/portal/kaipoke-info-detail/${c.id}`;

  return [
    `【移動系サービス情報未設定】移動系サービスを利用しているのに標準の移動手段／目的が設定されていません：${name} 様（CS ID: ${csId}）`,
    `標準ルート・標準移動手段・目的を登録してください。`,
    `利用者情報ページ: ${detailUrl}`,
  ].join(' ');
}
