// =============================================================
// src/components/cm-components/contracts/CmContractCreateWizard.tsx
// 契約作成ウィザード（統合コンポーネント）
//
// Step1: 書類選択
// Step2: 差し込み情報確認
// Step3: PDF生成・DigiSigner送信
//
// 変更履歴:
//   2026-02-05: officeInfo の型を拡張（運営法人名・代表者名・管理者名を追加）
// =============================================================

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, AlertCircle } from 'lucide-react';
import { CmCard } from '@/components/cm-components';
import { CmContractCreateStep1 } from './CmContractCreateStep1';
import { CmContractCreateStep2 } from './CmContractCreateStep2';
import { CmContractCreateStep3 } from './CmContractCreateStep3';
import { getClientInfoForContract } from '@/lib/cm/contracts/getClientInfoForContract';
import { getStaffList } from '@/lib/cm/contracts/getStaffList';
import { getDefaultOwnOffice } from '@/lib/cm/master/getOwnOffice';
import { getRequiredTemplateCodes } from '@/lib/cm/contracts/templates';
import type {
  CmClientInfoForContract,
  CmContractCreateStep1Data,
  CmContractCreateStep2Data,
  CmContractCreateWizardData,
  CmStaffSelectOption,
} from '@/types/cm/contractCreate';

// =============================================================
// Types
// =============================================================

type Props = {
  kaipokeCsId: string;
};

type Step = 1 | 2 | 3;

// =============================================================
// Component
// =============================================================

export function CmContractCreateWizard({ kaipokeCsId }: Props) {
  const router = useRouter();

  // ---------------------------------------------------------
  // State
  // ---------------------------------------------------------
  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 初期データ
  const [clientInfo, setClientInfo] = useState<CmClientInfoForContract | null>(null);
  const [staffList, setStaffList] = useState<CmStaffSelectOption[]>([]);

  // ウィザードデータ
  const [step1Data, setStep1Data] = useState<CmContractCreateStep1Data>({
    selectedTemplates: getRequiredTemplateCodes(),  // 必須書類を初期選択
  });

  const [step2Data, setStep2Data] = useState<CmContractCreateStep2Data>({
    // 利用者情報
    clientName: '',
    clientAddress: '',
    clientPhone: '',
    clientFax: '',
    // 署名者区分
    signerType: 'self',
    // 代理人情報
    proxyName: '',
    proxyRelationshipCode: '',
    proxyRelationshipOther: '',
    proxyReasonCode: '',
    proxyReasonOther: '',
    proxyAddress: '',
    proxyPhone: '',
    emergencyPhone: '',
    // 後見人確認
    hasGuardian: false,
    guardianType: '',
    guardianConfirmed: false,
    guardianDocumentChecked: false,
    guardianNotes: '',
    // 契約情報
    contractDate: getTodayString(),
    contractStartDate: getTodayString(),
    contractEndDate: '',
    // 担当者情報
    staffId: '',
    staffName: '',
    careManagerId: '',
    careManagerName: '',
    careManagerPhone: '',
    careManagerPeriod: '',
  });

  // 事業所情報（DBから取得、初期値はnull）
  // 変更: 型を拡張
  const [officeInfo, setOfficeInfo] = useState<{
    name: string;
    address: string;
    phone: string;
    fax: string;
    corporation_name: string;
    representative_name: string;
    manager_name: string;
  } | null>(null);

  // ---------------------------------------------------------
  // 初期データ取得
  // ---------------------------------------------------------
  const fetchInitialData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [clientResult, staffResult, officeResult] = await Promise.all([
        getClientInfoForContract(kaipokeCsId),
        getStaffList(),
        getDefaultOwnOffice(),
      ]);

      if (clientResult.ok !== true) {
        setError(clientResult.error || '利用者情報の取得に失敗しました');
        return;
      }

      if (staffResult.ok === true) {
        // 既存のgetStaffListの戻り値を変換
        const convertedStaffList: CmStaffSelectOption[] = staffResult.data.map((s) => ({
          id: s.user_id,
          name: s.display_name,
        }));
        setStaffList(convertedStaffList);
      }

      // 事業所情報を設定
      // 変更: 新しいフィールドに対応
      if (officeResult.ok === true) {
        const office = officeResult.data;
        setOfficeInfo({
          name: office.name,
          address: office.address ? `〒${office.postal_code || ''} ${office.address}` : '',
          phone: office.phone ?? '',
          fax: office.fax ?? '',
          corporation_name: office.corporation_name ?? '',
          representative_name: office.representative_name ?? '',
          manager_name: office.manager_name ?? '',
        });
      } else {
        console.error('事業所情報の取得に失敗:', officeResult.error);
      }

      const client = clientResult.data;
      setClientInfo(client);

      // Step2の初期値を設定
      setStep2Data((prev) => ({
        ...prev,
        clientName: client.name,
        clientAddress: client.address,
        clientPhone: client.phone ?? '',
      }));
    } catch {
      setError('データの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [kaipokeCsId]);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  // ---------------------------------------------------------
  // ナビゲーション
  // ---------------------------------------------------------
  const handleCancel = () => {
    router.push(`/cm-portal/clients/${kaipokeCsId}?tab=contracts`);
  };

  const handleBack = () => {
    setCurrentStep((prev) => (prev > 1 ? (prev - 1) as Step : prev));
  };

  const handleNext = () => {
    setCurrentStep((prev) => (prev < 3 ? (prev + 1) as Step : prev));
  };

  const handleComplete = () => {
    // 契約一覧に遷移
    router.push(`/cm-portal/clients/${kaipokeCsId}?tab=contracts`);
    router.refresh();
  };

  // ---------------------------------------------------------
  // ウィザードデータの統合
  // ---------------------------------------------------------
  const wizardData: CmContractCreateWizardData = {
    step1: step1Data,
    step2: step2Data,
  };

  // ---------------------------------------------------------
  // ローディング
  // ---------------------------------------------------------
  if (loading) {
    return (
      <CmCard>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
          <span className="ml-2 text-slate-500">読み込み中...</span>
        </div>
      </CmCard>
    );
  }

  // ---------------------------------------------------------
  // エラー
  // ---------------------------------------------------------
  if (error || !clientInfo) {
    return (
      <CmCard>
        <div className="flex flex-col items-center justify-center py-12 gap-4">
          <AlertCircle className="w-8 h-8 text-red-500" />
          <p className="text-red-600">{error || '利用者情報が見つかりません'}</p>
          <button
            type="button"
            onClick={handleCancel}
            className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 hover:underline"
          >
            契約一覧に戻る
          </button>
        </div>
      </CmCard>
    );
  }

  // ---------------------------------------------------------
  // ステップ別レンダリング
  // ---------------------------------------------------------
  return (
    <div className="max-w-3xl">
      {/* ヘッダー */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-800">契約書類を作成</h1>
        <p className="text-sm text-slate-500 mt-1">
          {clientInfo.name} 様
        </p>
      </div>

      {/* ステップコンテンツ */}
      {currentStep === 1 && (
        <CmContractCreateStep1
          data={step1Data}
          onChange={setStep1Data}
          onNext={handleNext}
          onCancel={handleCancel}
        />
      )}

      {currentStep === 2 && (
        <CmContractCreateStep2
          step1Data={step1Data}
          data={step2Data}
          staffList={staffList}
          officeInfo={officeInfo}
          onChange={setStep2Data}
          onBack={handleBack}
          onNext={handleNext}
        />
      )}

      {currentStep === 3 && (
        <CmContractCreateStep3
          kaipokeCsId={kaipokeCsId}
          wizardData={wizardData}
          onBack={handleBack}
          onComplete={handleComplete}
        />
      )}
    </div>
  );
}

// =============================================================
// ヘルパー関数
// =============================================================

/**
 * 今日の日付をYYYY-MM-DD形式で取得
 */
function getTodayString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}