// =============================================================
// src/app/api/cm/rpa/credentials/route.ts
// RPA 認証情報取得 API
// =============================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/service';
import type {
  CmRpaServiceName,
  CmRpaCredentialItem,
  CmRpaCredentialsApiResponse,
  CmRpaCredentialRecord,
} from '@/types/cm/rpa';

// =============================================================
// APIキー認証
// =============================================================

async function validateApiKey(request: NextRequest): Promise<boolean> {
  const apiKey = request.headers.get('x-api-key');
  
  if (!apiKey) {
    return false;
  }

  const { data, error } = await supabaseAdmin
    .from('cm_rpa_api_keys')
    .select('id')
    .eq('api_key', apiKey)
    .eq('is_active', true)
    .limit(1)
    .single();

  if (error || !data) {
    return false;
  }

  return true;
}

// =============================================================
// バリデーション
// =============================================================

const VALID_SERVICES: CmRpaServiceName[] = ['kaipoke', 'plaud', 'colab'];

function isValidService(service: unknown): service is CmRpaServiceName {
  return typeof service === 'string' && VALID_SERVICES.includes(service as CmRpaServiceName);
}

// =============================================================
// GET /api/cm/rpa/credentials
// =============================================================

export async function GET(request: NextRequest): Promise<NextResponse<CmRpaCredentialsApiResponse>> {
  try {
    // 1. APIキー認証
    const isValid = await validateApiKey(request);
    if (!isValid) {
      return NextResponse.json(
        { ok: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // 2. クエリパラメータ取得
    const { searchParams } = new URL(request.url);
    const service = searchParams.get('service');

    // 3. バリデーション
    if (!service) {
      return NextResponse.json(
        { ok: false, error: 'service parameter required' },
        { status: 400 }
      );
    }

    if (!isValidService(service)) {
      return NextResponse.json(
        { ok: false, error: `service must be one of: ${VALID_SERVICES.join(', ')}` },
        { status: 400 }
      );
    }

    // 4. DB取得
    const { data, error: selectError } = await supabaseAdmin
      .from('cm_rpa_credentials')
      .select('id, service_name, label, credentials, is_active')
      .eq('service_name', service)
      .eq('is_active', true)
      .order('id', { ascending: true });

    if (selectError) {
      console.error('[RPA credentials] DB select error:', selectError);
      return NextResponse.json(
        { ok: false, error: '認証情報の取得に失敗しました' },
        { status: 500 }
      );
    }

    // 5. レスポンス整形
    const credentials: CmRpaCredentialItem[] = (data as CmRpaCredentialRecord[]).map((row) => ({
      id: row.id,
      service_name: row.service_name as CmRpaServiceName,
      label: row.label,
      credentials: row.credentials as CmRpaCredentialItem['credentials'],
      is_active: row.is_active,
    }));

    // 6. 成功レスポンス
    return NextResponse.json({
      ok: true,
      credentials,
    });

  } catch (error) {
    console.error('[RPA credentials] Unexpected error:', error);
    return NextResponse.json(
      { ok: false, error: '予期せぬエラーが発生しました' },
      { status: 500 }
    );
  }
}