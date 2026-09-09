// =============================================================
// src/lib/cm/contracts/createContract.ts
// 契約作成 統合処理（Server Action）
//
// 処理フロー:
//   1. cm_contracts にレコード作成（status: draft）
//   2. cm_contract_form_data にフォームデータ保存
//   3. DBからHTMLテンプレート取得
//   4. タグ置換（利用者情報・事業所情報等）
//   5. HTML → pdfkit PDF生成（DigiSigner Text Tags対応）
//   6. DigiSignerにアップロード＆署名リクエスト作成
//   7. cm_contract_documents にレコード作成（1レコード）
//   8. cm_contract_document_signers に署名者レコード作成
//   9. 結果返却
//
// v2変更:
//   - proxy_* → scribe_*/agent_* フィールド名変更
//   - DigiSigner 複数署名者ロール対応
//   - cm_contract_document_signers 子テーブル追加
// =============================================================

'use server';

import { supabaseAdmin } from '@/lib/supabase/service';
import { createLogger } from '@/lib/common/logger';
import { requireCmSession, CmAuthError } from '@/lib/cm/auth/requireCmSession';
import { generateCombinedPdfFromHtml } from './generateContractPdf';
import { cmGetTemplateHtmlCore } from './templateCore';
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
import { cmFormatDateJapanese } from '@/lib/cm/utils';

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
// 署名者ロール決定
// =============================================================

/**
 * signerType に応じた DigiSigner 署名者ロール配列を返す
 *
 * - self:   ['signer']        本人が署名
 * - scribe: ['scribe']        代筆者が署名（本人の意思あり）
 * - agent:  ['agent']         代理人が署名
 *
 * NOTE: family, care_manager_1 は privacy-consent 等で
 *       テンプレート側の signers 定義に含まれる場合に追加される
 */
function getDigiSignerRoles(signerType: string): string[] {
  switch (signerType) {
    case 'scribe':
      return ['scribe'];
    case 'agent':
      return ['agent'];
    default:
      return ['signer'];
  }
}

// =============================================================
// 契約作成（メイン）
// =============================================================

/**
 * 契約を作成（PDF生成 → DigiSigner連携 → DB保存）
 */
export async function createContractWithDocuments(
  params: CreateContractParams,
  token: string,
): Promise<CreateContractActionResult> {
  const { kaipokeCsId, wizardData } = params;
  const { step1, step2 } = wizardData;

  try {
    await requireCmSession(token);

    logger.info('契約作成開始', {
      kaipokeCsId,
      templates: step1.selectedTemplates,
      signerType: step2.signerType,
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
    // 1.5. cm_contract_form_data にフォームデータ保存
    // ---------------------------------------------------------
    const { error: formDataError } = await supabaseAdmin
      .from('cm_contract_form_data')
      .insert({
        contract_id: contractId,
        client_name: step2.clientName,
        client_address: step2.clientAddress,
        client_phone: step2.clientPhone,
        client_fax: step2.clientFax,
        signer_type: step2.signerType,
        // 代筆者情報
        scribe_name: step2.signerType === 'scribe' ? step2.scribeName : null,
        scribe_relationship_code: step2.signerType === 'scribe' ? step2.scribeRelationshipCode : null,
        scribe_relationship_other: step2.signerType === 'scribe' ? step2.scribeRelationshipOther || null : null,
        scribe_reason_code: step2.signerType === 'scribe' ? step2.scribeReasonCode : null,
        scribe_reason_other: step2.signerType === 'scribe' ? step2.scribeReasonOther || null : null,
        scribe_address: step2.signerType === 'scribe' ? step2.scribeAddress : null,
        scribe_phone: step2.signerType === 'scribe' ? step2.scribePhone : null,
        // 代理人情報
        agent_name: step2.signerType === 'agent' ? step2.agentName : null,
        agent_relationship_code: step2.signerType === 'agent' ? step2.agentRelationshipCode : null,
        agent_relationship_other: step2.signerType === 'agent' ? step2.agentRelationshipOther || null : null,
        agent_authority: step2.signerType === 'agent' ? step2.agentAuthority : null,
        agent_address: step2.signerType === 'agent' ? step2.agentAddress : null,
        agent_phone: step2.signerType === 'agent' ? step2.agentPhone : null,
        emergency_phone: step2.emergencyPhone || null,
        // 後見人
        has_guardian: step2.hasGuardian,
        guardian_type: step2.guardianType || null,
        guardian_confirmed: step2.guardianConfirmed,
        guardian_document_checked: step2.guardianDocumentChecked,
        guardian_notes: step2.guardianNotes || null,
        // 契約日程
        contract_date: step2.contractDate || null,
        contract_start_date: step2.contractStartDate || null,
        contract_end_date: step2.contractEndDate || null,
        // 担当者
        staff_id: step2.staffId,
        staff_name: step2.staffName || null,
        care_manager_id: step2.careManagerId || null,
        care_manager_name: step2.careManagerName || null,
        care_manager_phone: step2.careManagerPhone || null,
        care_manager_period: step2.careManagerPeriod || null,
      });

    if (formDataError) {
      logger.warn('フォームデータ保存エラー（契約作成は継続）', { message: formDataError.message });
    }

    // ---------------------------------------------------------
    // 2. 職員名・事業所情報・選択肢マスタを取得
    // ---------------------------------------------------------
    const [staffName, officeResult, optionsResult] = await Promise.all([
      getStaffName(step2.staffId),
      getDefaultOwnOffice(token),
      getSelectOptionsMultiple(['relationship', 'proxy_reason'], token),
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
    // 3. タグ置換マップを作成
    //    v2変更: proxy_* → scribe_*/agent_* タグ対応
    // ---------------------------------------------------------


    // 代筆者タグの値（signerType が scribe の場合のみ有効）
    const scribeRelationshipDisplay = getDisplayValue(
      step2.scribeRelationshipCode, step2.scribeRelationshipOther, relationshipOptions
    );
    const scribeReasonDisplay = getDisplayValue(
      step2.scribeReasonCode, step2.scribeReasonOther, proxyReasonOptions
    );

    // 代理人タグの値（signerType が agent の場合のみ有効）
    const agentRelationshipDisplay = getDisplayValue(
      step2.agentRelationshipCode, step2.agentRelationshipOther, relationshipOptions
    );

    const tagReplacements: Record<string, string> = {
      // 利用者情報
      '{{利用者氏名}}': step2.clientName,
      '{{利用者住所}}': step2.clientAddress,
      '{{利用者電話}}': step2.clientPhone,
      '{{利用者FAX}}': step2.clientFax,
      // 代筆者情報
      '{{代筆者氏名}}': step2.signerType === 'scribe' ? step2.scribeName : '',
      '{{代筆者続柄}}': step2.signerType === 'scribe' ? scribeRelationshipDisplay : '',
      '{{代筆理由}}': step2.signerType === 'scribe' ? scribeReasonDisplay : '',
      '{{代筆者住所}}': step2.signerType === 'scribe' ? step2.scribeAddress : '',
      '{{代筆者電話}}': step2.signerType === 'scribe' ? step2.scribePhone : '',
      '{{代筆者FAX}}': '',
      // 代理人情報
      '{{代理人氏名}}': step2.signerType === 'agent' ? step2.agentName : '',
      '{{代理人続柄}}': step2.signerType === 'agent' ? agentRelationshipDisplay : '',
      '{{代理の根拠}}': step2.signerType === 'agent' ? step2.agentAuthority : '',
      '{{代理人住所}}': step2.signerType === 'agent' ? step2.agentAddress : '',
      '{{代理人電話}}': step2.signerType === 'agent' ? step2.agentPhone : '',
      // 共通
      '{{緊急連絡先電話}}': step2.emergencyPhone,
      // 契約情報
      '{{契約日}}': cmFormatDateJapanese(step2.contractDate),
      '{{同意日}}': cmFormatDateJapanese(step2.contractDate),
      '{{説明日}}': cmFormatDateJapanese(step2.contractDate),
      '{{契約開始日}}': cmFormatDateJapanese(step2.contractStartDate),
      '{{契約終了日}}': cmFormatDateJapanese(step2.contractEndDate),
      // 担当者情報
      '{{説明者氏名}}': step2.staffName || staffName || '（担当者）',
      '{{担当者氏名}}': step2.careManagerName,
      '{{担当者電話}}': step2.careManagerPhone,
      '{{担当期間}}': step2.careManagerPeriod,
      // 事業所情報
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
      const html = await cmGetTemplateHtmlCore(code);
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
    //    v2変更: signerType に応じた署名者ロール配列を渡す
    // ---------------------------------------------------------
    const signerRoles = getDigiSignerRoles(step2.signerType);

    const digiResult = await uploadAndCreateSignatureRequest(
      pdfResult.buffer,
      pdfResult.fileName,
      signerRoles
    );

    if (digiResult.ok === false) {
      logger.error('DigiSigner連携エラー', { error: digiResult.error });
      await supabaseAdmin.from('cm_contracts').delete().eq('id', contractId);
      return { ok: false, error: 'DigiSigner連携に失敗しました' };
    }

    // ---------------------------------------------------------
    // 7. cm_contract_documents にレコード作成（1レコード）
    //    v2変更: signing_url カラム削除（子テーブルに移行）
    // ---------------------------------------------------------
    const { data: docData, error: docError } = await supabaseAdmin
      .from('cm_contract_documents')
      .insert({
        contract_id: contractId,
        document_type: 'combined',
        document_name: `契約書類一式（${templateNames.join('・')}）`,
        digisigner_document_id: digiResult.data.documentId,
        digisigner_signature_request_id: digiResult.data.signatureRequestId,
        signing_status: 'pending',
        sort_order: 0,
      })
      .select('id')
      .single();

    if (docError || !docData) {
      logger.error('書類レコード作成エラー', { message: docError?.message });
      await supabaseAdmin.from('cm_contracts').delete().eq('id', contractId);
      return { ok: false, error: '書類レコードの作成に失敗しました' };
    }

    // ---------------------------------------------------------
    // 8. cm_contract_document_signers に署名者レコード作成
    //    v2新規: 子テーブルに各署名者のURL・ステータスを保存
    // ---------------------------------------------------------
    const signerInserts = digiResult.data.signers.map((signer, index) => ({
      document_id: docData.id,
      role: signer.role,
      signing_url: signer.signingUrl,
      signing_status: 'pending',
      sort_order: index,
    }));

    const { error: signersError } = await supabaseAdmin
      .from('cm_contract_document_signers')
      .insert(signerInserts);

    if (signersError) {
      logger.error('署名者レコード作成エラー', { message: signersError.message });
      // 書類レコードは作成済みなので、ロールバックは書類も含めて行う
      await supabaseAdmin.from('cm_contract_documents').delete().eq('id', docData.id);
      await supabaseAdmin.from('cm_contracts').delete().eq('id', contractId);
      return { ok: false, error: '署名者レコードの作成に失敗しました' };
    }

    // ---------------------------------------------------------
    // 9. 結果を返却
    // ---------------------------------------------------------
    logger.info('契約作成完了', {
      contractId,
      documentCount: templateCodes.length,
      signerCount: digiResult.data.signers.length,
    });

    return {
      ok: true,
      data: {
        contractId,
        documents: [{
          documentType: 'combined' as CmDocumentTemplateCode,
          documentName: '契約書類一式',
          digisignerDocumentId: digiResult.data.documentId,
          signers: digiResult.data.signers,
        }],
      },
    };
  } catch (e) {
    if (e instanceof CmAuthError) {
      return { ok: false, error: e.message };
    }
    logger.error('契約作成例外', e as Error);
    return { ok: false, error: 'サーバーエラーが発生しました' };
  }
}