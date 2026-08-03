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
      <div className="mt-8 rounded-xl border border-green-200 bg-green-50 p-6 shadow-sm">
        <h2 className="text-2xl font-bold text-green-800 mb-4">
          Myファミーユ × LINE WORKS 活用ガイド
        </h2>

        <div className="space-y-8">

          {/* ① */}
          <section>
            <h3 className="font-bold text-lg text-green-700 mb-2">
              ① 自分をLINE WORKSの利用者様グループへ追加する方法
            </h3>

            <p className="mb-3">
              Myファミーユのシフト画面から簡単に追加できます。
            </p>

            <ol className="list-decimal ml-6 space-y-1">
              <li>シフト詳細を開く</li>
              <li>「LINE WORKSグループ追加」をタップ</li>
              <li>AIエージェントが利用者様グループへ自動追加</li>
            </ol>

            <div className="mt-3 rounded-lg bg-white p-4 border">
              <div className="font-semibold mb-2">追加すると確認できる情報</div>
              <ul className="grid md:grid-cols-2 gap-y-1 list-disc ml-6">
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
          <section>
            <h3 className="font-bold text-lg text-green-700 mb-2">
              ② ノート（基本情報・手順書）の確認方法
            </h3>

            <ol className="list-decimal ml-6 space-y-1">
              <li>利用者様グループを開く</li>
              <li>右上の「≡（メニュー）」を開く</li>
              <li>「ノート」を選択</li>
            </ol>

            <div className="mt-3 rounded-lg bg-white p-4 border">
              <div className="font-semibold mb-2">
                ノートで確認できる内容
              </div>

              <ul className="grid md:grid-cols-2 gap-y-1 list-disc ml-6">
                <li>基本情報</li>
                <li>手順書</li>
                <li>注意事項</li>
                <li>サービス提供時のポイント</li>
              </ul>

              <p className="mt-3 text-red-600 font-semibold">
                訪問前には必ず確認しましょう。
              </p>
            </div>
          </section>

          {/* ③ */}
          <section>
            <h3 className="font-bold text-lg text-green-700 mb-2">
              ③ ★部屋（外部トークルーム）について
            </h3>

            <div className="rounded-lg border bg-white p-4">
              <p>
                ★マークやLINEマークが付いている部屋は、
                <strong>利用者様・相談員など外部の方とのトークルーム</strong>
                です。
              </p>

              <p className="mt-3 font-bold text-red-600">
                この部屋にはAIエージェントはいません。
              </p>

              <div className="mt-4 rounded-lg bg-red-50 border border-red-200 p-3">
                <div className="font-bold mb-2">
                  投稿しないでください
                </div>

                <ul className="list-disc ml-6">
                  <li>「私を退出させてください」</li>
                  <li>「グループから外してください」</li>
                </ul>

                <p className="mt-2">
                  このようなコメントは書き込まないようにしてください。
                </p>
              </div>
            </div>
          </section>

          {/* ④ */}
          <section>
            <h3 className="font-bold text-lg text-green-700 mb-2">
              ④ 外部グループから退出する方法
            </h3>

            <ol className="list-decimal ml-6 space-y-1">
              <li>グループ右上のメニュー</li>
              <li>「退出」を選択</li>
              <li>確認</li>
            </ol>

            <p className="mt-3 font-semibold">
              外部トークルームは自分で退出できます。
            </p>

            <p className="text-red-600 font-bold">
              AIへ依頼する必要はありません。
            </p>
          </section>

          {/* 関連機能 */}
          <section className="rounded-lg border border-blue-200 bg-blue-50 p-4">
            <h3 className="font-bold text-blue-700 mb-2">
              関連機能：「このシフトには入れない」
            </h3>

            <p>
              急な予定変更などで訪問できなくなった場合は、
              <strong>「このシフトには入れない」</strong>
              ボタンをご利用ください。
            </p>

            <ul className="list-disc ml-6 mt-3">
              <li>マネジャーへ通知</li>
              <li>代替スタッフの調整開始</li>
            </ul>

            <p className="mt-3 font-semibold text-red-600">
              無断で欠勤せず、この機能から連絡してください。
            </p>
          </section>

        </div>
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


