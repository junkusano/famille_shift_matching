// =============================================================
// src/lib/cm/clients/getClientDetail.ts
// 利用者詳細取得（Server Component用）
// =============================================================

import "server-only";
import { supabaseAdmin } from "@/lib/supabase/service";
import { createLogger } from "@/lib/common/logger";
import type { CmClientDetail } from "@/types/cm/clientDetail";

const logger = createLogger("lib/cm/clients/getClientDetail");

// =============================================================
// Types
// =============================================================

export type GetClientDetailResult = {
  ok: true;
  client: CmClientDetail;
} | {
  ok: false;
  error: string;
};

// =============================================================
// 利用者詳細取得
// =============================================================

export async function getClientDetail(kaipokeCsId: string): Promise<GetClientDetailResult> {
  try {
    logger.info("利用者詳細取得開始", { kaipokeCsId });

    // ---------------------------------------------------------
    // 基本情報取得
    // ---------------------------------------------------------
    const { data: clientData, error: clientError } = await supabaseAdmin
      .from("cm_kaipoke_info")
      .select("*")
      .eq("kaipoke_cs_id", kaipokeCsId)
      .single();

    if (clientError) {
      logger.error("基本情報取得エラー", {
        message: clientError.message,
        code: clientError.code,
      });
      return { ok: false, error: "利用者が見つかりません" };
    }

    // ---------------------------------------------------------
    // 被保険者証情報取得
    // ---------------------------------------------------------
    const { data: insurancesData, error: insurancesError } = await supabaseAdmin
      .from("cm_kaipoke_insurance")
      .select("*")
      .eq("kaipoke_cs_id", kaipokeCsId)
      .order("coverage_start", { ascending: false });

    if (insurancesError) {
      logger.warn("被保険者証情報取得エラー", {
        message: insurancesError.message,
      });
    }

    const insurances = insurancesData ?? [];

    // ---------------------------------------------------------
    // 居宅介護支援事業所情報取得
    // ---------------------------------------------------------
    const insuranceIds = insurances.map((ins) => ins.kaipoke_insurance_id);

    const supportOfficesMap = new Map<string, Record<string, unknown>[]>();
    if (insuranceIds.length > 0) {
      const { data: supportData, error: supportError } = await supabaseAdmin
        .from("cm_kaipoke_support_office")
        .select("*")
        .eq("kaipoke_cs_id", kaipokeCsId)
        .in("kaipoke_insurance_id", insuranceIds)
        .order("apply_start", { ascending: false });

      if (supportError) {
        logger.warn("居宅支援事業所取得エラー", {
          message: supportError.message,
        });
      } else {
        logger.info("居宅支援事業所データ", {
          count: supportData?.length ?? 0,
          careManagers: supportData?.map(o => o.care_manager_name),
        });
        (supportData ?? []).forEach((office) => {
          const insId = office.kaipoke_insurance_id;
          if (!supportOfficesMap.has(insId)) {
            supportOfficesMap.set(insId, []);
          }
          supportOfficesMap.get(insId)!.push(office);
        });
      }
    }

    // ---------------------------------------------------------
    // 給付制限情報取得
    // ---------------------------------------------------------
    const benefitLimitsMap = new Map<string, Record<string, unknown>[]>();
    if (insuranceIds.length > 0) {
      const { data: limitData, error: limitError } = await supabaseAdmin
        .from("cm_kaipoke_benefit_limit")
        .select("*")
        .eq("kaipoke_cs_id", kaipokeCsId)
        .in("kaipoke_insurance_id", insuranceIds)
        .order("limit_start", { ascending: false });

      if (limitError) {
        logger.warn("給付制限取得エラー", {
          message: limitError.message,
        });
      } else {
        (limitData ?? []).forEach((limit) => {
          const insId = limit.kaipoke_insurance_id;
          if (!benefitLimitsMap.has(insId)) {
            benefitLimitsMap.set(insId, []);
          }
          benefitLimitsMap.get(insId)!.push(limit);
        });
      }
    }

    // ---------------------------------------------------------
    // 被保険者証情報にサブテーブルをマージ
    // ---------------------------------------------------------
    const insurancesWithDetails = insurances.map((ins) => ({
      ...ins,
      supportOffices: supportOfficesMap.get(ins.kaipoke_insurance_id) ?? [],
      benefitLimits: benefitLimitsMap.get(ins.kaipoke_insurance_id) ?? [],
    }));

    logger.info("利用者詳細取得完了", {
      kaipokeCsId,
      insuranceCount: insurances.length,
    });

    // ---------------------------------------------------------
    // 結果
    // ---------------------------------------------------------
    return {
      ok: true,
      client: {
        ...clientData,
        insurances: insurancesWithDetails,
      } as CmClientDetail,
    };
  } catch (e) {
    logger.error("例外", e);
    return { ok: false, error: "Internal server error" };
  }
}