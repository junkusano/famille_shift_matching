// =============================================================
// src/lib/cm/contracts/createContract.ts
// 契約作成 統合処理（Server Action）
//
// 処理フロー:
//   1. cm_contracts にレコード作成（status: draft）
//   2. DBからHTMLテンプレート取得
//   3. タグ置換（利用者情報・事業所情報等）
//   4. HTML → pdfkit PDF生成（DigiSigner Text Tags対応）
//   5. DigiSignerにアップロード＆署名リクエスト作成
//   6. cm_contract_documents にレコード作成
//   7. 結果返却
// =============================================================

'use server';

import { supabaseAdmin } from '@/lib/supabase/service';
import { createLogger } from '@/lib/common/logger';
import { generateCombinedPdfFromHtml } from './generateContractPdf';
import { getTemplateHtml } from './templateActions';
import { uploadAndCreateSignatureRequest } from './digisignerApi';
import { getTemplateByCode } from './templates';
import { getStaffName } from './getClientInfoForContract';
import { getDefaultOwnOffice } from '@/lib/cm/master/getOwnOffice';
import { getSelectOptionsMultiple } from '@/lib/cm/master/getSelectOptions';
import type {
  CmDocumentTemplateCode,
  CmContractCreateWizardData,
  CmCreateContractResult,
} from '@/types/cm/contractCreate';
import type { CmContractTemplateCode } from '@/types/cm/contractTemplate';

const logger = createLogger('lib/cm/contracts/createContract');

// =============================================================
// Types
// =============================================================

export type CreateContractParams = {
  kaipokeCsId: string;
  wizardData: CmContractCreateWizardData;
};

export type CreateContractActionResult =
  | { ok: true; data: CmCreateContractResult }
  | { ok: false; error: string };

// =============================================================
// 契約作成（メイン）
// =============================================================

/**
 * 契約を作成（PDF生成 → DigiSigner連携 → DB保存）
 */
export async function createContractWithDocuments(
  params: CreateContractParams
): Promise<CreateContractActionResult> {
  const { kaipokeCsId, wizardData } = params;
  const { step1, step2 } = wizardData;

  try {
    logger.info('契約作成開始', {
      kaipokeCsId,
      templates: step1.selectedTemplates,
    });

    // ---------------------------------------------------------
    // 1. 契約レコード作成（status: draft）
    // ---------------------------------------------------------
    const { data: contract, error: contractError } = await supabaseAdmin
      .from('cm_contracts')
      .insert({
        kaipoke_cs_id: kaipokeCsId,
        contract_type: 'new_admission',
        signing_method: 'electronic',
        status: 'draft',
        contract_date: step2.contractDate,
        staff_id: step2.staffId,
      })
      .select('id')
      .single();

    if (contractError || !contract) {
      logger.error('契約レコード作成エラー', { message: contractError?.message });
      return { ok: false, error: '契約の作成に失敗しました' };
    }

    const contractId = contract.id;
    logger.info('契約レコード作成完了', { contractId });

    // ---------------------------------------------------------
    // 2. 職員名・事業所情報・選択肢マスタを取得
    // ---------------------------------------------------------
    const [staffName, officeResult, optionsResult] = await Promise.all([
      getStaffName(step2.staffId),
      getDefaultOwnOffice(),
      getSelectOptionsMultiple(['relationship', 'proxy_reason']),
    ]);

    const office = officeResult.ok === true ? officeResult.data : null;

    // 選択肢マスタから表示値を取得するヘルパー
    const relationshipOptions = optionsResult.ok ? (optionsResult.data?.relationship ?? []) : [];
    const proxyReasonOptions = optionsResult.ok ? (optionsResult.data?.proxy_reason ?? []) : [];

    const getDisplayValue = (
      code: string,
      otherText: string,
      options: { code: string; label: string; requires_input?: boolean }[],
    ): string => {
      if (!code) return '';
      const opt = options.find((o) => o.code === code);
      if (!opt) return code;
      if (opt.requires_input && otherText) return otherText;
      return opt.label;
    };

    // ---------------------------------------------------------
    // 3. タグ置換マップを作成（Step2のgetTagReplacementsと同じ）
    // ---------------------------------------------------------
    const formatDate = (dateStr: string): string => {
      if (!dateStr) return '';
      const [year, month, day] = dateStr.split('-').map(Number);
      if (!year || !month || !day) return dateStr;
      return `${year}年${month}月${day}日`;
    };

    const tagReplacements: Record<string, string> = {
      '{{利用者氏名}}': step2.clientName,
      '{{利用者住所}}': step2.clientAddress,
      '{{利用者電話}}': step2.clientPhone,
      '{{利用者FAX}}': step2.clientFax,
      '{{代筆者氏名}}': step2.proxyName,
      '{{代筆者続柄}}': getDisplayValue(step2.proxyRelationshipCode, step2.proxyRelationshipOther, relationshipOptions),
      '{{代筆理由}}': getDisplayValue(step2.proxyReasonCode, step2.proxyReasonOther, proxyReasonOptions),
      '{{代筆者住所}}': step2.proxyAddress,
      '{{代筆者電話}}': step2.proxyPhone,
      '{{代筆者FAX}}': '',
      '{{緊急連絡先電話}}': step2.emergencyPhone,
      '{{契約日}}': formatDate(step2.contractDate),
      '{{同意日}}': formatDate(step2.contractDate),
      '{{説明日}}': formatDate(step2.contractDate),
      '{{契約開始日}}': formatDate(step2.contractStartDate),
      '{{契約終了日}}': formatDate(step2.contractEndDate),
      '{{説明者氏名}}': step2.staffName || staffName || '（担当者）',
      '{{担当者氏名}}': step2.careManagerName,
      '{{担当者電話}}': step2.careManagerPhone,
      '{{担当期間}}': step2.careManagerPeriod,
      '{{事業所名}}': office?.name ?? '',
      '{{事業所住所}}': office ? `〒${office.postal_code || ''} ${office.address}` : '',
      '{{事業所電話}}': office?.phone ?? '',
      '{{事業所FAX}}': office?.fax ?? '',
      '{{運営法人名}}': office?.corporation_name ?? '',
      '{{代表者名}}': office?.representative_name ?? '',
      '{{管理者名}}': office?.manager_name ?? '',
    };

    // ---------------------------------------------------------
    // 4. DBからHTMLテンプレートを取得してタグ置換
    // ---------------------------------------------------------
    const templateCodes = step1.selectedTemplates;
    const htmlList: { html: string; templateCode: CmContractTemplateCode }[] = [];

    for (const code of templateCodes) {
      const html = await getTemplateHtml(code);
      if (!html) {
        logger.error('テンプレートHTML取得失敗', { code });
        continue;
      }

      // タグ置換
      let replacedHtml = html;
      for (const [tag, value] of Object.entries(tagReplacements)) {
        replacedHtml = replacedHtml.replaceAll(tag, value || '');
      }

      htmlList.push({ html: replacedHtml, templateCode: code });
    }

    if (htmlList.length === 0) {
      logger.error('有効なテンプレートが1つもない');
      await supabaseAdmin.from('cm_contracts').delete().eq('id', contractId);
      return { ok: false, error: 'テンプレートの取得に失敗しました' };
    }

    // ---------------------------------------------------------
    // 5. HTML → 結合PDF生成
    // ---------------------------------------------------------
    const templateNames = templateCodes
      .map((code) => getTemplateByCode(code)?.name)
      .filter((n): n is string => n != null);

    logger.info('結合PDF生成開始', { templateCodes, htmlCount: htmlList.length });

    const pdfResult = await generateCombinedPdfFromHtml(
      htmlList,
      step2.clientName,
      step2.contractDate,
    );

    if (pdfResult.ok === false) {
      logger.error('結合PDF生成エラー', { error: pdfResult.error });
      await supabaseAdmin.from('cm_contracts').delete().eq('id', contractId);
      return { ok: false, error: 'PDF生成に失敗しました' };
    }

    // ---------------------------------------------------------
    // 6. DigiSignerにアップロード＆署名リクエスト作成
    // ---------------------------------------------------------
    const digiResult = await uploadAndCreateSignatureRequest(
      pdfResult.buffer,
      pdfResult.fileName,
      'signer'
    );

    if (digiResult.ok === false) {
      logger.error('DigiSigner連携エラー', { error: digiResult.error });
      await supabaseAdmin.from('cm_contracts').delete().eq('id', contractId);
      return { ok: false, error: 'DigiSigner連携に失敗しました' };
    }

    // ---------------------------------------------------------
    // 7. cm_contract_documents にレコード作成（1レコード）
    // ---------------------------------------------------------
    const { error: docError } = await supabaseAdmin
      .from('cm_contract_documents')
      .insert({
        contract_id: contractId,
        document_type: 'combined',
        document_name: `契約書類一式（${templateNames.join('・')}）`,
        digisigner_document_id: digiResult.data.documentId,
        digisigner_signature_request_id: digiResult.data.signatureRequestId,
        signing_url: digiResult.data.signingUrl,
        signing_status: 'pending',
        sort_order: 0,
      });

    if (docError) {
      logger.error('書類レコード作成エラー', { message: docError.message });
      await supabaseAdmin.from('cm_contracts').delete().eq('id', contractId);
      return { ok: false, error: '書類レコードの作成に失敗しました' };
    }

    // ---------------------------------------------------------
    // 8. 結果を返却
    // ---------------------------------------------------------
    logger.info('契約作成完了', {
      contractId,
      documentCount: templateCodes.length,
    });

    return {
      ok: true,
      data: {
        contractId,
        documents: [{
          documentType: 'combined' as CmDocumentTemplateCode,
          documentName: '契約書類一式',
          digisignerDocumentId: digiResult.data.documentId,
          signingUrl: digiResult.data.signingUrl,
        }],
      },
    };
  } catch (e) {
    logger.error('契約作成例外', e as Error);
    return { ok: false, error: 'サーバーエラーが発生しました' };
  }
}