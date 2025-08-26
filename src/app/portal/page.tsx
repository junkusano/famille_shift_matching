//portal

'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { supabase } from '@/lib/supabaseClient';
import DocUploader, { type DocItem } from '@/components/DocUploader';

type Attachment = {
  id: string;
  url: string | null;
  type?: string;
  label?: string;
  mimeType?: string | null;
  uploaded_at?: string; // ISO
  acquired_at?: string; // ISO
};

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

type DocMasterRow = { category: string; label: string; sort_order?: number; is_active?: boolean };

const toIsoOr = (s?: string) => (s ? s : new Date().toISOString());
const getErrorMessage = (err: unknown) =>
  err instanceof Error ? err.message : typeof err === 'string' ? err : '不明なエラーです';

export default function PortalHome() {
  const router = useRouter();
  const [me, setMe] = useState<UserRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [certs, setCerts] = useState<DocItem[]>([]);
  const [docMaster, setDocMaster] = useState<{ certificate: string[] }>({ certificate: [] });

  const isCert = (att?: Attachment) => {
    if (!att) return false;
    if (att.type && ['資格証', '資格証明書', 'certificate'].includes(att.type)) return true;
    if (att.label && att.label.startsWith('certificate_')) return true;
    return false;
  };

  const attachmentsArray: Attachment[] = useMemo(() => {
    if (!Array.isArray(me?.attachments)) return [];
    return me!.attachments.map((p) => ({
      id: p.id ?? crypto.randomUUID(),
      url: p.url ?? null,
      type: p.type,
      label: p.label,
      mimeType: p.mimeType ?? null,
      uploaded_at: toIsoOr(p.uploaded_at),
      acquired_at: toIsoOr(p.acquired_at ?? p.uploaded_at),
    }));
  }, [me]);

  const loadMe = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { router.push('/login'); return; }

    const { data, error } = await supabase
      .from('form_entries')
      .select('id, auth_uid, last_name_kanji, first_name_kanji, last_name_kana, first_name_kana, photo_url, attachments')
      .eq('auth_uid', auth.user.id)
      .maybeSingle();

    if (error || !data) return;

    setMe(data as UserRow);

    const certItems: DocItem[] = (data.attachments ?? [])
      .filter(isCert)
      .map((p: Attachment): DocItem => ({
        id: p.id,
        url: p.url,
        label: p.label,
        type: '資格証明書',
        mimeType: p.mimeType ?? null,
        uploaded_at: toIsoOr(p.uploaded_at),
        acquired_at: toIsoOr(p.acquired_at ?? p.uploaded_at),
      }));

    setCerts(certItems);
  }, [router]);

  useEffect(() => { void loadMe(); }, [loadMe]);

  // user_doc_master: category=certificate を sort_order 昇順
  useEffect(() => {
    const run = async () => {
      const { data, error } = await supabase
        .from('user_doc_master')
        .select('category,label,is_active,sort_order')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (!error && data) {
        const cert = (data as DocMasterRow[])
          .filter(r => r.category === 'certificate')
          .map(r => r.label);
        setDocMaster({ certificate: cert });
      }
    };
    void run();
  }, []);

  // 保存：DocUploaderの値をattachments(JSON)にマージ
  const handleSave = async () => {
    if (!me) return;
    setSaving(true);
    try {
      const others = attachmentsArray.filter(a => !isCert(a));
      const now = new Date().toISOString();
      const certAsAttachments: Attachment[] = certs.map(d => ({
        id: d.id ?? crypto.randomUUID(),
        url: d.url ?? null,
        type: '資格証明書',
        label: d.label,
        mimeType: d.mimeType ?? null,
        uploaded_at: d.uploaded_at ?? now,
        acquired_at: d.acquired_at ?? d.uploaded_at ?? now,
      }));
      const merged = [...others, ...certAsAttachments];

      const { error } = await supabase
        .from('form_entries')
        .update({ attachments: merged })
        .eq('id', me.id);

      if (error) throw error;
      setMe(prev => (prev ? { ...prev, attachments: merged } : prev));
      alert('資格情報を保存しました。');
    } catch (err: unknown) {
      alert('保存に失敗しました：' + getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (!me) return <p className="p-4">読み込み中...</p>;

  return (
    <div className="content p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold flex items-center gap-3">
        <Image src="/myfamille_logo.png" alt="ファミーユロゴ" width={120} height={20} />
        ポータル（ホーム）
      </h1>

      <div className="mt-6">
        <div className="text-lg font-semibold">氏名</div>
        <div>{me.last_name_kanji ?? ''} {me.first_name_kanji ?? ''}</div>
        <div className="mt-2 text-sm text-gray-500">ふりがな：{me.last_name_kana ?? ''} {me.first_name_kana ?? ''}</div>
      </div>

      <div className="mt-8">
        <DocUploader
          title="資格情報（attachments 連携）"
          value={certs}
          onChange={setCerts}
          docMaster={{ certificate: docMaster.certificate }}
          docCategory="certificate"
          uploadApiPath="/api/upload"
        />
        <button
          onClick={handleSave}
          disabled={saving}
          className="mt-2 px-3 py-1 bg-green-600 text-white rounded"
        >
          {saving ? '保存中…' : '資格情報を保存'}
        </button>
      </div>
    </div>
  );
}
