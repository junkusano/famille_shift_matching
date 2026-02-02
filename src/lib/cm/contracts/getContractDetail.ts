// =============================================================
// src/lib/cm/contracts/getContractDetail.ts
// 契約詳細取得（Server Action — Client Componentから呼び出し可能）
// =============================================================

"use server";

import { supabaseAdmin } from "@/lib/supabase/service";
import { createLogger } from "@/lib/common/logger";
import type {
  CmContractDetailData,
  CmContractDocument,
  CmContractConsent,
} from "@/types/cm/contract";

const logger = createLogger("lib/cm/contracts/getContractDetail");

// =============================================================
// Types
// =============================================================

export type GetContractDetailResult =
  | { ok: true; data: CmContractDetailData }
  | { ok: false; error: string };

// =============================================================
// 契約詳細取得
// =============================================================

export async function getContractDetail(
  contractId: string
): Promise<GetContractDetailResult> {
  try {
    logger.info("契約詳細取得開始", { contractId });

    // ---------------------------------------------------------
    // 契約取得
    // ---------------------------------------------------------
    const { data: contract, error: contractError } = await supabaseAdmin
      .from("cm_contracts")
      .select(`
        *,
        cm_contract_verification_methods ( id, code, name ),
        cm_contract_verification_documents ( id, code, name )
      `)
      .eq("id", contractId)
      .maybeSingle();

    if (contractError) {
      logger.error("契約取得エラー", { message: contractError.message });
      return { ok: false, error: contractError.message };
    }

    if (!contract) {
      return { ok: false, error: "契約が見つかりません" };
    }

    // ---------------------------------------------------------
    // 書類一覧取得
    // ---------------------------------------------------------
    const { data: documents, error: docsError } = await supabaseAdmin
      .from("cm_contract_documents")
      .select("*")
      .eq("contract_id", contractId)
      .order("sort_order", { ascending: true });

    if (docsError) {
      logger.warn("書類取得エラー", { message: docsError.message });
    }

    // ---------------------------------------------------------
    // 同意情報取得（紐付けがあれば）
    // ---------------------------------------------------------
    let consent: CmContractConsent | null = null;
    if (contract.consent_record_id) {
      const { data: consentData } = await supabaseAdmin
        .from("cm_contract_consents")
        .select("*")
        .eq("id", contract.consent_record_id)
        .maybeSingle();

      if (consentData) {
        const staffName = await getStaffDisplayName(consentData.staff_id);
        consent = { ...consentData, staff_name: staffName } as CmContractConsent;
      }
    }

    // ---------------------------------------------------------
    // 録音情報取得（紐付けがあれば）
    // ---------------------------------------------------------
    let plaudRecording = null;
    if (contract.plaud_recording_id) {
      const { data: plaudData } = await supabaseAdmin
        .from("cm_plaud_mgmt_transcriptions")
        .select("id, plaud_uuid, title, plaud_created_at, status")
        .eq("id", contract.plaud_recording_id)
        .maybeSingle();
      plaudRecording = plaudData;
    }

    // ---------------------------------------------------------
    // 担当職員名取得
    // ---------------------------------------------------------
    const staffName = await getStaffDisplayName(contract.staff_id);

    // ---------------------------------------------------------
    // 利用者名取得
    // ---------------------------------------------------------
    const { data: clientData } = await supabaseAdmin
      .from("cm_kaipoke_info")
      .select("name, kana")
      .eq("kaipoke_cs_id", contract.kaipoke_cs_id)
      .maybeSingle();

    // ---------------------------------------------------------
    // リレーション名を変換
    // ---------------------------------------------------------
    type VerificationRelation = { name: string } | null;
    const verMethods = contract.cm_contract_verification_methods as VerificationRelation;
    const verDocs = contract.cm_contract_verification_documents as VerificationRelation;

    logger.info("契約詳細取得完了", {
      contractId,
      documentCount: documents?.length ?? 0,
    });

    return {
      ok: true,
      data: {
        contract: {
          id: contract.id,
          kaipoke_cs_id: contract.kaipoke_cs_id,
          contract_type: contract.contract_type,
          signing_method: contract.signing_method,
          status: contract.status,
          contract_date: contract.contract_date,
          staff_id: contract.staff_id,
          staff_name: staffName,
          consent_record_id: contract.consent_record_id,
          verification_method_id: contract.verification_method_id,
          verification_method_name: verMethods?.name ?? null,
          verification_document_id: contract.verification_document_id,
          verification_document_name: verDocs?.name ?? null,
          verification_document_other: contract.verification_document_other,
          verification_at: contract.verification_at,
          plaud_recording_id: contract.plaud_recording_id,
          signed_at: contract.signed_at,
          completed_at: contract.completed_at,
          created_at: contract.created_at,
          updated_at: contract.updated_at,
          document_count: documents?.length ?? 0,
          client_name: clientData?.name ?? null,
          client_kana: clientData?.kana ?? null,
          notes: contract.notes,
        },
        documents: (documents ?? []) as CmContractDocument[],
        consent,
        plaudRecording,
      },
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
  const { data: userData } = await supabaseAdmin
    .from("users")
    .select("entry_id")
    .eq("user_id", staffId)
    .maybeSingle();

  if (!userData?.entry_id) return null;

  const { data: entryData } = await supabaseAdmin
    .from("form_entries")
    .select("last_name_kanji, first_name_kanji")
    .eq("id", userData.entry_id)
    .maybeSingle();

  if (!entryData) return null;

  return (
    `${entryData.last_name_kanji || ""} ${entryData.first_name_kanji || ""}`.trim() ||
    null
  );
}
