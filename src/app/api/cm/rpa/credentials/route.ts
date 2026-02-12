// =============================================================
// src/app/api/cm/rpa/credentials/route.ts
// RPA 認証情報取得 API
// =============================================================

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import { cmRpaApiHandler } from "@/lib/cm/rpa/cmRpaApiHandler";
import type {
  CmRpaServiceName,
  CmRpaCredentialItem,
  CmRpaCredentialsApiResponse,
  CmRpaCredentialRecord,
} from "@/types/cm/rpa";

// =============================================================
// バリデーション
// =============================================================

const VALID_SERVICES: CmRpaServiceName[] = ["kaipoke", "plaud", "colab"];

function cmIsValidService(service: unknown): service is CmRpaServiceName {
  return (
    typeof service === "string" &&
    VALID_SERVICES.includes(service as CmRpaServiceName)
  );
}

// =============================================================
// GET /api/cm/rpa/credentials
// =============================================================

export const GET = cmRpaApiHandler<CmRpaCredentialsApiResponse>(
  "cm/api/rpa/credentials",
  async (request, logger) => {
    const { searchParams } = new URL(request.url);
    const service = searchParams.get("service");

    // バリデーション
    if (!service) {
      return NextResponse.json(
        { ok: false, error: "service parameter required" },
        { status: 400 }
      );
    }

    if (!cmIsValidService(service)) {
      return NextResponse.json(
        {
          ok: false,
          error: `service must be one of: ${VALID_SERVICES.join(", ")}`,
        },
        { status: 400 }
      );
    }

    // DB取得
    const { data, error: selectError } = await supabaseAdmin
      .from("cm_rpa_credentials")
      .select("id, service_name, label, credentials, is_active")
      .eq("service_name", service)
      .eq("is_active", true)
      .order("id", { ascending: true });

    if (selectError) {
      logger.error("認証情報取得エラー", undefined, {
        message: selectError.message,
      });
      return NextResponse.json(
        { ok: false, error: "認証情報の取得に失敗しました" },
        { status: 500 }
      );
    }

    // レスポンス整形
    const credentials: CmRpaCredentialItem[] = (
      data as CmRpaCredentialRecord[]
    ).map((row) => ({
      id: row.id,
      service_name: row.service_name as CmRpaServiceName,
      label: row.label,
      credentials: row.credentials as CmRpaCredentialItem["credentials"],
      is_active: row.is_active,
    }));

    return NextResponse.json({
      ok: true,
      credentials,
    });
  }
);