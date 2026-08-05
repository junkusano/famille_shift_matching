// /app/portal/page.tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter } from "next/navigation";
import { useRoleContext } from "@/context/RoleContext";
import {
  CalendarDays,
  FileText,
  Wallet,
} from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import DocUploader, { type DocItem, type Attachment } from '@/components/DocUploader';
import PerformanceScoreCard from '@/components/portal/PerformanceScoreCard';
import {
  determineServicesFromCertificates,
  type DocMasterRow as CertMasterRow,
  type ServiceKey,
} from '@/lib/certificateJudge';

type UserRow = {
  id: string;
  auth_uid: string | null;
  user_id: string | null;
  last_name_kanji: string | null;
  first_name_kanji: string | null;
  last_name_kana: string | null;
  first_name_kana: string | null;
  photo_url: string | null;
  attachments: Attachment[] | null;
};

type SalarySummary = {
  worked: number;
  expected: number;
};

const getCurrentYearMonth = () => {
  const now = new Date();

  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
    2,
    '0',
  )}`;
};

export default function PortalHome() {
  const { role, loading: roleLoading } = useRoleContext();

  const normalizedRole = (role ?? "").trim().toLowerCase();

  const [me, setMe] = useState<UserRow | null>(null);

  const SERVICE_SUPPORT_AUTH_UID =
  "386e457a-5cb7-445d-9832-17cfd8ec0960";

const isServiceSupport =
  me?.auth_uid === SERVICE_SUPPORT_AUTH_UID;

const isManagerOrAdmin =
  !isServiceSupport &&
  (
    normalizedRole === "manager" ||
    normalizedRole === "admin"
  );
  
  const router = useRouter();

  const [certs, setCerts] = useState<DocItem[]>([]);

  const [selectedSalaryMonth, setSelectedSalaryMonth] = useState(
    getCurrentYearMonth,
  );

  const [salarySummary, setSalarySummary] = useState<SalarySummary>({
    worked: 0,
    expected: 0,
  });

  const [salaryLoading, setSalaryLoading] = useState(false);
  const [salaryError, setSalaryError] = useState('');

  const [docMaster, setDocMaster] = useState<{
    certificate: string[];
    other: string[];
  }>({
    certificate: [],
    other: [],
  });

  /*
  const isCertificateType = (t?: string | null) =>
    t === '資格証明書' || t === 'certificate' || t === 'certification';
  */

  // 判定用のマスタ行
  const [masterRows, setMasterRows] = useState<CertMasterRow[]>([]);
  // あなたの資格からの提供可能サービス（重複なし）
  const [services, setServices] = useState<ServiceKey[]>([]);

  // ユーザー & 添付の読み込み
  const load = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      router.push('/login');
      return;
    }

    const { data, error } = await supabase
      .from('form_entries')
      .select(
        'id, auth_uid, last_name_kanji, first_name_kanji, last_name_kana, first_name_kana, photo_url, attachments'
      )
      .eq('auth_uid', auth.user.id)
      .maybeSingle();

    if (error) {
      console.error('form_entries load error:', error);
      return;
    }

    if (data) {
      const row = data as UserRow;

      if ((row.attachments ?? []).some(a => a?.type === 'certificate' || a?.type === 'certification')) {
        const fixed = (row.attachments ?? []).map(a =>
          (a?.type === 'certificate' || a?.type === 'certification')
            ? { ...a, type: '資格証明書' }
            : a
        );
        const { error: fixErr } = await supabase
          .from('form_entries')
          .update({ attachments: fixed })
          .eq('id', row.id);
        if (!fixErr) {
          row.attachments = fixed; // ローカル状態も同期
        }
      }

      setMe(row);

      // 「資格証明書」だけ DocItem 化
      const list: DocItem[] = (row.attachments ?? [])
        .filter((a) => a?.type === '資格証明書')
        .map((a) => ({
          id: a.id,
          url: a.url,
          label: a.label,
          type: '資格証明書',
          mimeType: a.mimeType ?? null,
          uploaded_at: a.uploaded_at,
          acquired_at: a.acquired_at ?? a.uploaded_at,
        }));

      setCerts(list);
    }
  }, [router]);

    useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
  if (!me?.id || roleLoading || isManagerOrAdmin) return;

  const loadSalarySummary = async () => {
      setSalaryLoading(true);
      setSalaryError('');

      try {
        const params = new URLSearchParams({
          form_entry_id: me.id,
          month: selectedSalaryMonth,
        });

        const response = await fetch(
          `/api/portal/salary-summary?${params.toString()}`,
          {
            method: 'GET',
            cache: 'no-store',
          },
        );

        const result = await response.json();

        if (!response.ok) {
          throw new Error(
            result?.error ??
              '給与情報の取得に失敗しました。',
          );
        }

        setSalarySummary({
          worked: Number(result?.worked ?? 0),
          expected: Number(result?.expected ?? 0),
        });
      } catch (error: unknown) {
        console.error('salary summary load error:', error);

        setSalarySummary({
          worked: 0,
          expected: 0,
        });

        setSalaryError(
          error instanceof Error
            ? error.message
            : '給与情報の取得に失敗しました。',
        );
      } finally {
        setSalaryLoading(false);
      }
    };

    void loadSalarySummary();
  }, [
  me?.id,
  selectedSalaryMonth,
  roleLoading,
  isManagerOrAdmin,
]);


  // マスタの読み込み（doc_group を alias で service_key として取得）
  useEffect(() => {
    const loadDocMaster = async () => {
      const { data, error } = await supabase
        .from('user_doc_master')
        .select('category,label,is_active,sort_order,service_key:doc_group')
        .order('sort_order', { ascending: true });

      if (error) {
        console.error('user_doc_master load error:', error);
        return;
      }

      const rows = (data ?? []) as CertMasterRow[];
      setMasterRows(rows);

      // DocUploader 用のラベル配列
      const cert = rows
        .filter((r) => r.category === 'certificate' && r.is_active !== false)
        .map((r) => r.label ?? '');
      const other = rows
        .filter((r) => r.category === 'other' && r.is_active !== false)
        .map((r) => r.label ?? '');
      setDocMaster({ certificate: cert, other });
    };

    void loadDocMaster();
  }, []);

  // 提出済み資格 or マスタが変わったら、提供可能サービスを再判定
  useEffect(() => {
    setServices(determineServicesFromCertificates(certs, masterRows));
  }, [certs, masterRows]);

  // 保存系
  const isInCategory = (a: Attachment, docCategory: string) =>
    docCategory === 'certificate' ? a.type === '資格証明書' : a.type === docCategory;

  const saveAttachmentsForCategory = async (
    formEntryId: string,
    currentAll: Attachment[] | null | undefined,
    docCategory: string,
    nextDocs: DocItem[],
  ) => {
    const base = Array.isArray(currentAll) ? currentAll : [];
    const others = base.filter((a) => !isInCategory(a, docCategory));

    // ← ここを toAttachment ではなく「type を強制固定」で作る
    const mapped: Attachment[] = nextDocs.map((d) => ({
      id: d.id,
      url: d.url,
      label: d.label,
      type: docCategory === 'certificate' ? '資格証明書' : docCategory, // ← 強制固定
      mimeType: d.mimeType ?? null,
      uploaded_at: d.uploaded_at,
      acquired_at: d.acquired_at,
    }));

    const merged: Attachment[] = [...others, ...mapped];
    const { error } = await supabase
      .from('form_entries')
      .update({ attachments: merged })
      .eq('id', formEntryId);
    if (error) throw error;
    return merged;
  };


  const onCertsChange = async (next: DocItem[]) => {
    setCerts(next);
    if (!me) return;
    try {
      const merged = await saveAttachmentsForCategory(me.id, me.attachments, 'certificate', next);
      setMe((prev) => (prev ? { ...prev, attachments: merged } : prev));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      alert('保存に失敗しました: ' + msg);
    }
  };

    if (!me) return <div className="p-4">読み込み中...</div>;

  const currentYearMonth = getCurrentYearMonth();
  const isCurrentSalaryMonth =
    selectedSalaryMonth === currentYearMonth;

  const formatYen = (amount: number) =>
    new Intl.NumberFormat('ja-JP').format(amount);

  const salaryMonthLabel = selectedSalaryMonth.replace(
    /^(\d{4})-(\d{2})$/,
    '$1年$2月',
  );

  // 資格証明書以外の添付ファイルを「提出書類」として表示する
  const submittedDocs = (me.attachments ?? []).filter((attachment) => {
    if (!attachment?.url) return false;

    return ![
      '資格証明書',
      'certificate',
      'certification',
    ].includes(attachment.type ?? '');
  });

  return (
    <div className="content p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold flex items-center gap-3">
        <Image src="/myfamille_logo.png" alt="ファミーユロゴ" width={120} height={20} />
        ポータル（ホーム）
      </h1>

      <div className="mt-4 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-800 md:hidden">
        📱 各機能は左のオレンジ色のバーから利用できます。タップしてメニューを開いてください。
      </div>

            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-[160px_1fr] md:items-stretch">
        {/* 氏名 */}
        <div>
          <div className="text-lg font-semibold">氏名</div>

          <div className="mt-2 rounded border-4 border-gray-500 bg-white px-3 py-2 font-semibold">
            {me.last_name_kanji ?? ''} {me.first_name_kanji ?? ''}
          </div>

          <div className="mt-1 text-sm text-gray-500">
            ふりがな：{me.last_name_kana ?? ''}{' '}
            {me.first_name_kana ?? ''}
          </div>
        </div>

        {/* 給与概算：一般スタッフのみ表示 */}
{!roleLoading && !isManagerOrAdmin && (
  <section className="rounded-xl border border-blue-200 bg-blue-50/40 px-5 py-4 shadow-sm">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="text-lg font-bold text-gray-900">
          給与（概算）
        </h2>

        <p className="mt-1 max-w-3xl text-xs leading-relaxed text-gray-600">
          概算給与は、基本時給・サービス加算・回ごと単価・通勤費から算出した目安です。
          実際の給与は、個人別時給、同日に複数サービスへ入る場合の移動時間加算等により変動します。
        </p>
      </div>

      <label className="text-sm font-semibold text-gray-700">
        表示する年月

        <input
          type="month"
          value={selectedSalaryMonth}
          max={currentYearMonth}
          onChange={(event) =>
            setSelectedSalaryMonth(event.target.value)
          }
          className="ml-2 rounded-lg border border-gray-300 bg-white px-3 py-2 font-normal"
        />
      </label>
    </div>

    {salaryLoading ? (
      <div className="mt-5 text-sm text-gray-500">
        給与情報を読み込み中です...
      </div>
    ) : salaryError ? (
      <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
        {salaryError}
      </div>
    ) : (
      <div
        className={`mt-4 grid gap-3 ${
          isCurrentSalaryMonth
            ? 'grid-cols-1 sm:grid-cols-2'
            : 'grid-cols-1'
        }`}
      >
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
          <div className="text-sm font-semibold text-gray-600">
            {salaryMonthLabel} 勤務済み
          </div>

          <div className="mt-1 text-2xl font-bold text-gray-900">
            {formatYen(salarySummary.worked)}
            <span className="ml-1 text-base">円</span>
          </div>
        </div>

        {isCurrentSalaryMonth && (
          <div className="rounded-lg border border-blue-200 bg-white px-4 py-3">
            <div className="text-sm font-semibold text-blue-700">
              今月見込み
            </div>

            <div className="mt-1 text-2xl font-bold text-blue-700">
              {formatYen(salarySummary.expected)}
              <span className="ml-1 text-base">円</span>
            </div>
          </div>
        )}
      </div>
    )}
  </section>
)}
      </div>

      {/* よく使う機能 */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">

        {/* シフ子 */}
        <button
          onClick={() => router.push('/portal/shift-coordinate')}
          className="rounded-xl bg-blue-50 border border-blue-200 p-5 shadow hover:shadow-lg transition text-left"
        >
          <div className="flex items-center gap-3">
            <CalendarDays className="h-8 w-8 text-blue-600" />
            <div>
              <div className="font-bold text-lg">シフ子</div>
              <div className="text-sm text-gray-500">
                自分で好きなシフトを選べる
              </div>
            </div>
          </div>
        </button>

        {/* 訪問記録 */}
        <button
          onClick={() => router.push('/portal/shift')}
          className="rounded-xl bg-green-50 border border-green-200 p-5 shadow hover:shadow-lg transition text-left"
        >
          <div className="flex items-center gap-3">
            <FileText className="h-8 w-8 text-green-600" />
            <div>
              <div className="font-bold text-lg">訪問記録</div>
              <div className="text-sm text-gray-500">
                自分のシフトと訪問記録
              </div>
            </div>
          </div>
        </button>

        {/* 日払い申請 */}
        <button
          onClick={() =>
            router.push('/portal/user_advance_payment_applications')
          }
          className="rounded-xl bg-amber-50 border border-amber-200 p-5 shadow hover:shadow-lg transition text-left"
        >
          <div className="flex items-center gap-3">
            <Wallet className="h-8 w-8 text-amber-600" />
            <div>
              <div className="font-bold text-lg">日払い申請</div>
              <div className="text-sm text-gray-500">
                1日分の給与をまとめて日払い申請できます
              </div>
            </div>
          </div>
        </button>

      </div>

      {/* LINE WORKS 利用ガイド */}
      <div className="mt-6">
        <details className="group rounded-xl border border-green-200 bg-white shadow-sm">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
            <div>
              <h2 className="text-base font-bold text-green-800">
                Myファミーユ × LINE WORKS 活用ガイド
              </h2>
              <p className="mt-0.5 text-xs text-gray-500">
                グループへの追加方法・ノート確認・外部トークルームの利用方法
              </p>
            </div>

            <span className="shrink-0 text-sm font-semibold text-green-700 group-open:hidden">
              開く ▼
            </span>

            <span className="hidden shrink-0 text-sm font-semibold text-green-700 group-open:inline">
              閉じる ▲
            </span>
          </summary>

          <div className="border-t border-green-100 bg-green-50/40 p-4">
            <div className="space-y-4">

              {/* ① */}
              <section className="rounded-lg border border-green-100 bg-white p-4">
                <h3 className="text-sm font-bold text-green-800">
                  ① 自分をLINE WORKSの利用者様グループへ追加する方法
                </h3>

                <p className="mt-2 text-sm text-gray-700">
                  Myファミーユのシフト画面から簡単に追加できます。
                </p>

                <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-gray-700">
                  <li>シフト詳細を開く</li>
                  <li>
                    <strong>「LINE WORKSグループ追加」</strong>
                    をタップ
                  </li>
                  <li>
                    AIエージェントが利用者様グループへ自動追加
                  </li>
                </ol>

                <div className="mt-3 rounded-md bg-green-50 p-3">
                  <p className="text-sm font-semibold text-green-800">
                    グループへ追加されると確認できる情報
                  </p>

                  <ul className="mt-2 grid list-disc grid-cols-1 gap-1 pl-5 text-sm text-gray-700 sm:grid-cols-2">
                    <li>利用者様の詳細情報</li>
                    <li>手順書</li>
                    <li>ノート</li>
                    <li>過去のやり取り</li>
                    <li>写真・ファイル</li>
                    <li>タイムライン</li>
                  </ul>
                </div>
              </section>

              {/* ② */}
              <section className="rounded-lg border border-green-100 bg-white p-4">
                <h3 className="text-sm font-bold text-green-800">
                  ② ノート（基本情報・手順書）の確認方法
                </h3>

                <p className="mt-2 text-sm text-gray-700">
                  利用者様グループに入ったら、次の手順で確認します。
                </p>

                <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-gray-700">
                  <li>利用者様グループを開く</li>
                  <li>右上の「≡（メニュー）」を開く</li>
                  <li>「ノート」を選択</li>
                </ol>

                <div className="mt-3 rounded-md bg-green-50 p-3">
                  <p className="text-sm font-semibold text-green-800">
                    ノートで確認できる内容
                  </p>

                  <ul className="mt-2 grid list-disc grid-cols-1 gap-1 pl-5 text-sm text-gray-700 sm:grid-cols-2">
                    <li>基本情報</li>
                    <li>手順書</li>
                    <li>注意事項</li>
                    <li>サービス提供時のポイント</li>
                  </ul>

                  <p className="mt-2 text-sm font-bold text-red-600">
                    訪問前には必ず確認しましょう。
                  </p>
                </div>
              </section>

              {/* ③ */}
              <section className="rounded-lg border border-amber-200 bg-white p-4">
                <h3 className="text-sm font-bold text-amber-800">
                  ③ ★部屋（外部トークルーム）について
                </h3>

                <p className="mt-2 text-sm text-gray-700">
                  ★マークやLINEマークが付いている部屋は、利用者様・相談員など
                  <strong>外部の方とのトークルーム</strong>
                  です。
                </p>

                <p className="mt-2 text-sm text-gray-700">
                  トーク一覧から、対象の部屋をタップすると入れます。
                </p>

                <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3">
                  <p className="text-sm font-bold text-red-700">
                    この部屋にはAIエージェントはいません。
                  </p>

                  <p className="mt-2 text-sm text-gray-700">
                    そのため、次のようなコメントを書き込まないでください。
                  </p>

                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-700">
                    <li>「私を退出させてください」</li>
                    <li>「グループから外してください」</li>
                  </ul>
                </div>
              </section>

              {/* ④ */}
              <section className="rounded-lg border border-amber-200 bg-white p-4">
                <h3 className="text-sm font-bold text-amber-800">
                  ④ 外部グループから退出する方法
                </h3>

                <p className="mt-2 text-sm text-gray-700">
                  外部トークルームは、自分で退出できます。
                </p>

                <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-gray-700">
                  <li>グループ右上のメニューを開く</li>
                  <li>「退出」を選択</li>
                  <li>確認する</li>
                </ol>

                <p className="mt-3 text-sm font-bold text-red-600">
                  AIエージェントへ退出を依頼する必要はありません。
                </p>
              </section>

              {/* 関連機能 */}
              <section className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                <h3 className="text-sm font-bold text-blue-800">
                  関連機能：「このシフトには入れない」
                </h3>

                <p className="mt-2 text-sm text-gray-700">
                  急な予定変更などで訪問できなくなった場合は、
                  <strong>「このシフトには入れない」</strong>
                  ボタンをご利用ください。
                </p>

                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-700">
                  <li>マネジャーへ通知</li>
                  <li>代替スタッフの調整開始</li>
                </ul>

                <p className="mt-3 text-sm font-bold text-red-600">
                  無断で欠勤せず、この機能から連絡してください。
                </p>
              </section>

            </div>
          </div>
        </details>
      </div>

      <div className="mt-8">
        <PerformanceScoreCard />
      </div>

      {/* 提出書類 */}
      <div className="mt-8 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <FileText className="h-6 w-6 text-gray-700" />

          <div>
            <h2 className="text-lg font-bold text-gray-900">
              提出書類
            </h2>

            <p className="text-sm text-gray-500">
              入社時などに提出した書類を確認できます。
            </p>
          </div>
        </div>

        {submittedDocs.length === 0 ? (
          <div className="mt-4 rounded-lg bg-gray-50 px-4 py-5 text-sm text-gray-500">
            現在、確認できる提出書類はありません。
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {submittedDocs.map((document, index) => (
              <div
                key={document.id ?? `${document.url}-${index}`}
                className="flex flex-col gap-3 rounded-lg border border-gray-200 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-gray-900">
                    {document.label ||
                      document.type ||
                      `提出書類 ${index + 1}`}
                  </div>

                  {document.type && document.label !== document.type && (
                    <div className="mt-1 text-xs text-gray-500">
                      書類区分：{document.type}
                    </div>
                  )}

                  {document.uploaded_at && (
                    <div className="mt-1 text-xs text-gray-500">
                      提出日：
                      {new Date(document.uploaded_at).toLocaleDateString(
                        'ja-JP',
                      )}
                    </div>
                  )}
                </div>

                <a
                  href={document.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex shrink-0 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
                >
                  書類を見る
                </a>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-8">
        <DocUploader
          title="資格情報（attachments 連携）"
          value={certs}
          onChange={onCertsChange}
          docMaster={{ certificate: docMaster.certificate }}
          docCategory="certificate"
          showPlaceholders={false}
        />
      </div>

      {/* あなたの資格からの判定だけ残す */}
      {services.length > 0 && (
        <div className="mt-4 p-3 border rounded">
          <div className="font-semibold">入れるサービス（あなたの資格から判定）</div>
          <ul className="list-disc pl-5">
            {services.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}


