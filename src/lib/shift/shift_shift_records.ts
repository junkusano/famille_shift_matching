// /src/lib/shift/shift_shift_records.ts

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ServiceKey,
  DocMasterRow,
  DocItemLite,
} from "@/lib/certificateJudge";
import { determineServicesFromCertificates } from "@/lib/certificateJudge";

// =============================================
// A) View Row 型定義
//    - public.shift_shift_record_view の 1 行想定
// =============================================

export type ShiftShiftRecordRow = {
  shift_id: number;
  kaipoke_cs_id: string | null;
  client_name: string | null;

  shift_start_date: string; // 'YYYY-MM-DD'
  shift_start_time: string | null;
  shift_end_date: string | null;
  shift_end_time: string | null;

  service_code: string | null;

  staff_01_user_id: string | null;
  staff_02_user_id: string | null;
  staff_03_user_id: string | null;

  staff_02_attend_flg: boolean | null;
  staff_03_attend_flg: boolean | null;

  update_at: string | null;
  created_at: string;

  head_shift_id: string | null;

  required_staff_count: number;
  two_person_work_flg: boolean;

  staff_01_role_code: string | null;
  staff_02_role_code: string | null;
  staff_03_role_code: string | null;

  judo_ido: string | null;
  tokutei_comment: string | null;

  record_id: string | null;
  record_status: string | null;
  record_created_by: string | null;
  record_created_at: string | null;
  // record_updated_at を view に追加したらここにも追加
};

// =============================================
// B) 検索パラメータ
// =============================================

export type FetchShiftShiftRecordParams = {
  /** 期間 From（shift_start_date, 含む） */
  fromDate?: string; // 'YYYY-MM-DD'
  /** 期間 To（shift_start_date, 含む） */
  toDate?: string; // 'YYYY-MM-DD'
  /** CS 絞り込み */
  kaipokeCsId?: string;
  /** record_status 絞り込み（null 含むパターンは呼び出し側で調整） */
  recordStatusIn?: string[];
};

// =============================================
// C) 資格判定コンテキスト（呼び出し側で実装）
// =============================================

export type ShiftCertContext = {
  /** 資格マスタ（doc_master）的なテーブルの全件 or 有効分 */
  getDocMaster(): Promise<DocMasterRow[]>;

  /** 特定 user_id の資格ドキュメント一覧（有効分のみなど） */
  getCertDocsForUser(userId: string): Promise<DocItemLite[]>;

  /**
   * シフト（service_code 等）から、このシフトで必要な ServiceKey の集合を返す
   * 例: 行動援護 → ['mobility'] など
   */
  getRequiredServiceKeysForShift(
    row: ShiftShiftRecordRow,
  ): Promise<ServiceKey[]>;
};

// =============================================
// D) 判定結果の型
// =============================================

export type StaffCertJudge = {
  user_id: string | null;
  ok: boolean | null; // null: 判定不能（ユーザーなし or 必要キーなし等）
  reasons: string[];
  /** そのスタッフがカバーできるサービスキー */
  serviceKeys?: ServiceKey[];
};

export type ShiftCertJudgeSummary = {
  overallOk: boolean | null; // null: 判定不能
  reasons: string[];
  requiredStaffCount: number;
  twoPersonWork: boolean;
  okStaffCount: number;
};

export type ShiftWithCert = ShiftShiftRecordRow & {
  staff01Cert?: StaffCertJudge;
  staff02Cert?: StaffCertJudge;
  staff03Cert?: StaffCertJudge;
  certSummary?: ShiftCertJudgeSummary;
};

// =============================================
// E) シフト＋レコード view の取得（純粋なフェッチ）
// =============================================

/**
 * shift_shift_record_view から Row を取得する関数
 * - SupabaseClient は呼び出し側から渡す（supabaseAdmin でも browser client でも OK）
 */
export async function fetchShiftShiftRecords(
  supabase: SupabaseClient,
  params: FetchShiftShiftRecordParams = {},
): Promise<ShiftShiftRecordRow[]> {
  const { fromDate, toDate, kaipokeCsId, recordStatusIn } = params;

  let query = supabase
    .from("shift_shift_record_view")
    .select("*")
    .order("shift_start_date", { ascending: true })
    .order("shift_start_time", { ascending: true });

  if (kaipokeCsId) {
    query = query.eq("kaipoke_cs_id", kaipokeCsId);
  }
  if (fromDate) {
    query = query.gte("shift_start_date", fromDate);
  }
  if (toDate) {
    query = query.lte("shift_start_date", toDate);
  }
  if (recordStatusIn && recordStatusIn.length > 0) {
    query = query.in("record_status", recordStatusIn);
  }

  const { data, error } = await query;

  if (error) {
    // eslint-disable-next-line no-console
    console.error("[shift_shift_records] select error", error);
    throw new Error(
      `Failed to fetch shift_shift_record_view: ${error.message}`,
    );
  }

  if (!data) {
    return [];
  }

  return data as ShiftShiftRecordRow[];
}

// =============================================
// F) 資格判定付きで取得するラッパ
// =============================================

export async function fetchShiftShiftRecordsWithCert(
  supabase: SupabaseClient,
  params: FetchShiftShiftRecordParams,
  certCtx: ShiftCertContext,
): Promise<ShiftWithCert[]> {
  const rows = await fetchShiftShiftRecords(supabase, params);
  if (rows.length === 0) return [];

  // 1) マスタ取得（1回だけ）
  const masterRows = await certCtx.getDocMaster();

  // 2) 対象となる全 user_id をユニーク抽出
  const userIds = new Set<string>();
  rows.forEach((r) => {
    if (r.staff_01_user_id) userIds.add(r.staff_01_user_id);
    if (r.staff_02_user_id) userIds.add(r.staff_02_user_id);
    if (r.staff_03_user_id) userIds.add(r.staff_03_user_id);
  });

  // 3) user_id → ServiceKey[] のマップを事前に構築
  const userServiceKeyMap = new Map<string, ServiceKey[]>();

  const userIdList = Array.from(userIds);
  // 並列取得
  await Promise.all(
    userIdList.map(async (userId) => {
      try {
        const docs = await certCtx.getCertDocsForUser(userId);
        const keys = determineServicesFromCertificates(docs, masterRows);
        userServiceKeyMap.set(userId, keys);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("[shift_shift_records] cert calc error", {
          userId,
          error: e,
        });
      }
    }),
  );

  // 4) 各シフトごとに requiredServiceKeys を取得し、スタッフごとの判定を行う
  const result: ShiftWithCert[] = [];

  // requiredKeys がシフトごとに変わる前提で、ループ内で取得
  for (const row of rows) {
    const requiredKeys = await certCtx.getRequiredServiceKeysForShift(row);

    const staff01 = judgeStaffForShift(
      row.staff_01_user_id,
      requiredKeys,
      userServiceKeyMap,
      "01",
    );
    const staff02 = judgeStaffForShift(
      row.staff_02_user_id,
      requiredKeys,
      userServiceKeyMap,
      "02",
    );
    const staff03 = judgeStaffForShift(
      row.staff_03_user_id,
      requiredKeys,
      userServiceKeyMap,
      "03",
    );

    const summary = summarizeShiftJudge(row, [staff01, staff02, staff03]);

    result.push({
      ...row,
      staff01Cert: staff01,
      staff02Cert: staff02,
      staff03Cert: staff03,
      certSummary: summary,
    });
  }

  return result;
}

// =============================================
// G) 内部ユーティリティ
// =============================================

function judgeStaffForShift(
  userId: string | null,
  requiredKeys: ServiceKey[],
  userServiceKeyMap: Map<string, ServiceKey[]>,
  staffLabel: "01" | "02" | "03",
): StaffCertJudge {
  if (!userId) {
    return {
      user_id: null,
      ok: null,
      reasons: [`スタッフ${staffLabel} が未設定です`],
    };
  }

  const staffKeys = userServiceKeyMap.get(userId);

  if (requiredKeys.length === 0) {
    return {
      user_id: userId,
      ok: null,
      reasons: [`シフトの必要資格キーが未定義のため、判定できません`],
      serviceKeys: staffKeys,
    };
  }

  if (!staffKeys || staffKeys.length === 0) {
    return {
      user_id: userId,
      ok: false,
      reasons: [`スタッフ${staffLabel}（${userId}）に有効な資格が登録されていません`],
      serviceKeys: staffKeys,
    };
  }

  const matched = requiredKeys.some((k) => staffKeys.includes(k));

  return {
    user_id: userId,
    ok: matched,
    reasons: matched
      ? []
      : [
          `スタッフ${staffLabel}（${userId}）は必要な資格キーを保有していません`,
        ],
    serviceKeys: staffKeys,
  };
}

function summarizeShiftJudge(
  row: ShiftShiftRecordRow,
  staffJudges: StaffCertJudge[],
): ShiftCertJudgeSummary {
  const baseByTwoPerson = row.two_person_work_flg ? 2 : 1;
  const countFromColumn =
    row.required_staff_count && row.required_staff_count > 0
      ? row.required_staff_count
      : 1;

  const requiredStaffCount = Math.max(baseByTwoPerson, countFromColumn);

  const okStaffCount = staffJudges.filter((j) => j.ok === true).length;

  const reasons: string[] = [];

  staffJudges.forEach((j) => {
    if (j.ok === false) {
      reasons.push(...j.reasons);
    }
  });

  if (okStaffCount < requiredStaffCount) {
    reasons.push(
      `必要人数 ${requiredStaffCount} 名に対して、資格 OK のスタッフは ${okStaffCount} 名です`,
    );
  }

  let overallOk: boolean | null = true;
  if (okStaffCount < requiredStaffCount) {
    overallOk = false;
  }

  return {
    overallOk,
    reasons,
    requiredStaffCount,
    twoPersonWork: row.two_person_work_flg,
    okStaffCount,
  };
}
