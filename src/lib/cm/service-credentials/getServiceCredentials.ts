// =============================================================
// src/lib/cm/service-credentials/getServiceCredentials.ts
// サービス認証情報 一覧取得（Server Component用）
// =============================================================

import "server-only";
import { supabaseAdmin } from "@/lib/supabase/service";
import { createLogger } from "@/lib/common/logger";
import type { CmServiceCredentialMasked } from "@/types/cm/serviceCredentials";

const logger = createLogger("lib/cm/service-credentials");

// =============================================================
// Types
// =============================================================

export type GetServiceCredentialsParams = {
  serviceName?: string;
  showInactive?: boolean;
};

export type GetServiceCredentialsResult = {
  ok: true;
  entries: CmServiceCredentialMasked[];
} | {
  ok: false;
  error: string;
};

// =============================================================
// Helper: 機密情報をマスクする
// =============================================================

function maskCredentials(credentials: Record<string, unknown>): Record<string, string> {
  const masked: Record<string, string> = {};
  for (const [key, value] of Object.entries(credentials)) {
    if (value === null || value === undefined) {
      masked[key] = '';
    } else if (typeof value === 'string') {
      // 文字列は最初の4文字以外をマスク
      if (value.length <= 4) {
        masked[key] = '****';
      } else {
        masked[key] = value.substring(0, 4) + '****';
      }
    } else {
      masked[key] = '****';
    }
  }
  return masked;
}

// =============================================================
// 一覧取得（機密情報マスク済み）
// =============================================================

export async function getServiceCredentials(
  params: GetServiceCredentialsParams = {}
): Promise<GetServiceCredentialsResult> {
  const { serviceName = '', showInactive = false } = params;

  try {
    logger.info('サービス認証情報一覧取得', { showInactive, serviceName });

    let query = supabaseAdmin
      .from('cm_rpa_credentials')
      .select('*')
      .order('service_name', { ascending: true });

    if (!showInactive) {
      query = query.eq('is_active', true);
    }

    if (serviceName) {
      query = query.ilike('service_name', `%${serviceName}%`);
    }

    const { data: entries, error } = await query;

    if (error) {
      logger.error('サービス認証情報取得エラー', error);
      return { ok: false, error: 'データ取得に失敗しました' };
    }

    // 機密情報をマスク
    const maskedEntries: CmServiceCredentialMasked[] = (entries || []).map((entry) => {
      const credentials = entry.credentials as Record<string, unknown>;
      return {
        id: entry.id,
        service_name: entry.service_name,
        label: entry.label,
        is_active: entry.is_active,
        created_at: entry.created_at,
        updated_at: entry.updated_at,
        credentials_masked: maskCredentials(credentials),
        credentials_keys: Object.keys(credentials),
      };
    });

    logger.info('サービス認証情報取得完了', { count: maskedEntries.length });

    return { ok: true, entries: maskedEntries };
  } catch (error) {
    logger.error('サービス認証情報取得予期せぬエラー', error);
    return { ok: false, error: 'サーバーエラーが発生しました' };
  }
}
