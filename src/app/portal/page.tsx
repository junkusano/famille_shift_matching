// /app/portal/page.tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
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
  last_name_kanji: string | null;
  first_name_kanji: string | null;
  last_name_kana: string | null;
  first_name_kana: string | null;
  photo_url: string | null;
  attachments: Attachment[] | null;
};

export default function PortalHome() {
  const router = useRouter();

  const [me, setMe] = useState<UserRow | null>(null);
  const [certs, setCerts] = useState<DocItem[]>([]);
  const [docMaster, setDocMaster] = useState<{ certificate: string[]; other: string[] }>({
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

  return (
    <div className="content p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold flex items-center gap-3">
        <Image src="/myfamille_logo.png" alt="ファミーユロゴ" width={120} height={20} />
        ポータル（ホーム）
      </h1>

      <div className="mt-4 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-800 md:hidden">
        📱 各機能は左のオレンジ色のバーから利用できます。タップしてメニューを開いてください。
      </div>

      <div className="mt-4">
        <div className="text-lg font-semibold">氏名</div>
        <div>
          {me.last_name_kanji ?? ''} {me.first_name_kanji ?? ''}
        </div>
        <div className="mt-1 text-sm text-gray-500">
          ふりがな：{me.last_name_kana ?? ''} {me.first_name_kana ?? ''}
        </div>
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
                グループへの参加方法・ノート確認・退出方法
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
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">

              {/* ① 利用者様グループへ追加 */}
              <section className="rounded-lg border border-green-100 bg-white p-3">
                <h3 className="text-sm font-bold text-green-800">
                  ① 利用者様グループへ追加
                </h3>

                <p className="mt-2 text-sm text-gray-700">
                  シフト詳細を開き、
                  <strong>「LINE WORKSグループ追加」</strong>
                  をタップします。
                </p>

                <p className="mt-1 text-xs text-gray-500">
                  AIエージェントが利用者様グループへ自動追加します。
                </p>

                <Image
                  src="/guide/lineworks-group-add.png"
                  alt="LINE WORKSグループ追加ボタン"
                  width={700}
                  height={420}
                  className="mt-3 h-auto w-full rounded-lg border object-contain"
                />
              </section>

              {/* ② ノート確認 */}
              <section className="rounded-lg border border-green-100 bg-white p-3">
                <h3 className="text-sm font-bold text-green-800">
                  ② ノート（基本情報・手順書）を確認
                </h3>

                <p className="mt-2 text-sm text-gray-700">
                  グループ右上の
                  <strong>「≡」→「ノート」</strong>
                  を開きます。
                </p>

                <p className="mt-1 text-xs font-semibold text-red-600">
                  訪問前に、基本情報・手順書・注意事項を確認してください。
                </p>

                <Image
                  src="/guide/lineworks-note.png"
                  alt="LINE WORKSのノートを開く方法"
                  width={700}
                  height={420}
                  className="mt-3 h-auto w-full rounded-lg border object-contain"
                />
              </section>

              {/* ③ 外部トークルーム */}
              <section className="rounded-lg border border-amber-200 bg-white p-3">
                <h3 className="text-sm font-bold text-amber-800">
                  ③ ★部屋・LINEマークの部屋
                </h3>

                <p className="mt-2 text-sm text-gray-700">
                  利用者様や相談員など、
                  <strong>外部の方とつながっているトークルーム</strong>
                  です。
                </p>

                <p className="mt-1 text-xs font-semibold text-red-600">
                  この部屋にAIエージェントはいません。退出依頼を投稿しないでください。
                </p>

                <Image
                  src="/guide/lineworks-external-room.png"
                  alt="外部トークルームの見分け方"
                  width={700}
                  height={420}
                  className="mt-3 h-auto w-full rounded-lg border object-contain"
                />
              </section>

              {/* ④ 外部グループから退出 */}
              <section className="rounded-lg border border-amber-200 bg-white p-3">
                <h3 className="text-sm font-bold text-amber-800">
                  ④ 外部グループから退出
                </h3>

                <p className="mt-2 text-sm text-gray-700">
                  右上のメニューから
                  <strong>「退出」→「確認」</strong>
                  を選択します。
                </p>

                <p className="mt-1 text-xs text-gray-500">
                  外部トークルームは自分で退出できます。
                </p>

                <Image
                  src="/guide/lineworks-leave.png"
                  alt="LINE WORKSの外部グループから退出する方法"
                  width={700}
                  height={420}
                  className="mt-3 h-auto w-full rounded-lg border object-contain"
                />
              </section>
            </div>

            {/* 関連機能 */}
            <section className="mt-4 rounded-lg border border-blue-200 bg-white p-3">
              <h3 className="text-sm font-bold text-blue-800">
                関連機能：「このシフトには入れない」
              </h3>

              <p className="mt-2 text-sm text-gray-700">
                急な予定変更などで訪問できない場合は、
                <strong>「このシフトには入れない」</strong>
                ボタンから連絡してください。
              </p>

              <p className="mt-1 text-xs text-gray-500">
                マネジャーへ通知され、代替スタッフの調整が始まります。
              </p>

              <Image
                src="/guide/shift-unavailable.png"
                alt="このシフトには入れないボタン"
                width={700}
                height={420}
                className="mt-3 h-auto w-full rounded-lg border object-contain md:max-w-md"
              />
            </section>
          </div>
        </details>
      </div>

      <div className="mt-8">
        <PerformanceScoreCard />
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


