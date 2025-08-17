// C:\Users\USER\famille_shift_matching\src\app\portal\kaipoke-info-detail\[id]\page.tsx
'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

/** -----------------------------
 *  util: ISO → input[type=datetime-local] 値（先に宣言しておく）
 *  ----------------------------- */
function toLocalInputValue(iso: string) {
    try {
        const d = new Date(iso);
        const pad = (n: number) => String(n).padStart(2, '0');
        const yyyy = d.getFullYear();
        const mm = pad(d.getMonth() + 1);
        const dd = pad(d.getDate());
        const hh = pad(d.getHours());
        const mi = pad(d.getMinutes());
        return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
    } catch {
        return '';
    }
}


/** -----------------------------
 *  型定義
 *  ----------------------------- */
type Attachment = {
    url: string | null;
    label?: string;
    type?: string;
    mimeType?: string | null;
};

type KaipokeInfo = {
    id: string;
    kaipoke_cs_id: string | null;
    name: string | null;
    end_at: string | null; // timestamp
    service_kind: string | null;
    email: string | null;
    biko: string | null;
    gender_request: string | null; // uuid文字列
    postal_code: string | null;
    standard_route: string | null;
    commuting_flg: boolean | null;
    standard_trans_ways: string | null;
    standard_purpose: string | null;

    // 追加分
    documents: Attachment[] | null; // JSONB
    time_adjustability_id: string | null; // マスタ参照
};

type DocMasterRow = {
    category: 'certificate' | 'other';
    label: string;
    sort_order?: number;
    is_active?: boolean;
};

type TimeAdjustRow = { id: string; label: string };

const GENDER_OPTIONS = [
    { id: '', label: '未設定' },
    { id: '9b32a1f0-f711-4ab4-92fb-0331f0c86d42', label: '男性希望' },
    { id: '42224870-c644-48a5-87e2-7df9c24bca5b', label: '女性希望' },
    { id: '554d705b-85ec-4437-9352-4b026e2e904f', label: '男女問わず' },
];

/** -----------------------------
 *  ページ本体
 *  ----------------------------- */
export default function KaipokeInfoDetailPage() {
    const params = useParams<{ id: string }>();
    const id = params?.id;

    const [row, setRow] = useState<KaipokeInfo | null>(null);
    const [saving, setSaving] = useState(false);

    // 書類マスタ（entry と同じ user_doc_master を使用）
    const [docMaster, setDocMaster] = useState<{ certificate: string[]; other: string[] }>({
        certificate: [],
        other: [],
    });
    const [useCustomOther, setUseCustomOther] = useState(false);
    const [newDocLabel, setNewDocLabel] = useState('');

    // 時間変更可否マスタ
    const [timeAdjustOptions, setTimeAdjustOptions] = useState<TimeAdjustRow[]>([]);

    // 初期ロード
    useEffect(() => {
        const fetchRow = async () => {
            if (!id) return;
            const { data, error } = await supabase
                .from('cs_kaipoke_info')
                .select('*')
                .eq('id', id)
                .single();

            if (error) {
                console.error('fetch error:', error.message);
                return;
            }

            // documents は配列で持つ
            const docs = Array.isArray(data.documents) ? (data.documents as Attachment[]) : [];
            setRow({ ...data, documents: docs } as KaipokeInfo);
        };

        const loadDocMaster = async () => {
            const { data, error } = await supabase
                .from('user_doc_master')
                .select('category,label,is_active,sort_order')
                .eq('is_active', true)
                .eq('category', 'cs_doc') // ★ category=cs_doc のみに絞る
                .order('sort_order', { ascending: true });
            if (!error && data) {
                const labels = (data as DocMasterRow[]).map((r) => r.label);
                setDocMaster({ certificate: [], other: labels });
            }
        };

        const loadTimeAdjust = async () => {
            const { data, error } = await supabase
                .from('cs_kaipoke_time_adjustability')
                .select('id,label')
                .eq('is_active', true)
                .order('sort_order');
            if (!error && data) setTimeAdjustOptions(data as TimeAdjustRow[]);
        };

        fetchRow();
        loadDocMaster();
        loadTimeAdjust();
    }, [id]);

    const documentsArray = useMemo<Attachment[]>(() => {
        return Array.isArray(row?.documents) ? (row?.documents as Attachment[]) : [];
    }, [row?.documents]);

    /** ------------- 共通ヘルパ ------------- */
    const uploadFileViaApi = async (file: File) => {
        const form = new FormData();
        form.append('file', file);
        form.append('filename', `${Date.now()}_${file.name}`);

        const res = await fetch('/api/upload', { method: 'POST', body: form });
        if (!res.ok) throw new Error('upload failed');
        const json = await res.json();

        // file.type が空のケースの補完
        const lower = file.name.toLowerCase();
        const guess = lower.endsWith('.pdf')
            ? 'application/pdf'
            : lower.endsWith('.png')
                ? 'image/png'
                : lower.endsWith('.jpg') || lower.endsWith('.jpeg')
                    ? 'image/jpeg'
                    : null;

        const mimeType = (file.type || json.mimeType || guess || null) as string | null;
        return { url: json.url as string, mimeType };
    };

    const saveDocuments = async (next: Attachment[]) => {
        if (!row) return;
        const { error } = await supabase
            .from('cs_kaipoke_info')
            .update({ documents: next })
            .eq('id', row.id);
        if (error) throw new Error(error.message);
        setRow({ ...row, documents: next });
    };

    const upsertAttachment = (list: Attachment[], item: Attachment, key: 'label' | 'type') => {
        const getKey = (a: Attachment) => (key === 'label' ? a.label : a.type);
        const idx = list.findIndex((a) => getKey(a) === getKey(item));
        if (idx >= 0) {
            const next = [...list];
            next[idx] = { ...list[idx], ...item };
            return next;
        }
        return [...list, item];
    };

    const handleOtherDocUpload = async (file: File, label: string) => {
        if (!row) return;
        if (!label) {
            alert('書類名を選択または入力してください');
            return;
        }
        const { url, mimeType } = await uploadFileViaApi(file);
        const current = documentsArray;
        const next = upsertAttachment(current, { url, label, type: 'その他', mimeType }, 'label');
        await saveDocuments(next);
        alert(`${label} をアップロードしました`);
    };

    const handleDeleteAttachment = async (by: { label?: string; type?: string }) => {
        if (!row) return;
        const current = documentsArray;
        const next = current.filter((a) => (by.label ? a.label !== by.label : by.type ? a.type !== by.type : true));
        await saveDocuments(next);
        alert('書類を削除しました');
    };

    /** ------------- 保存 ------------- */
    const handleSaveAll = async () => {
        if (!row) return;
        setSaving(true);
        try {
            const { error } = await supabase
                .from('cs_kaipoke_info')
                .update({
                    // 文字列は空は null に寄せる
                    name: (row.name ?? '').trim() || null,
                    kaipoke_cs_id: (row.kaipoke_cs_id ?? '').trim() || null,
                    end_at: row.end_at || null,
                    service_kind: (row.service_kind ?? '').trim() || null,
                    email: (row.email ?? '').trim() || null,
                    biko: row.biko ?? null,
                    gender_request: row.gender_request || null,
                    postal_code: (row.postal_code ?? '').trim() || null,
                    standard_route: row.standard_route ?? null,
                    commuting_flg: !!row.commuting_flg,
                    standard_trans_ways: row.standard_trans_ways ?? null,
                    standard_purpose: row.standard_purpose ?? null,
                    time_adjustability_id: row.time_adjustability_id || null, // ★修正：FK を保存

                    // documents は別ハンドラでも更新しているが、同時に送ってもOK
                    documents: documentsArray,
                })
                .eq('id', row.id);

            if (error) {
                alert(`保存に失敗しました：${error.message}`);
            } else {
                alert('保存しました');
            }
        } finally {
            setSaving(false);
        }
    };

    if (!row) return <div className="p-4">読み込み中...</div>;

    return (
        <div className="max-w-5xl mx-auto p-6 bg-white rounded shadow space-y-6">
            <div className="flex items-center justify-between gap-3">
                <h1 className="text-2xl font-bold">カイポケ情報 詳細</h1>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleSaveAll}
                        disabled={saving}
                        className="px-4 py-2 bg-green-700 text-white rounded shadow hover:bg-green-800"
                    >
                        {saving ? '保存中...' : '保存'}
                    </button>
                    <Link href="/portal/kaipoke-info" className="px-4 py-2 bg-blue-600 text-white rounded shadow hover:bg-blue-700">
                        戻る
                    </Link>
                </div>
            </div>

            {/* 基本情報 */}
            <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <label className="block text-sm text-gray-600">ID（読み取り専用）</label>
                    <input className="w-full border rounded px-2 py-1 bg-gray-100" value={row.id} readOnly />
                </div>

                <div className="space-y-2">
                    <label className="block text-sm text-gray-600">利用者様名</label>
                    <input className="w-full border rounded px-2 py-1" value={row.name ?? ''} onChange={(e) => setRow({ ...row, name: e.target.value })} />
                </div>

                <div className="space-y-2">
                    <label className="block text-sm text-gray-600">カイポケ内部ID</label>
                    <input className="w-full border rounded px-2 py-1" value={row.kaipoke_cs_id ?? ''} onChange={(e) => setRow({ ...row, kaipoke_cs_id: e.target.value })} />
                </div>

                <div className="space-y-2">
                    <label className="block text-sm text-gray-600">サービス種別</label>
                    <input className="w-full border rounded px-2 py-1" value={row.service_kind ?? ''} onChange={(e) => setRow({ ...row, service_kind: e.target.value })} />
                </div>

                <div className="space-y-2">
                    <label className="block text-sm text-gray-600">最終利用予定日（end_at）</label>
                    <input
                        type="datetime-local"
                        className="w-full border rounded px-2 py-1"
                        value={row.end_at ? toLocalInputValue(row.end_at) : ''}
                        onChange={(e) => {
                            const v = e.target.value ? new Date(e.target.value).toISOString() : null;
                            setRow({ ...row, end_at: v });
                        }}
                    />
                </div>

                <div className="space-y-2">
                    <label className="block text-sm text-gray-600">郵便番号</label>
                    <input
                        className="w-full border rounded px-2 py-1"
                        value={row.postal_code ?? ''}
                        onChange={(e) => setRow({ ...row, postal_code: e.target.value.replace(/[^0-9\-]/g, '') })}
                        placeholder="000-0000"
                        maxLength={8}
                    />
                </div>

                <div className="space-y-2">
                    <label className="block text-sm text-gray-600">メール</label>
                    <input type="email" className="w-full border rounded px-2 py-1" value={row.email ?? ''} onChange={(e) => setRow({ ...row, email: e.target.value })} />
                </div>

                <div className="space-y-2">
                    <label className="block text-sm text-gray-600">性別希望</label>
                    <select className="w-full border rounded px-2 py-1" value={row.gender_request ?? ''} onChange={(e) => setRow({ ...row, gender_request: e.target.value })}>
                        {GENDER_OPTIONS.map((o) => (
                            <option key={o.id} value={o.id}>
                                {o.label}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="space-y-2">
                    <label className="block text-sm text-gray-600">通所・通学フラグ</label>
                    <div className="flex items-center gap-2">
                        <input type="checkbox" checked={!!row.commuting_flg} onChange={(e) => setRow({ ...row, commuting_flg: e.target.checked })} />
                        <span className="text-sm text-gray-600">通所/通学あり</span>
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="block text-sm text-gray-600">時間変更可否（マスタ選択）</label>
                    <div className="flex gap-2">
                        <select
                            value={row.time_adjustability_id ?? ''}
                            onChange={(e) => setRow({ ...row, time_adjustability_id: e.target.value || null })}
                            className="border rounded px-2 py-1"
                        >
                            <option value="">（選択）</option>
                            {timeAdjustOptions.map((opt) => (
                                <option key={opt.id} value={opt.id}>
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="md:col-span-2 space-y-2">
                    <label className="block text-sm text-gray-600">備考</label>
                    <textarea className="w-full border rounded px-2 py-1 h-24" value={row.biko ?? ''} onChange={(e) => setRow({ ...row, biko: e.target.value })} />
                </div>

                <div className="space-y-2">
                    <label className="block text-sm text-gray-600">ルート（初期値）</label>
                    <textarea className="w-full border rounded px-2 py-1 h-20" value={row.standard_route ?? ''} onChange={(e) => setRow({ ...row, standard_route: e.target.value })} />
                </div>
                <div className="space-y-2">
                    <label className="block text-sm text-gray-600">手段（初期値）</label>
                    <textarea className="w-full border rounded px-2 py-1 h-20" value={row.standard_trans_ways ?? ''} onChange={(e) => setRow({ ...row, standard_trans_ways: e.target.value })} />
                </div>
                <div className="space-y-2">
                    <label className="block text-sm text-gray-600">目的（初期値）</label>
                    <textarea className="w-full border rounded px-2 py-1 h-20" value={row.standard_purpose ?? ''} onChange={(e) => setRow({ ...row, standard_purpose: e.target.value })} />
                </div>
            </div>

            {/* 書類（documents: JSONB） */}
            <div className="space-y-2">
                <h2 className="text-lg font-semibold">書類（JSONB: documents）</h2>

                {documentsArray.length > 0 ? (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {documentsArray.map((doc, idx) => {
                            const label = doc.label ?? doc.type ?? `doc_${idx + 1}`;
                            return (
                                <div key={idx}>
                                    <FileThumbnail title={label} src={doc.url ?? undefined} mimeType={doc.mimeType ?? undefined} />
                                    <div className="mt-2 flex items-center gap-2">
                                        <label className="px-2 py-1 bg-blue-600 text-white rounded cursor-pointer">
                                            差し替え
                                            <input
                                                type="file"
                                                accept="image/*,application/pdf"
                                                className="hidden"
                                                onChange={async (e) => {
                                                    const f = e.target.files?.[0];
                                                    if (!f) return;
                                                    const { url, mimeType } = await uploadFileViaApi(f);
                                                    const next = upsertAttachment(
                                                        documentsArray,
                                                        { url, label, type: doc.type ?? 'その他', mimeType },
                                                        'label'
                                                    );
                                                    await saveDocuments(next);
                                                    alert(`${label} を差し替えました`);
                                                    e.currentTarget.value = '';
                                                }}
                                            />
                                        </label>
                                        <button className="px-2 py-1 bg-red-600 text-white rounded" onClick={() => handleDeleteAttachment({ label })}>
                                            削除
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="text-sm text-gray-500">まだ登録されていません。</div>
                )}

                {/* 追加アップロード */}
                <div className="mt-3 p-3 border rounded bg-gray-50">
                    <div className="flex items-center gap-2">
                        <select
                            className="border rounded px-2 py-1"
                            value={useCustomOther ? '__custom__' : newDocLabel || ''}
                            onChange={(e) => {
                                const v = e.target.value;
                                if (v === '__custom__') {
                                    setUseCustomOther(true);
                                    setNewDocLabel('');
                                } else {
                                    setUseCustomOther(false);
                                    setNewDocLabel(v);
                                }
                            }}
                        >
                            <option value="">書類名を選択</option>
                            {docMaster.other.map((name) => (
                                <option key={name} value={name}>
                                    {name}
                                </option>
                            ))}
                            <option value="__custom__">（カスタム入力）</option>
                        </select>


                        {useCustomOther && (
                            <input
                                className="border rounded px-2 py-1"
                                placeholder="例：支援計画書（控）"
                                value={newDocLabel}
                                onChange={(e) => setNewDocLabel(e.target.value)}
                            />
                        )}

                        <label className="px-2 py-1 bg-green-700 text-white rounded cursor-pointer">
                            追加アップロード
                            <input
                                type="file"
                                accept="image/*,application/pdf"
                                className="hidden"
                                onChange={async (e) => {
                                    const f = e.target.files?.[0];
                                    if (f && (newDocLabel || useCustomOther)) {
                                        await handleOtherDocUpload(f, (newDocLabel || '').trim());
                                    } else {
                                        alert('書類名を選択してください');
                                    }
                                }}
                            />
                        </label>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                        区分：その他書類（エントリー詳細と同じマスタ <code>user_doc_master</code> を利用）
                    </div>
                </div>
            </div>
        </div>
    );
}

/** -----------------------------
 *  FileThumbnail: 画像表示＋PDFボタン（entry-detailと同設計）
 *  ----------------------------- */
function FileThumbnail({ title, src, mimeType }: { title: string; src?: string; mimeType?: string | null }) {
    if (!src) {
        return (
            <div className="text-sm text-center text-gray-500">
                {title}
                <br />
                ファイルなし
            </div>
        );
    }

    // Google Drive の fileId を URL から抽出
    const fileIdMatch = src.match(/[-\w]{25,}/);
    const fileId = fileIdMatch ? fileIdMatch[0] : null;
    if (!fileId) {
        return (
            <div className="text-sm text-center text-red-500">
                {title}
                <br />
                無効なURL
            </div>
        );
    }

    const mt = (mimeType || '').toLowerCase();
    const titleLower = (title || '').toLowerCase();

    const isPdf = mt === 'application/pdf' || /\.pdf$/.test(titleLower);
    const isImage = mt.startsWith('image/');

    const viewUrl = `https://drive.google.com/uc?export=view&id=${fileId}`;
    const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;

    if (isPdf) {
        return (
            <div className="text-sm text-center">
                <p className="mb-1">{title}</p>
                <a href={downloadUrl} target="_blank" rel="noopener noreferrer" className="inline-block p-2 border rounded bg-gray-100 hover:bg-gray-200">
                    📄 PDF/ファイルを開く
                </a>
            </div>
        );
    }

    if (isImage) {
        return (
            <div className="text-sm text-center">
                <p className="mb-1">{title}</p>
                <Image src={viewUrl} alt={title} width={320} height={192} className="w-full h-auto max-h-48 object-contain rounded border hover:scale-105 transition-transform" />
                <div className="mt-2">
                    <a href={viewUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
                        ファイルとして開く
                    </a>
                </div>
            </div>
        );
    }

    return (
        <div className="text-sm text-center">
            <p className="mb-1">{title}</p>
            <a href={downloadUrl} target="_blank" rel="noopener noreferrer" className="inline-block p-2 border rounded bg-gray-100 hover:bg-gray-200">
                📎 ファイルを開く
            </a>
        </div>
    );
}

// （toLocalInputValue は先頭側に移動済み）
