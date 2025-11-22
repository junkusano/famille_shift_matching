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
  type ServiceKey,
  determineServicesFromCertificates,
} from "@/lib/certificateJudge";

// Attachments 型（ShiftCard と同じ構造を想定）
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
  fromDate?: string; // 'YYYY-MM-DD'
};

const DEFAULT_FROM_DATE = "2025-07-01";

// =========================================================
// メイン
// =========================================================

export async function runShiftCertCheck(
  options?: ShiftCertCheckOptions,
): Promise<ShiftCertCheckResult> {
  const fromDate = options?.fromDate ?? DEFAULT_FROM_DATE;

  const shifts = await fetchShiftShiftRecords(supabaseAdmin, { fromDate });
  if (shifts.length === 0) {
    console.info("[shift_cert_check] no shifts found", { fromDate });
    return { scanned: 0, alertsCreated: 0, alertsUpdated: 0 };
  }

  const masterRows = await loadCertificateMaster();
  if (masterRows.length === 0) {
    console.warn(
      "[shift_cert_check] certificate master is empty; skip all checks",
    );
    return { scanned: shifts.length, alertsCreated: 0, alertsUpdated: 0 };
  }

  let alertsCreated = 0;
  let alertsUpdated = 0;

  for (const shift of shifts) {
    const judgement = await judgeShiftCertificates(shift, masterRows);

    if (!judgement.shouldAlert) continue;

    const result = await ensureSystemAlert({
      message: judgement.message,
      kaipoke_cs_id: shift.kaipoke_cs_id,
      shift_id: String(shift.shift_id),
      user_id: null,
      rpa_request_id: null,
    });

    if (result.created) alertsCreated += 1;
    else alertsUpdated += 1;
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
// シフト1件分の判定
// =========================================================

async function judgeShiftCertificates(
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

  const serviceCode = shift.service_code ?? "";

  // ★ 行動援護だけは「行動援護（実務経験証明書）」必須で特別扱い
  if (serviceCode === "行動援護") {
    return judgeKodoengoShift(shift, staffUserIds);
  }

  // それ以外のサービスコードは、マスタの doc_group ベースで汎用判定
  const requiredKeys = getRequiredKeysFromMaster(serviceCode, masterRows);

  // 必要資格キーが未定義なサービスはチェック対象外（アラートしない）
  if (requiredKeys.length === 0) {
    return { shouldAlert: false, message: "" };
  }

  const baseByTwoPerson = shift.two_person_work_flg ? 2 : 1;
  const fromColumn =
    shift.required_staff_count && shift.required_staff_count > 0
      ? shift.required_staff_count
      : 1;
  const requiredStaffCount = Math.max(baseByTwoPerson, fromColumn);

  let okCount = 0;
  const reasons: string[] = [];

  for (const userId of staffUserIds) {
    const userDocs = await loadUserCertDocs(userId);
    const userKeys = determineServicesFromCertificates(
      userDocs,
      masterRows,
    ) as ServiceKey[];

    if (!userKeys || userKeys.length === 0) {
      reasons.push(`スタッフ ${userId}: 資格証明書が登録されていません`);
      continue;
    }

    const hasRequired = requiredKeys.some((rk) => userKeys.includes(rk));
    if (hasRequired) {
      okCount += 1;
    } else {
      reasons.push(
        `スタッフ ${userId}: 必要な資格キー(${requiredKeys.join(
          ", ",
        )})を保有していません`,
      );
    }
  }

  if (okCount >= requiredStaffCount) {
    return { shouldAlert: false, message: "" };
  }

  const reasonText = [
    `必要人数 ${requiredStaffCount} 名に対し、資格 OK のスタッフは ${okCount} 名です`,
    ...reasons,
  ].join(" / ");

  return {
    shouldAlert: true,
    message: buildAlertMessage(shift, reasonText),
  };
}

// ★ 行動援護専用ロジック
async function judgeKodoengoShift(
  shift: ShiftShiftRecordRow,
  staffUserIds: string[],
): Promise<{ shouldAlert: boolean; message: string }> {
  const baseByTwoPerson = shift.two_person_work_flg ? 2 : 1;
  const fromColumn =
    shift.required_staff_count && shift.required_staff_count > 0
      ? shift.required_staff_count
      : 1;
  const requiredStaffCount = Math.max(baseByTwoPerson, fromColumn);

  let okCount = 0;
  const reasons: string[] = [];

  for (const userId of staffUserIds) {
    const userDocs = await loadUserCertDocs(userId);

    // ラベルに「行動援護（実務経験証明書）」を含む資格があるかどうかだけを見る
    const hasJitsumu = userDocs.some((d) => {
      const label = (d.label ?? "").replace(/\s/g, "");
      return label.includes("行動援護（実務経験証明書".replace(/\s/g, ""));
    });

    if (hasJitsumu) {
      okCount += 1;
    } else {
      reasons.push(
        `スタッフ ${userId}: 行動援護（実務経験証明書）が登録されていません`,
      );
    }
  }

  if (okCount >= requiredStaffCount) {
    return { shouldAlert: false, message: "" };
  }

  const reasonText = [
    `必要人数 ${requiredStaffCount} 名に対し、行動援護（実務経験証明書）を持つスタッフは ${okCount} 名です`,
    ...reasons,
  ].join(" / ");

  return {
    shouldAlert: true,
    message: buildAlertMessage(shift, reasonText),
  };
}

// =========================================================
// Supabase アクセス
// =========================================================

async function loadCertificateMaster(): Promise<DocMasterRow[]> {
  const { data, error } = await supabaseAdmin
    .from("user_doc_master")
    .select("category,label,is_active,sort_order,service_key:doc_group")
    .eq("category", "certificate")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error || !data) {
    console.warn("[shift_cert_check] user_doc_master load failed:", error);
    return [];
  }

  return data as DocMasterRow[];
}

async function loadUserCertDocs(userId: string): Promise<DocItemLite[]> {
  const { data: userRow, error: userError } = await supabaseAdmin
    .from("users")
    .select("auth_user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (userError || !userRow?.auth_user_id) {
    console.warn("[shift_cert_check] users row not found for user_id", {
      userId,
      error: userError?.message,
    });
    return [];
  }

  const authUid = userRow.auth_user_id as string;

  const { data: feRow, error: feError } = await supabaseAdmin
    .from("form_entries")
    .select("attachments")
    .eq("auth_uid", authUid)
    .maybeSingle();

  if (feError || !feRow) {
    console.warn("[shift_cert_check] form_entries row not found", {
      userId,
      authUid,
      error: feError?.message,
    });
    return [];
  }

  const raw = feRow.attachments;
  const attachments: Attachment[] = Array.isArray(raw) ? raw : [];

  const isCert = (a: Attachment | null | undefined): a is Attachment => {
    if (!a) return false;
    const t = (a.type ?? "").toLowerCase();
    const l = (a.label ?? "").toLowerCase();
    return ["資格", "certificate", "certification"].some(
      (k) => t.includes(k) || l.includes(k),
    );
  };

  const certAtts = attachments.filter(isCert);

  const docs: DocItemLite[] = certAtts.map((a) => ({
    label: a.label ?? null,
    type: a.type ?? "資格証明書",
  }));

  return docs;
}

// =========================================================
// 必要資格キー推定（行動援護以外）
// =========================================================

function getRequiredKeysFromMaster(
  serviceCode: string,
  masterRows: DocMasterRow[],
): ServiceKey[] {
  const code = serviceCode.trim();
  if (!code) return [];

  const keys = new Set<ServiceKey>();

  for (const row of masterRows) {
    const label = (row.label ?? "").trim();
    if (!label) continue;

    if (!label.includes(code)) continue;

    const sk = row.service_key;
    if (!sk) continue;

    if (typeof sk === "string") {
      for (const v of splitKeys(sk)) keys.add(v as ServiceKey);
    } else if (Array.isArray(sk)) {
      for (const s of sk) {
        for (const v of splitKeys(s)) keys.add(v as ServiceKey);
      }
    }
  }

  return Array.from(keys);
}

function splitKeys(raw: string): string[] {
  const s = raw.trim();
  if (!s) return [];
  return s
    .split(/[\/,、・\s　]+/)
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

// =========================================================
// 表示用
// =========================================================

function buildAlertMessage(
  shift: ShiftShiftRecordRow,
  reason: string,
): string {
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
