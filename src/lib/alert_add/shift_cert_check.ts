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

// =========================================================
// 型定義
// =========================================================

export type ShiftCertCheckResult = {
  scanned: number;
  alertsCreated: number;
  alertsUpdated: number;
};

export type ShiftCertCheckOptions = {
  fromDate?: string; // 'YYYY-MM-DD'
};

const DEFAULT_FROM_DATE = "2025-07-01";

// ユーザーごとのキャッシュ
const userCertCache = new Map<string, DocItemLite[]>();
const userServiceKeyCache = new Map<string, ServiceKey[]>();

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

  // 行動援護は専用ロジック
  if (serviceCode.includes("行動援護")) {
    return judgeKodoengoShiftCertificates(shift, staffUserIds);
  }

  // それ以外は certificateJudge による資格キー判定
  const requiredKeys = getRequiredKeysFromMaster(serviceCode, masterRows);
  if (requiredKeys.length === 0) {
    // 必要資格がマスタに定義されていない => このサービスはチェック対象外
    return {
      shouldAlert: false,
      message: "",
    };
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
    // ★ ユーザーごとに資格書類をキャッシュ
    const userDocs = await loadUserCertDocs(userId);

    // ★ ユーザーごとに ServiceKey もキャッシュ
    let userKeys = userServiceKeyCache.get(userId);
    if (!userKeys) {
      userKeys = determineServicesFromCertificates(
        userDocs,
        masterRows,
      ) as ServiceKey[];
      userServiceKeyCache.set(userId, userKeys);
    }

    const hasAll = requiredKeys.every((req) => userKeys!.includes(req));
    if (hasAll) {
      okCount += 1;
    } else {
      reasons.push(
        `スタッフ ${userId}: 必要資格キー ${requiredKeys.join(
          ",",
        )} を満たしていません (保持: ${userKeys.join(",") || "なし"})`,
      );
    }
  }

  if (okCount >= requiredStaffCount) {
    return {
      shouldAlert: false,
      message: "",
    };
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

// =========================================================
// 行動援護シフトの専用判定
// =========================================================

async function judgeKodoengoShiftCertificates(
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
    // ★ ここも loadUserCertDocs 経由なので、ユーザーごとにキャッシュされる
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
    return {
      shouldAlert: false,
      message: "",
    };
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
// 資格マスタ取得
// =========================================================

async function loadCertificateMaster(): Promise<DocMasterRow[]> {
  const { data, error } = await supabaseAdmin
    .from("user_doc_master")
    .select(
      `
      id,
      category,
      label,
      service_key:doc_group,
      doc_group,
      is_active,
      sort_order
    `,
    )
    // is_cert カラムは存在しないので、category で絞る
    .eq("category", "certificate");

  if (error || !data) {
    console.error("[shift_cert_check] certificate master load failed:", error);
    return [];
  }

  // certificateJudge.DocMasterRow に合わせて返す
  return data as DocMasterRow[];
}

// =========================================================
// ユーザーの資格書類取得（キャッシュ付き）
// =========================================================

type Attachment = {
  label?: string | null;
  type?: string | null;
};

async function loadUserCertDocs(userId: string): Promise<DocItemLite[]> {
  // ① キャッシュヒットならそのまま返す
  const cached = userCertCache.get(userId);
  if (cached) {
    return cached;
  }

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
    userCertCache.set(userId, []);
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
    userCertCache.set(userId, []);
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

  // ② 取得した結果をキャッシュ
  userCertCache.set(userId, docs);

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
      for (const v of sk) {
        if (typeof v === "string") keys.add(v as ServiceKey);
      }
    }
  }

  return Array.from(keys);
}

function splitKeys(raw: string): string[] {
  return raw
    .split(/[,\u3001、]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// =========================================================
// メッセージ組立
// =========================================================

function buildAlertMessage(
  shift: ShiftShiftRecordRow,
  reason: string,
): string {
  const client = shift.client_name ?? "利用者名不明";
  const time = extractHHMM(shift.shift_start_time);
  const svc = shift.service_code ?? "サービス不明";

  return `【要確認】シフト資格未整備：${client}（CS ID: ${shift.kaipoke_cs_id ?? "不明"
    }） ${shift.shift_start_date}${time} サービス: ${svc} / ${reason}`;
}

function extractHHMM(t: string | null): string {
  if (!t) return "";
  const parts = t.split(":");
  if (parts.length < 2) return "";
  return ` ${parts[0]}:${parts[1]}`;
}
