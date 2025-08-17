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
        const tzOffset = d.getTimezoneOffset();
        const local = new Date(d.getTime() - tzOffset * 60 * 1000);
        return local.toISOString().slice(0, 16);
    } catch {
        return '';
    }
};

/** 補助: YYYYMM または YYYYMMDD を ISO(+09:00)へ */
function parseAcquired(raw: string | undefined | null): string {
    const s = (raw ?? '').replace(/\D/g, '');
    if (/^\d{8}$/.test(s)) {
        const y = s.slice(0, 4), m = s.slice(4, 6), d = s.slice(6, 8);
        return `${y}-${m}-${d}T00:00:00+09:00`;
    }
    if (/^\d{6}$/.test(s)) {
        const y = s.slice(0, 4), m = s.slice(4, 6);
        return `${y}-${m}-01T00:00:00+09:00`;
    }
    return new Date().toISOString();
}

function formatAcquired(iso: string) {
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    // 月指定(01日固定)っぽければ YYYY/MM 表示
    return day === '01' ? `${y}/${m}` : `${y}/${m}/${day}`;
}

/** -----------------------------
 *  型定義
 *  ----------------------------- */
type Attachment = {
    id: string;                 // 一意ID（重複ラベル対応）
    url: string | null;
    label?: string;             // 書類名（同名可）
    type?: string;
    mimeType?: string | null;
    uploaded_at: string;        // 保存日時（ISO）
    acquired_at: string;        // 取得日（ISO）
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

    // 取得日の簡易入力(YYYYMM or YYYYMMDD)
    const [acquiredRaw, setAcquiredRaw] = useState<string>('');

    // 書類マスタ（entry と同じ user_doc_master を使用）
    const [docMaster, setDocMaster] = useState<{ certificate: string[]; other: string[] }>({
        certificate: [],
        other: [],
    });
    const [useCustomOther, setUseCustomOther] = useState(false);
    const [newDocLabel, setNewDocLabel] = useState('');

    const [timeAdjustOptions, setTimeAdjustOptions] = useState<TimeAdjustRow[]>([]);

    useEffect(() => {
        if (!id) return;
        const fetchRow = async () => {
            const { data, error } = await supabase
                .from('cs_kaipoke_info')
                .select('*')
                .eq('id', id)
                .maybeSingle();
            if (!error && data) setRow(data as unknown as KaipokeInfo);
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
                .from('user_time_adjustability')
                .select('id,label')
                .order('sort_order');
            if (!error && data) setTimeAdjustOptions(data as TimeAdjustRow[]);
        };

        fetchRow();
        loadDocMaster();
        loadTimeAdjust();
    }, [id]);

    const documentsArray = useMemo<Attachment[]>(() => {
        const arr: unknown[] = Array.isArray(row?.documents) ? (row?.documents as unknown[]) : [];
        // 後方互換: id/日付が無い要素に補完して返す
        return arr.map((d, i) => {
            const doc = d as Partial<Attachment>;
            return {
                id: doc.id ?? crypto.randomUUID(),
                url: doc.url ?? null,
                label: doc.label,
                type: doc.type,
                mimeType: doc.mimeType ?? null,
                uploaded_at: doc.uploaded_at ?? new Date().toISOString(),
                acquired_at: doc.acquired_at ?? doc.uploaded_at ?? new Date().toISOString(),
            } satisfies Attachment;
        });
    }, [row?.documents]);

    /** ------------- 共通ヘルパ ------------- */
    const uploadFileViaApi = async (file: File) => {
        const form = new FormData();
        form.append('file', file);

        const res = await fetch('/api/upload/drive', {
            method: 'POST',
            body: form,
        });
        if (!res.ok) throw new Error('アップロードに失敗しました');
        const json = await res.json();
        return { url: json.url as string, mimeType: json.mimeType as string | null };
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

    const addAttachment = (list: Attachment[], item: Attachment) => {
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
        const nowIso = new Date().toISOString();
        const item: Attachment = {
            id: crypto.randomUUID(),
            url, label, type: 'その他', mimeType,
            uploaded_at: nowIso,
            acquired_at: parseAcquired(acquiredRaw)
        };
        const next = addAttachment(current, item);
        await saveDocuments(next);
        alert(`${label} をアップロードしました`);
    };

    const handleDeleteById = async (id: string) => {
        if (!row) return;
        const current = documentsArray;
        const next = current.filter((a) => a.id !== id);
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
                    biko: (row.biko ?? '').trim() || null,
                    gender_request: row.gender_request || null,
                    postal_code: (row.postal_code ?? '').trim() || null,
                    standard_route: (row.standard_route ?? '').trim() || null,
                    commuting_flg: row.commuting_flg ?? null,
                    standard_trans_ways: (row.standard_trans_ways ?? '').trim() || null,
                    standard_purpose: (row.standard_purpose ?? '').trim() || null,
                    time_adjustability_id: row.time_adjustability_id || null,
                })
                .eq('id', row.id);
            if (error) throw new Error(error.message);
            alert('保存しました');
        } catch (e) {
            const err = e instanceof Error ? e : new Error(String(e));
            alert(`保存に失敗: ${err.message}`);
        } finally {
            setSaving(false);
        }
    };

    if (!row) return <div className="p-4">読み込み中...</div>;

    return (
        <div className="p-4 space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-xl font-bold">CS詳細</h1>
                <div className="flex items-center gap-2">
                    <button
                        className="px-4 py-2 border rounded shadow hover:bg-gray-50"
                        onClick={handleSaveAll}
                        disabled={saving}
                    >
                        {saving ? '保存中…' : '保存'}
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
                    <input
                        className="w-full border rounded px-2 py-1"
                        value={row.name ?? ''}
                        onChange={(e) => setRow({ ...row, name: e.target.value })}
                    />
                </div>

                <div className="space-y-2">
                    <label className="block text-sm text-gray-600">カイポケCS ID</label>
                    <input
                        className="w-full border rounded px-2 py-1"
                        value={row.kaipoke_cs_id ?? ''}
                        onChange={(e) => setRow({ ...row, kaipoke_cs_id: e.target.value })}
                    />
                </div>

                <div className="space-y-2">
                    <label className="block text-sm text-gray-600">終了日</label>
                    <input
                        type="datetime-local"
                        className="w-full border rounded px-2 py-1"
                        value={row.end_at ? toLocalInputValue(row.end_at) : ''}
                        onChange={(e) => {
                            const v = e.target.value;
                            setRow({ ...row, end_at: v ? new Date(v).toISOString() : null });
                        }}
                    />
                </div>

                <div className="space-y-2">
                    <label className="block text-sm text-gray-600">サービス区分</label>
                    <input
                        className="w-full border rounded px-2 py-1"
                        value={row.service_kind ?? ''}
                        onChange={(e) => setRow({ ...row, service_kind: e.target.value })}
                    />
                </div>

                <div className="space-y-2">
                    <label className="block text-sm text-gray-600">メール</label>
                    <input
                        type="email"
                        className="w-full border rounded px-2 py-1"
                        value={row.email ?? ''}
                        onChange={(e) => setRow({ ...row, email: e.target.value })}
                    />
                </div>
            </div>

            {/* 備考 */}
            <div className="space-y-2">
                <label className="block text-sm text-gray-600">備考</label>
                <textarea
                    className="w-full border rounded p-2"
                    rows={3}
                    value={row.biko ?? ''}
                    onChange={(e) => setRow({ ...row, biko: e.target.value })}
                />
            </div>

            {/* 希望性別 */}
            <div className="space-y-2">
                <label className="block text-sm text-gray-600">希望性別</label>
                <select
                    className="border rounded px-2 py-1"
                    value={row.gender_request ?? ''}
                    onChange={(e) => setRow({ ...row, gender_request: e.target.value || null })}
                >
                    {GENDER_OPTIONS.map((g) => (
                        <option key={g.id} value={g.id}>{g.label}</option>
                    ))}
                </select>
            </div>

            {/* 郵便番号 */}
            <div className="space-y-2">
                <label className="block text-sm text-gray-600">郵便番号</label>
                <input
                    className="w-full border rounded px-2 py-1"
                    value={row.postal_code ?? ''}
                    onChange={(e) => setRow({ ...row, postal_code: e.target.value })}
                />
            </div>

            {/* 標準ルート / 通勤可否 / 手段 / 目的 */}
            <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <label className="block text-sm text-gray-600">標準ルート（初期値）</label>
                    <textarea className="w-full border rounded p-2" rows={2} value={row.standard_route ?? ''} onChange={(e) => setRow({ ...row, standard_route: e.target.value })} />
                </div>
                <div className="space-y-2">
                    <label className="block text-sm text-gray-600">通勤可否（初期値）</label>
                    <select className="border rounded px-2 py-1" value={row.commuting_flg ? '1' : '0'} onChange={(e) => setRow({ ...row, commuting_flg: e.target.value === '1' })}>
                        <option value="0">不可</option>
                        <option value="1">可</option>
                    </select>
                </div>
                <div className="space-y-2">
                    <label className="block text-sm text-gray-600">手段（初期値）</label>
                    <textarea className="w-full border rounded p-2" rows={2} value={row.standard_trans_ways ?? ''} onChange={(e) => setRow({ ...row, standard_trans_ways: e.target.value })} />
                </div>
                <div className="space-y-2">
                    <label className="block text-sm text-gray-600">目的（初期値）</label>
                    <textarea className="w-full border rounded p-2" rows={2} value={row.standard_purpose ?? ''} onChange={(e) => setRow({ ...row, standard_purpose: e.target.value })} />
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
                                <div key={doc.id}>
                                    <FileThumbnail title={`${label}（取得: ${formatAcquired(doc.acquired_at)}）`} src={doc.url ?? undefined} mimeType={doc.mimeType ?? undefined} />
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
                                                    const next = documentsArray.map(d => d.id === doc.id ? { ...d, url, mimeType, uploaded_at: new Date().toISOString() } : d);
                                                    await saveDocuments(next);
                                                    alert(`${label} を差し替えました`);
                                                    e.currentTarget.value = '';
                                                }}
                                            />
                                        </label>
                                        <button className="px-2 py-1 border rounded" onClick={() => handleDeleteById(doc.id)}>
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

                <div className="mt-2">
                    <button className="px-3 py-1 border rounded text-red-700 border-red-300 hover:bg-red-50" onClick={async () => { if (!row) return; if (!confirm("書類JSONを全て削除します。よろしいですか？")) return; await saveDocuments([]); alert("書類を全削除しました"); }}>書類JSONを初期化（全削除）</button>
                </div>

                {/* 追加アップロード（取得日: YYYYMM or YYYYMMDD を入力可能） */}
                <div className="mt-3 p-3 border rounded bg-gray-50">
                    <div className="mb-2">
                        <label className="block text-sm text-gray-600">取得日（YYYYMM または YYYYMMDD）</label>
                        <input
                            type="text"
                            className="border rounded px-2 py-1 w-48"
                            placeholder="例: 202508 または 20250817"
                            value={acquiredRaw}
                            onChange={(e) => setAcquiredRaw(e.target.value)}
                        />
                        <span className="ml-2 text-xs text-gray-500">保存時は {formatAcquired(parseAcquired(acquiredRaw))} として記録</span>
                    </div>
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
                            <option value="">（書類名を選択）</option>
                            {docMaster.other.map((l) => (
                                <option key={l} value={l}>{l}</option>
                            ))}
                            <option value="__custom__">（自由入力）</option>
                        </select>
                        {useCustomOther && (
                            <input
                                className="border rounded px-2 py-1"
                                placeholder="書類名を入力"
                                value={newDocLabel}
                                onChange={(e) => setNewDocLabel(e.target.value)}
                            />
                        )}
                        <label className="px-3 py-1 bg-green-600 text-white rounded cursor-pointer">
                            アップロード
                            <input
                                type="file"
                                accept="image/*,application/pdf"
                                className="hidden"
                                onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;
                                    await handleOtherDocUpload(file, useCustomOther ? newDocLabel : newDocLabel);
                                    e.currentTarget.value = '';
                                }}
                            />
                        </label>
                    </div>
                </div>
            </div>

            {/* 時間調整マスタ */}
            <div className="space-y-2">
                <label className="block text-sm text-gray-600">時間調整（候補）</label>
                <select
                    className="border rounded px-2 py-1"
                    value={row.time_adjustability_id ?? ''}
                    onChange={(e) => setRow({ ...row, time_adjustability_id: e.target.value || null })}
                >
                    <option value="">未設定</option>
                    {timeAdjustOptions.map((o) => (
                        <option key={o.id} value={o.id}>{o.label}</option>
                    ))}
                </select>
            </div>
        </div>
    );
}

/**
 * 簡易サムネイル
 */
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
            <div className="text-sm text-center text-gray-500">
                {title}
                <br />
                表示できません
            </div>
        );
    }

    const isPdf = (mimeType ?? '').includes('pdf');

    return (
        <div className="border rounded p-2 bg-white">
            <div className="text-xs text-gray-600 mb-1">{title}</div>
            {isPdf ? (
                <iframe
                    src={`https://drive.google.com/file/d/${fileId}/preview`}
                    className="w-full h-40 border"
                />
            ) : (
                <Image
                    src={`https://drive.google.com/uc?export=view&id=${fileId}`}
                    alt={title}
                    width={400}
                    height={300}
                    className="w-full h-40 object-contain"
                />
            )}
        </div>
    );
}
