// /src/lib/alert_add/shift_cert_check.ts

import { supabaseAdmin } from "@/lib/supabase/service";
import { ensureSystemAlert } from "@/lib/alert/ensureSystemAlert";
import {
  fetchShiftShiftRecords,
  type ShiftShiftRecordRow,
} from "@/lib/shift/shift_shift_records";

import {
  type DocItemLite,
  type DocMasterRow,
  //type ServiceKey,
  requiredServiceKeysForService,
  judgeUserCertificatesForService,
  //determineServicesFromCertificates,
} from "@/lib/certificateJudge";

// Attachments 型（ShiftCard と統一）
export type Attachment = {
  id: string;
  url: string | null;
  type: string | null;
  label: string | null;
  mimeType?: string | null;
  acquired_at?: string | null;
  uploaded_at?: string | null;
};

export type ShiftCertCheckResult = {
  scanned: number;
  alertsCreated: number;
  alertsUpdated: number;
};

export type ShiftCertCheckOptions = {
  fromDate?: string;
};

const DEFAULT_FROM_DATE = "2025-07-01";

// =========================================================
//  メイン
// =========================================================

export async function runShiftCertCheck(
  options?: ShiftCertCheckOptions,
): Promise<ShiftCertCheckResult> {
  const fromDate = options?.fromDate ?? DEFAULT_FROM_DATE;

  // ① shift_shift_record_view を取得（資格判定なし）
  const shifts = await fetchShiftShiftRecords(supabaseAdmin, { fromDate });

  if (shifts.length === 0) {
    console.info("[shift_cert_check] no shifts found", { fromDate });
    return { scanned: 0, alertsCreated: 0, alertsUpdated: 0 };
  }

  // ② マスタ（certificate のみ）
  const masterRows = await loadCertificateMaster();

  let alertsCreated = 0;
  let alertsUpdated = 0;

  // ③ 各シフトについて判定
  for (const shift of shifts) {
    const shouldAlert = await shouldAlertForShift(shift, masterRows);

    if (!shouldAlert.shouldAlert) continue;

    const result = await ensureSystemAlert({
      message: shouldAlert.message,
      kaipoke_cs_id: shift.kaipoke_cs_id,
      shift_id: String(shift.shift_id),
      user_id: null,
      rpa_request_id: null,
    });

    if (result.created) alertsCreated++;
    else alertsUpdated++;
  }

  console.info("[shift_cert_check] done", {
    scanned: shifts.length,
    alertsCreated,
    alertsUpdated,
  });

  return {
    scanned: shifts.length,
    alertsCreated,
    alertsUpdated,
  };
}

// =========================================================
//  判定ロジック
// =========================================================

async function shouldAlertForShift(
  shift: ShiftShiftRecordRow,
  masterRows: DocMasterRow[],
): Promise<{ shouldAlert: boolean; message: string }> {
  const staffUserIds = [
    shift.staff_01_user_id,
    shift.staff_02_user_id,
    shift.staff_03_user_id,
  ].filter((id): id is string => !!id);

  if (staffUserIds.length === 0) {
    return {
      shouldAlert: true,
      message: buildAlertMessage(shift, "スタッフが1名も設定されていません"),
    };
  }

  // サービスの必要資格
  const requiredKeys = requiredServiceKeysForService(shift.service_code);

  // 資格が定義されていないサービス → 判定不能 → アラートしない
  if (requiredKeys.length === 0) {
    return { shouldAlert: false, message: "" };
  }

  let okCount = 0;
  const reasons: string[] = [];

  // 各スタッフを判定
  for (const uid of staffUserIds) {
    const certDocs = await loadUserCertDocs(uid);
    const result = judgeUserCertificatesForService(
      certDocs,
      masterRows,
      shift.service_code,
    );

    if (result.ok === true) okCount++;
    if (result.ok === false) {
      reasons.push(`スタッフ ${uid}: ${result.reasons.join(" / ")}`);
    }
  }

  const requiredCount = shift.two_person_work_flg ? 2 : 1;

  if (okCount < requiredCount) {
    const msg = `必要人数 ${requiredCount} 名に対し、資格 OK のスタッフは ${okCount} 名です${
      reasons.length > 0 ? " / " + reasons.join(" / ") : ""
    }`;

    return {
      shouldAlert: true,
      message: buildAlertMessage(shift, msg),
    };
  }

  return { shouldAlert: false, message: "" };
}

// =========================================================
//  各種ロード（Supabase）
// =========================================================

async function loadCertificateMaster(): Promise<DocMasterRow[]> {
  const { data, error } = await supabaseAdmin
    .from("user_doc_master")
    .select("category,label,service_key:doc_group,is_active,sort_order")
    .eq("category", "certificate")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error || !data) {
    console.warn("[shift_cert_check] user_doc_master not available:", error);
    return [];
  }

  return data as DocMasterRow[];
}

async function loadUserCertDocs(userId: string): Promise<DocItemLite[]> {
  // user_id → auth_user_id
  const { data: userRow } = await supabaseAdmin
    .from("users")
    .select("auth_user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!userRow?.auth_user_id) return [];

  const authUid = userRow.auth_user_id as string;

  // form_entries.attachments
  const { data: fe } = await supabaseAdmin
    .from("form_entries")
    .select("attachments")
    .eq("auth_uid", authUid)
    .maybeSingle();

  if (!fe) return [];

  const raw = fe.attachments;
  const atts: Attachment[] = Array.isArray(raw) ? raw : [];

  const pick = atts.filter((a) => {
    const t = (a.type ?? "").toLowerCase();
    const l = (a.label ?? "").toLowerCase();
    return ["資格", "certificate", "certification"].some(
      (k) => t.includes(k) || l.includes(k),
    );
  });

  return pick.map((a) => ({
    label: a.label ?? null,
    type: a.type ?? null,
  })) satisfies DocItemLite[];
}

// =========================================================
//  表示用
// =========================================================

function buildAlertMessage(shift: ShiftShiftRecordRow, reason: string): string {
  const client =
    shift.client_name && shift.client_name.trim().length > 0
      ? shift.client_name
      : "（利用者名なし）";

  const time = extractHHMM(shift.shift_start_time);
  const svc = shift.service_code ?? "サービス不明";

  return `【要確認】シフト資格未整備：${client}（CS ID: ${
    shift.kaipoke_cs_id ?? "不明"
  }） ${shift.shift_start_date}${time} サービス: ${svc} / ${reason}`;
}

function extractHHMM(t: string | null): string {
  if (!t) return "";
  const parts = t.split(":");
  if (parts.length < 2) return "";
  return ` ${parts[0]}:${parts[1]}`;
}
