// =============================================================
// src/lib/cm/contracts/uploadConsentPdf.ts
// 電子契約同意書のPDF生成・Google Driveアップロード・DB登録
//
// 処理フロー:
//   1. フォームデータを受け取る（入力時点のデータをそのまま使用）
//   2. PDF生成
//   3. Google Driveにアップロード
//   4. DBに登録（cm_contract_consents）
//
// v2変更: proxy_* → scribe_*/agent_* フィールド名変更
// =============================================================

'use server';

import { supabaseAdmin } from '@/lib/supabase/service';
import { createLogger } from '@/lib/common/logger';
import { generateConsentPdf } from './generateConsentPdf';
import { uploadConsentPdfToDrive } from './googleDrive';

const logger = createLogger('lib/cm/contracts/uploadConsentPdf');

// =============================================================
// Types
// =============================================================

export type UploadConsentPdfParams = {
  // 利用者情報（フォームに表示されていた値をそのまま渡す）
  kaipokeCsId: string;
  clientName: string;
  clientAddress: string;

  // 同意内容
  consentElectronic: boolean;
  consentRecording: boolean;

  // 立会職員
  staffId: string;
  staffName: string;

  // 署名者情報（v2: 3分類対応）
  signerType: 'self' | 'scribe' | 'agent';

  // 代筆者情報（signerType === 'scribe' の場合）
  scribeName?: string;
  scribeRelationshipCode?: string;
  scribeRelationshipOther?: string;
  scribeReasonCode?: string;
  scribeReasonOther?: string;
  // PDF表示用の表示文字列
  scribeRelationship?: string;
  scribeReason?: string;

  // 代理人情報（signerType === 'agent' の場合）
  agentName?: string;
  agentRelationshipCode?: string;
  agentRelationshipOther?: string;
  agentAuthority?: string;
  // PDF表示用の表示文字列
  agentRelationship?: string;

  // 署名画像（Base64）
  signatureBase64: string;

  // メタ情報
  ipAddress?: string;
  userAgent?: string;
};

export type UploadConsentPdfResult =
  | {
      ok: true;
      data: {
        consentId: string;
        gdriveFileId: string;
        gdriveFileUrl: string;
        gdriveFilePath: string;
      };
    }
  | { ok: false; error: string };

// =============================================================
// メイン関数
// =============================================================

export async function uploadConsentPdf(
  params: UploadConsentPdfParams
): Promise<UploadConsentPdfResult> {
  const {
    kaipokeCsId,
    clientName,
    clientAddress,
    consentElectronic,
    consentRecording,
    staffId,
    staffName,
    signerType,
    // 代筆者
    scribeName,
    scribeRelationshipCode,
    scribeRelationshipOther,
    scribeReasonCode,
    scribeReasonOther,
    scribeRelationship,
    scribeReason,
    // 代理人
    agentName,
    agentRelationshipCode,
    agentRelationshipOther,
    agentAuthority,
    agentRelationship,
    // 共通
    signatureBase64,
    ipAddress,
    userAgent,
  } = params;

  try {
    // ---------------------------------------------------------
    // バリデーション
    // ---------------------------------------------------------
    if (!kaipokeCsId || !staffId || !clientName) {
      return { ok: false, error: '必須項目が不足しています' };
    }

    if (!consentElectronic) {
      return { ok: false, error: '電子契約への同意が必要です' };
    }

    if (signerType === 'scribe' && !scribeName) {
      return { ok: false, error: '代筆者氏名は必須です' };
    }

    if (signerType === 'agent' && !agentName) {
      return { ok: false, error: '代理人氏名は必須です' };
    }

    if (!signatureBase64) {
      return { ok: false, error: '署名が必要です' };
    }

    logger.info('同意書PDF処理開始', {
      kaipokeCsId,
      signerType,
    });

    // ---------------------------------------------------------
    // 同意日時（この時点の日時を記録）
    // ---------------------------------------------------------
    const consentedAt = new Date();

    // ---------------------------------------------------------
    // 1. PDF生成（v2: 3分類対応の引数）
    // ---------------------------------------------------------
    const pdfResult = await generateConsentPdf({
      clientName,
      clientAddress,
      kaipokeCsId,
      consentElectronic,
      consentRecording,
      staffName,
      signerType,
      // 代筆者（PDF表示用の表示文字列を使用）
      scribeName,
      scribeRelationship,
      scribeReason,
      // 代理人
      agentName,
      agentRelationship,
      agentAuthority,
      signatureBase64,
      consentedAt,
    });

    if (pdfResult.ok === false) {
      logger.error('PDF生成失敗', { error: pdfResult.error });
      return { ok: false, error: `PDF生成エラー: ${pdfResult.error}` };
    }

    logger.info('PDF生成完了', {
      kaipokeCsId,
      size: pdfResult.data.buffer.length,
    });

    // ---------------------------------------------------------
    // 2. Google Driveにアップロード
    // ---------------------------------------------------------
    const uploadResult = await uploadConsentPdfToDrive(
      pdfResult.data.buffer,
      clientName,
      kaipokeCsId,
      consentedAt
    );

    if (uploadResult.ok === false) {
      logger.error('Google Driveアップロード失敗', { error: uploadResult.error });
      return { ok: false, error: `アップロードエラー: ${uploadResult.error}` };
    }

    const { fileId, fileUrl, filePath } = uploadResult.data;

    logger.info('Google Driveアップロード完了', {
      kaipokeCsId,
      fileId,
    });

    // ---------------------------------------------------------
    // 3. DBに登録（v2: proxy_* → scribe_*/agent_* カラム名変更）
    // ---------------------------------------------------------
    const { data: consentData, error: consentError } = await supabaseAdmin
      .from('cm_contract_consents')
      .insert({
        kaipoke_cs_id: kaipokeCsId,
        consent_electronic: consentElectronic,
        consent_recording: consentRecording,
        signer_type: signerType,
        // 代筆者情報
        scribe_name: signerType === 'scribe' ? scribeName : null,
        scribe_relationship_code: signerType === 'scribe' ? scribeRelationshipCode : null,
        scribe_relationship_other: signerType === 'scribe' ? scribeRelationshipOther || null : null,
        scribe_reason_code: signerType === 'scribe' ? scribeReasonCode : null,
        scribe_reason_other: signerType === 'scribe' ? scribeReasonOther || null : null,
        // 代理人情報
        agent_name: signerType === 'agent' ? agentName : null,
        agent_relationship_code: signerType === 'agent' ? agentRelationshipCode : null,
        agent_relationship_other: signerType === 'agent' ? agentRelationshipOther || null : null,
        agent_authority: signerType === 'agent' ? agentAuthority : null,
        // ファイル情報
        staff_id: staffId,
        gdrive_file_id: fileId,
        gdrive_file_url: fileUrl,
        gdrive_file_path: filePath,
        consented_at: consentedAt.toISOString(),
        ip_address: ipAddress ?? null,
        user_agent: userAgent ?? null,
      })
      .select('id')
      .single();

    if (consentError) {
      logger.error('同意レコード登録エラー', { message: consentError.message });
      // Note: Google Driveにはアップロード済みだが、DBエラーの場合
      // 孤立ファイルが残る可能性がある（手動対応が必要）
      return { ok: false, error: `DB登録エラー: ${consentError.message}` };
    }

    logger.info('同意レコード登録完了', {
      consentId: consentData.id,
      kaipokeCsId,
    });

    // ---------------------------------------------------------
    // 成功
    // ---------------------------------------------------------
    return {
      ok: true,
      data: {
        consentId: consentData.id,
        gdriveFileId: fileId,
        gdriveFileUrl: fileUrl,
        gdriveFilePath: filePath,
      },
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : '不明なエラー';
    logger.error('同意書PDF処理例外', { error: message });
    return { ok: false, error: message };
  }
}