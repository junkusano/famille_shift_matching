// =============================================================
// src/app/api/cm/fax/pdf/[fileId]/route.ts
// FAX PDF取得API（Google Drive経由）
// =============================================================

import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { createLogger } from '@/lib/common/logger';
import { supabaseAdmin } from '@/lib/supabase/service';

// =============================================================
// Logger
// =============================================================

const logger = createLogger('cm/api/fax/pdf');

// =============================================================
// GET: PDF取得
// =============================================================

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  try {
    const { fileId } = await params;
    const url = req.url; // ESLint対策

    logger.info('PDF取得開始', { fileId, url });

    // ---------------------------------------------------------
    // バリデーション
    // ---------------------------------------------------------
    if (!fileId) {
      return NextResponse.json(
        { ok: false, error: 'fileIdが必要です' },
        { status: 400 }
      );
    }

    // ---------------------------------------------------------
    // Google認証情報取得（Supabase Vault）
    // ---------------------------------------------------------
    const { data: secretData, error: secretError } = await supabaseAdmin.rpc(
      'read_secret',
      { secret_name: 'google_service_account_key' }
    );

    if (secretError || !secretData) {
      logger.error('認証情報取得エラー', {
        message: secretError?.message,
      });
      return NextResponse.json(
        { ok: false, error: '認証情報の取得に失敗しました' },
        { status: 500 }
      );
    }

    // ---------------------------------------------------------
    // Google Driveクライアント作成
    // ---------------------------------------------------------
    const credentials = JSON.parse(secretData);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    });

    const drive = google.drive({ version: 'v3', auth });

    // ---------------------------------------------------------
    // ファイル取得
    // ---------------------------------------------------------
    const fileRes = await drive.files.get(
      {
        fileId,
        alt: 'media',
        supportsAllDrives: true,
      },
      {
        responseType: 'arraybuffer',
      }
    );

    const pdfBuffer = Buffer.from(fileRes.data as ArrayBuffer);

    logger.info('PDF取得完了', { fileId, size: pdfBuffer.length });

    // ---------------------------------------------------------
    // レスポンス
    // ---------------------------------------------------------
    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${fileId}.pdf"`,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (e) {
    logger.error('例外', e);

    // Google APIエラーの判定
    if (e instanceof Error) {
      if (e.message.includes('not found') || e.message.includes('404')) {
        return NextResponse.json(
          { ok: false, error: 'ファイルが見つかりません' },
          { status: 404 }
        );
      }

      if (e.message.includes('permission') || e.message.includes('403')) {
        return NextResponse.json(
          { ok: false, error: 'ファイルへのアクセス権限がありません' },
          { status: 403 }
        );
      }
    }

    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
