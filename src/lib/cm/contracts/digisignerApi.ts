// =============================================================
// src/lib/cm/contracts/digisignerApi.ts
// DigiSigner API 連携
//
// 処理フロー:
//   1. PDF アップロード → document_id 取得
//   2. 署名リクエスト作成（Text Tags使用）→ signature_request_id + signers 取得
//
// v2変更: 複数署名者ロール対応（signer/scribe/agent/family/care_manager_1）
// =============================================================

import { createLogger } from '@/lib/common/logger';
import { getServiceCredentialValue } from '@/lib/cm/serviceCredentials';
import type { CmDigiSignerResult } from '@/types/cm/contractCreate';

const logger = createLogger('lib/cm/contracts/digisignerApi');

// =============================================================
// 定数
// =============================================================

const DIGISIGNER_API_BASE = 'https://api.digisigner.com';

// =============================================================
// Types
// =============================================================

export type DigiSignerUploadResult =
  | { ok: true; documentId: string }
  | { ok: false; error: string };

export type DigiSignerSignatureRequestResult =
  | { ok: true; data: CmDigiSignerResult }
  | { ok: false; error: string };

type DigiSignerCredentials = {
  apiKey: string;
};

// =============================================================
// 認証情報取得
// =============================================================

async function getDigiSignerCredentials(): Promise<DigiSignerCredentials | null> {
  try {
    const apiKey = await getServiceCredentialValue('digisigner', 'api_key');
    
    if (!apiKey) {
      logger.error('DigiSigner API Key が設定されていません');
      return null;
    }

    return { apiKey };
  } catch (e) {
    logger.error('DigiSigner認証情報取得エラー', e as Error);
    return null;
  }
}

/**
 * Basic認証ヘッダーを生成
 */
function getAuthHeader(apiKey: string): string {
  return 'Basic ' + Buffer.from(apiKey + ':').toString('base64');
}

// =============================================================
// PDF アップロード
// =============================================================

/**
 * PDFをDigiSignerにアップロード
 */
export async function uploadPdfToDigiSigner(
  pdfBuffer: Buffer,
  fileName: string
): Promise<DigiSignerUploadResult> {
  try {
    logger.info('DigiSigner PDF アップロード開始', { fileName, size: pdfBuffer.length });

    const credentials = await getDigiSignerCredentials();
    if (!credentials) {
      return { ok: false, error: 'DigiSigner認証情報が取得できません' };
    }

    // multipart/form-data を構築
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).slice(2);
    
    const bodyParts: (string | Buffer)[] = [];
    bodyParts.push(`--${boundary}\r\n`);
    bodyParts.push(`Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n`);
    bodyParts.push('Content-Type: application/pdf\r\n\r\n');
    
    const bodyStart = Buffer.from(bodyParts.join(''));
    const bodyEnd = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body = Buffer.concat([bodyStart, pdfBuffer, bodyEnd]);

    const response = await fetch(`${DIGISIGNER_API_BASE}/v1/documents`, {
      method: 'POST',
      headers: {
        'Authorization': getAuthHeader(credentials.apiKey),
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body,
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('DigiSigner アップロードエラー', {
        status: response.status,
        error: errorText,
      });
      return { ok: false, error: `アップロード失敗: ${response.status}` };
    }

    const result = await response.json();
    
    if (!result.document_id) {
      logger.error('DigiSigner document_id が返却されません', { result });
      return { ok: false, error: 'document_id が取得できません' };
    }

    logger.info('DigiSigner PDF アップロード完了', { documentId: result.document_id });
    return { ok: true, documentId: result.document_id };
  } catch (e) {
    logger.error('DigiSigner アップロード例外', e as Error);
    return { ok: false, error: 'アップロード処理でエラーが発生しました' };
  }
}

// =============================================================
// 署名リクエスト作成
// =============================================================

/**
 * Text Tags を使用した署名リクエストを作成
 *
 * v2変更: 単一 signerRole → signerRoles 配列で複数署名者を一括登録
 *
 * @param documentId アップロード済みドキュメントID
 * @param signerRoles 署名者ロール配列（Text Tagsで使用したロール名の配列）
 */
export async function createSignatureRequest(
  documentId: string,
  signerRoles: string[] = ['signer']
): Promise<DigiSignerSignatureRequestResult> {
  try {
    logger.info('DigiSigner 署名リクエスト作成開始', { documentId, signerRoles });

    const credentials = await getDigiSignerCredentials();
    if (!credentials) {
      return { ok: false, error: 'DigiSigner認証情報が取得できません' };
    }

    // 署名者配列を構築（ロールごとにダミーメールを割り当て）
    const signers = signerRoles.map((role, index) => ({
      email: `signer${index + 1}@example.local`,
      role,
    }));

    const requestBody = {
      embedded: true,          // 埋め込みモード（メール送信なし）
      send_emails: false,      // メール送信しない
      use_text_tags: true,     // Text Tags を使用
      hide_text_tags: true,    // Text Tags を非表示
      documents: [
        {
          document_id: documentId,
          signers,
        },
      ],
    };

    const response = await fetch(`${DIGISIGNER_API_BASE}/v1/signature_requests`, {
      method: 'POST',
      headers: {
        'Authorization': getAuthHeader(credentials.apiKey),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('DigiSigner 署名リクエスト作成エラー', {
        status: response.status,
        error: errorText,
      });
      return { ok: false, error: `署名リクエスト作成失敗: ${response.status}` };
    }

    const result = await response.json();

    if (!result.signature_request_id) {
      logger.error('DigiSigner signature_request_id が不足', { result });
      return { ok: false, error: '署名リクエストIDが取得できません' };
    }

    // 各署名者の署名URLを抽出（ロールと対応付け）
    const responseSigners = result.documents?.[0]?.signers;
    if (!responseSigners || responseSigners.length === 0) {
      logger.error('DigiSigner 署名者情報が不足', { result });
      return { ok: false, error: '署名者URLが取得できません' };
    }

    const resultSigners: { role: string; signingUrl: string }[] = [];
    for (let i = 0; i < signerRoles.length; i++) {
      const responseSigner = responseSigners[i];
      if (!responseSigner?.sign_document_url) {
        logger.error('DigiSigner 署名URLが不足', { index: i, role: signerRoles[i] });
        return { ok: false, error: `署名者 ${signerRoles[i]} のURLが取得できません` };
      }
      resultSigners.push({
        role: signerRoles[i],
        signingUrl: responseSigner.sign_document_url,
      });
    }

    logger.info('DigiSigner 署名リクエスト作成完了', {
      signatureRequestId: result.signature_request_id,
      signerCount: resultSigners.length,
    });

    return {
      ok: true,
      data: {
        documentId,
        signatureRequestId: result.signature_request_id,
        signers: resultSigners,
      },
    };
  } catch (e) {
    logger.error('DigiSigner 署名リクエスト例外', e as Error);
    return { ok: false, error: '署名リクエスト作成でエラーが発生しました' };
  }
}

// =============================================================
// 一括処理（アップロード → 署名リクエスト）
// =============================================================

/**
 * PDFアップロードから署名リクエスト作成まで一括処理
 *
 * v2変更: signerRole（単一）→ signerRoles（配列）
 */
export async function uploadAndCreateSignatureRequest(
  pdfBuffer: Buffer,
  fileName: string,
  signerRoles: string[] = ['signer']
): Promise<DigiSignerSignatureRequestResult> {
  // 1. アップロード
  const uploadResult = await uploadPdfToDigiSigner(pdfBuffer, fileName);
  if (uploadResult.ok === false) {
    return { ok: false, error: uploadResult.error };
  }

  // 2. 署名リクエスト作成
  return createSignatureRequest(uploadResult.documentId, signerRoles);
}

// =============================================================
// ステータス確認
// =============================================================

/**
 * 署名リクエストのステータスを取得
 */
export async function getSignatureRequestStatus(
  signatureRequestId: string
): Promise<{ ok: true; status: string; completed: boolean } | { ok: false; error: string }> {
  try {
    const credentials = await getDigiSignerCredentials();
    if (!credentials) {
      return { ok: false, error: 'DigiSigner認証情報が取得できません' };
    }

    const response = await fetch(
      `${DIGISIGNER_API_BASE}/v1/signature_requests/${signatureRequestId}`,
      {
        method: 'GET',
        headers: {
          'Authorization': getAuthHeader(credentials.apiKey),
        },
      }
    );

    if (!response.ok) {
      return { ok: false, error: `ステータス取得失敗: ${response.status}` };
    }

    const result = await response.json();
    const isCompleted = result.is_completed === true;

    return {
      ok: true,
      status: isCompleted ? 'completed' : 'pending',
      completed: isCompleted,
    };
  } catch (e) {
    logger.error('DigiSigner ステータス取得例外', e as Error);
    return { ok: false, error: 'ステータス取得でエラーが発生しました' };
  }
}