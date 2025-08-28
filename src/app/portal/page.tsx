// /app/portal/page.tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import DocUploader, { type DocItem, type Attachment, toAttachment } from '@/components/DocUploader';
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

  const isCertificateType = (t?: string | null) =>
    t === '資格証明書' || t === 'certificate' || t === 'certification';

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
        .filter((a) => a?.type === '資格証明書')  // ← 等価のみ
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
      type: docCategory === 'certificate' ? '資格証明書' : docCategory, // ★ 強制
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

      <div className="mt-4">
        <div className="text-lg font-semibold">氏名</div>
        <div>
          {me.last_name_kanji ?? ''} {me.first_name_kanji ?? ''}
        </div>
        <div className="mt-1 text-sm text-gray-500">
          ふりがな：{me.last_name_kana ?? ''} {me.first_name_kana ?? ''}
        </div>
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
