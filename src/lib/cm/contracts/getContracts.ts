// =============================================================
// src/lib/cm/contracts/getContracts.ts
// 契約一覧取得（Server Action — Client Componentから呼び出し可能）
// =============================================================

"use server";

import { supabaseAdmin } from "@/lib/supabase/service";
import { createLogger } from "@/lib/common/logger";
import type {
  CmContractListItem,
  CmContractConsent,
  CmClientContractsData,
} from "@/types/cm/contract";

const logger = createLogger("lib/cm/contracts/getContracts");

// =============================================================
// Types
// =============================================================

export type GetContractsResult =
  | { ok: true; data: CmClientContractsData }
  | { ok: false; error: string };

// =============================================================
// 利用者別 契約一覧 + 同意情報
// =============================================================

export async function getContracts(
  kaipokeCsId: string
): Promise<GetContractsResult> {
  try {
    if (!kaipokeCsId) {
      return { ok: false, error: "kaipoke_cs_id is required" };
    }

    logger.info("契約一覧取得開始", { kaipokeCsId });

    // ---------------------------------------------------------
    // 同意情報取得（最新1件）
    // ---------------------------------------------------------
    const { data: consentData, error: consentError } = await supabaseAdmin
      .from("cm_contract_consents")
      .select("*")
      .eq("kaipoke_cs_id", kaipokeCsId)
      .order("consented_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (consentError) {
      logger.warn("同意情報取得エラー", { message: consentError.message });
    }

    // 同意の立会職員名を取得
    let consent: CmContractConsent | null = null;
    if (consentData) {
      const staffName = await getStaffDisplayName(consentData.staff_id);
      consent = {
        ...consentData,
        staff_name: staffName,
      } as CmContractConsent;
    }

    // ---------------------------------------------------------
    // 契約一覧取得
    // ---------------------------------------------------------
    const { data: contractsData, error: contractsError } = await supabaseAdmin
      .from("cm_contracts")
      .select(`
        *,
        cm_contract_verification_methods ( name ),
        cm_contract_verification_documents ( name )
      `)
      .eq("kaipoke_cs_id", kaipokeCsId)
      .order("created_at", { ascending: false });

    if (contractsError) {
      logger.error("契約一覧取得エラー", { message: contractsError.message });
      return { ok: false, error: contractsError.message };
    }

    const contracts = contractsData ?? [];

    // ---------------------------------------------------------
    // 書類数カウント取得
    // ---------------------------------------------------------
    const contractIds = contracts.map((c) => c.id);
    const documentCountMap = new Map<string, number>();

    if (contractIds.length > 0) {
      const { data: docsData, error: docsError } = await supabaseAdmin
        .from("cm_contract_documents")
        .select("contract_id")
        .in("contract_id", contractIds);

      if (docsError) {
        logger.warn("書類数取得エラー", { message: docsError.message });
      } else {
        (docsData ?? []).forEach((doc) => {
          const current = documentCountMap.get(doc.contract_id) ?? 0;
          documentCountMap.set(doc.contract_id, current + 1);
        });
      }
    }

    // ---------------------------------------------------------
    // 担当職員名を一括取得
    // ---------------------------------------------------------
    const staffIds = [...new Set(contracts.map((c) => c.staff_id))];
    const staffNameMap = await getStaffDisplayNames(staffIds);

    // ---------------------------------------------------------
    // レスポンス整形
    // ---------------------------------------------------------
    type VerificationRelation = { name: string } | null;

    const contractsList: CmContractListItem[] = contracts.map((c) => {
      const verMethods = c.cm_contract_verification_methods as VerificationRelation;
      const verDocs = c.cm_contract_verification_documents as VerificationRelation;

      return {
        id: c.id,
        kaipoke_cs_id: c.kaipoke_cs_id,
        contract_type: c.contract_type,
        signing_method: c.signing_method,
        status: c.status,
        contract_date: c.contract_date,
        staff_id: c.staff_id,
        staff_name: staffNameMap.get(c.staff_id) ?? null,
        consent_record_id: c.consent_record_id,
        verification_method_id: c.verification_method_id,
        verification_method_name: verMethods?.name ?? null,
        verification_document_id: c.verification_document_id,
        verification_document_name: verDocs?.name ?? null,
        plaud_recording_id: c.plaud_recording_id,
        signed_at: c.signed_at,
        completed_at: c.completed_at,
        created_at: c.created_at,
        updated_at: c.updated_at,
        document_count: documentCountMap.get(c.id) ?? 0,
      };
    });

    logger.info("契約一覧取得完了", {
      kaipokeCsId,
      contractCount: contractsList.length,
      hasConsent: !!consent,
    });

    return {
      ok: true,
      data: { consent, contracts: contractsList },
    };
  } catch (e) {
    logger.error("予期せぬエラー", e as Error);
    return { ok: false, error: "サーバーエラーが発生しました" };
  }
}

// =============================================================
// ヘルパー
// =============================================================

async function getStaffDisplayName(staffId: string): Promise<string | null> {
  const map = await getStaffDisplayNames([staffId]);
  return map.get(staffId) ?? null;
}

async function getStaffDisplayNames(
  staffIds: string[]
): Promise<Map<string, string>> {
  const staffNameMap = new Map<string, string>();
  if (staffIds.length === 0) return staffNameMap;

  const { data: usersData } = await supabaseAdmin
    .from("users")
    .select("user_id, entry_id")
    .in("user_id", staffIds);

  if (!usersData || usersData.length === 0) return staffNameMap;

  const entryIds = usersData
    .map((u) => u.entry_id)
    .filter((id): id is string => id != null);

  if (entryIds.length === 0) return staffNameMap;

  const { data: entriesData } = await supabaseAdmin
    .from("form_entries")
    .select("id, last_name_kanji, first_name_kanji")
    .in("id", entryIds);

  const entryNameMap = new Map<string, string>();
  (entriesData ?? []).forEach((e) => {
    entryNameMap.set(
      e.id,
      `${e.last_name_kanji || ""} ${e.first_name_kanji || ""}`.trim()
    );
  });

  usersData.forEach((u) => {
    if (u.entry_id && entryNameMap.has(u.entry_id)) {
      staffNameMap.set(u.user_id, entryNameMap.get(u.entry_id)!);
    }
  });

  return staffNameMap;
}
