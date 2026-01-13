// C:\Users\USER\famille_shift_matching\src\app\portal\kaipoke-info-detail\[id]\page.tsx
'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { ParkingPlace } from "@/types/parking-places";
import { toast } from "react-toastify";  // 通知ライブラリのインポート
import "react-toastify/dist/ReactToastify.css";


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

function toDateInputValueFromIso(iso: string) {
    try {
        const d = new Date(iso);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`; // yyyy-MM-dd
    } catch {
        return '';
    }
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
    care_consultant: string | null;
    address: string | null;
    kana: string | null;
    gender: string | null;
    phone_01: string | null;
    phone_02: string | null;
    asigned_org: string | null;
    asigned_jisseki_staff: string | null;
    documents: Attachment[] | null; // JSONB
    time_adjustability_id: string | null; // マスタ参照

    kodoengo_plan_link: string | null;
};

type DocMasterRow = {
    category: 'certificate' | 'other';
    label: string;
    sort_order?: number;
    is_active?: boolean;
};

type TimeAdjustRow = { id: string; label: string };

type FaxOption = { id: string; office_name: string | null };


type Staff = {
    user_id: string;
    last_name_kanji: string;
    first_name_kanji: string;
    org_unit_id: string | null;
};

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

    // 書類の編集用（id ごとに一時値を保持）
    const [docEditState, setDocEditState] = useState<
        Record<string, { label: string; useCustom: boolean; acquiredDate: string }>
    >({});

    const [row, setRow] = useState<KaipokeInfo | null>(null);
    const [saving, setSaving] = useState(false);
    const [staffList, setStaffList] = useState<
        { user_id: string; name: string; org_unit_id: string | null }[]
    >([]);
    const [orgTeams, setOrgTeams] = useState<{ orgunitid: string; orgunitname: string }[]>([]);

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

    const [parkingPlaces, setParkingPlaces] = useState<ParkingPlace[]>([]);
    const [newParkingPlace, setNewParkingPlace] = useState<ParkingPlace>({
        id: "",
        kaipoke_cs_id: "", // 必要に応じて設定
        serial: 0,
        label: "",
        location_link: "",
        parking_orientation: "北向き", // デフォルトで北向き
        permit_required: true, // 許可証必要
        remarks: "",
        picture1_url: null,
        picture2_url: null,
    });

    const [faxOptions, setFaxOptions] = useState<FaxOption[]>([]);


    const fetchData = async () => {
        const { data, error } = await supabase
            .from("cs_kaipoke_info")
            .select("*")
            .eq("id", id)
            .maybeSingle();

        if (error) {
            console.error(error);
            return;
        }

        if (data) {
            setRow(data); // ここでデータを状態にセット
        }
    };

    // handleImageUpload関数
    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch("/api/upload", {
            method: "POST",
            body: formData,
        });

        if (response.ok) {
            const data = await response.json();
            const imageUrl = data.url;

            if (index === 1) {
                setNewParkingPlace({ ...newParkingPlace, picture1_url: imageUrl });
            } else if (index === 2) {
                setNewParkingPlace({ ...newParkingPlace, picture2_url: imageUrl });
            }
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setNewParkingPlace((prev) => ({ ...prev, [name]: value }));
    };

    const handleSave = async () => {
        const { data, error } = await supabase
            .from("parking_cs_places")
            .update({
                label: newParkingPlace.label,
                location_link: newParkingPlace.location_link,
                parking_orientation: newParkingPlace.parking_orientation,
                permit_required: newParkingPlace.permit_required,
                remarks: newParkingPlace.remarks,
                picture1_url: newParkingPlace.picture1_url,
                picture2_url: newParkingPlace.picture2_url,
            })
            .eq("id", newParkingPlace.id)  // 修正: newParkingPlace.id を使用
            .select("id") // 更新された行を取得
            .maybeSingle();

        if (error) {
            console.error("Error saving parking data:", error);
            toast.error("駐車場データ保存に失敗しました");
            return;
        }

        if (!data) {
            console.error("No rows updated, RLS or permissions issue");
            toast.error("保存できませんでした（RLS制限または権限）");
            return;
        }

        toast.success("駐車場データが保存されました");
    };

    const handleDelete = async (id: string) => {
        const { error } = await supabase
            .from("parking_cs_places")
            .delete()
            .eq("id", id);

        if (error) {
            alert("削除エラー");
            return;
        }

        alert("削除しました");
    };

    const getDocEdit = (doc: Attachment) => {
        const existing = docEditState[doc.id];
        if (existing) return existing;

        const baseLabel = doc.label ?? '';
        const inMaster = baseLabel && docMaster.other.includes(baseLabel);

        return {
            label: baseLabel,
            useCustom: baseLabel ? !inMaster : false,
            acquiredDate: toDateInputValueFromIso(doc.acquired_at),
        };
    };

    const loadFaxOptions = async () => {
        const { data, error } = await supabase
            .from("fax")
            .select("id, office_name")
            .order("office_name", { ascending: true });

        if (error) {
            console.error("fax load error:", error);
            setFaxOptions([]);
            return;
        }
        setFaxOptions((data ?? []) as FaxOption[]);
    };


    useEffect(() => {
        const fetchParkingPlaces = async () => {
            if (row?.kaipoke_cs_id) {
                const { data, error } = await supabase
                    .from("parking_cs_places")
                    .select("*")
                    .eq("kaipoke_cs_id", row.kaipoke_cs_id);

                if (error) {
                    console.error(error);
                    return;
                }

                setParkingPlaces(data || []);
            } else {
                setParkingPlaces([]); // kaipoe_cs_idがない場合は空の配列に設定
            }
        };

        fetchParkingPlaces();
    }, [row?.kaipoke_cs_id]);

    useEffect(() => {
        fetchData();
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
                .from('cs_kaipoke_time_adjustability') // ← ココを修正
                .select('id,label,sort_order,is_active')
                .eq('is_active', true)
                .order('sort_order', { ascending: true })
                .order('label', { ascending: true });

            if (error) {
                console.error('time_adjustability load error', error);
                alert(`時間調整候補の取得に失敗: ${error.message}`);
                setTimeAdjustOptions([]);
                return;
            }

            type Row = { id: string | number; label: string | null };
            const rows = ((data ?? []) as Row[]).map(r => ({
                id: String(r.id),
                label: String(r.label ?? ''),
            }));
            setTimeAdjustOptions(rows);
        };

        const loadStaffList = async () => {
            // 1) 基本の org_unit_id 付きスタッフ一覧
            const { data, error } = await supabase
                .from("user_entry_united_view_single")
                .select("user_id, last_name_kanji, first_name_kanji, org_unit_id")
                .order("last_name_kanji", { ascending: true });

            if (error) {
                console.error("staff load error", error);
                setStaffList([]);
                return;
            }

            const staffData = (data ?? []) as Staff[];

            // 2) 例外テーブル user_org_exception を取得
            const { data: exceptionRaw, error: exceptionError } = await supabase
                .from("user_org_exception")
                .select("user_id, orgunitid");

            if (exceptionError) {
                console.error("user_org_exception load error", exceptionError);
            }

            // user_id → orgunitid のマップ
            const exceptionMap = new Map<string, string>();
            (exceptionRaw ?? []).forEach((e: { user_id: string; orgunitid: string }) => {
                exceptionMap.set(e.user_id, e.orgunitid);
            });

            // 3) 表示用リスト：org_unit_id は「例外があればそちらを優先」
            const staffListWithOrg = staffData.map((staff) => ({
                user_id: staff.user_id,
                name: `${staff.last_name_kanji}${staff.first_name_kanji}`,
                org_unit_id: exceptionMap.get(staff.user_id) ?? staff.org_unit_id ?? null,
            }));

            setStaffList(staffListWithOrg);
        };

        // ★ 追加：チーム情報をロードする関数
        const loadTeams = async () => {
            const { data, error } = await supabase
                .from('orgs')
                .select('orgunitid, orgunitname')
                .eq('displaylevel', 3)
                .order('displayorder', { ascending: true });

            if (error) {
                console.error('org teams load error', error);
            } else {
                setOrgTeams(data || []);
            }
        };

        fetchRow();
        loadDocMaster();
        loadTimeAdjust();
        loadStaffList();
        loadStaffList();
        loadTeams();
        loadFaxOptions();
    }, [id]);

    const documentsArray = useMemo<Attachment[]>(() => {
        const arr: unknown[] = Array.isArray(row?.documents) ? (row?.documents as unknown[]) : [];
        // 後方互換: id/日付が無い要素に補完して返す
        return arr.map((d) => {
            const doc = d as Partial<Attachment>;
            return {
                id: doc.id ?? crypto.randomUUID(),
                url: doc.url ?? null,
                label: doc.label,
                type: doc.type,
                mimeType: doc.mimeType ?? null,
                uploaded_at: doc.uploaded_at ?? new Date().toISOString(),
                acquired_at: doc.acquired_at ?? doc.uploaded_at ?? new Date().toISOString(),
            } as Attachment;
        });
    }, [row?.documents]);

    /** ------------- 共通ヘルパ ------------- */
    // entry-detail と同じ実装に統一
    const uploadFileViaApi = async (file: File) => {
        const form = new FormData();
        form.append("file", file);
        form.append("filename", `${Date.now()}_${file.name}`);

        const res = await fetch("/api/upload", { method: "POST", body: form });
        if (!res.ok) {
            const text = await res.text().catch(() => "");
            throw new Error(`アップロードAPI失敗: status=${res.status} ${text}`);
        }
        const json = await res.json();

        // file.type が空の環境向け: 拡張子から推定
        const lower = file.name.toLowerCase();
        const guessed =
            lower.endsWith(".pdf") ? "application/pdf" :
                lower.endsWith(".png") ? "image/png" :
                    (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) ? "image/jpeg" :
                        null;

        const mimeType = (file.type || json.mimeType || guessed || null) as string | null;
        if (!json.url) throw new Error("アップロードAPIの戻り値に url がありません");

        return { url: json.url as string, mimeType };
    };



    const saveDocuments = async (next: Attachment[]) => {
        if (!row) return;

        const { error } = await supabase
            .from("cs_kaipoke_info")
            .update({ documents: next })
            .eq("id", row.id);

        if (error) throw new Error(error.message);

        // ✅ cs_docs へ同期（失敗しても documents 更新自体は成立しているので、警告だけ）
        try {
            const res = await fetch("/api/cs-docs/sync-from-documents", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ csKaipokeInfoId: row.id, documents: next }),
            });

            if (!res.ok) {
                const txt = await res.text().catch(() => "");
                alert(`cs_docs 同期に失敗しました（documentsは保存済み）\n${txt}`);
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            alert(`cs_docs 同期に失敗しました（通信エラー / documentsは保存済み）\n${msg}`);
        }

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

                    // ★ 追加：住所 / カナ / 性別 / 電話番号
                    address: (row.address ?? '').trim() || null,
                    kana: (row.kana ?? '').trim() || null,
                    gender: (row.gender ?? '').trim() || null,
                    phone_01: (row.phone_01 ?? '').trim() || null,
                    phone_02: (row.phone_02 ?? '').trim() || null,

                    // ★ 追加：assigned_org / assigned_jisseki_staff
                    asigned_org: row.asigned_org || null,  // チームID
                    asigned_jisseki_staff: row.asigned_jisseki_staff || null,  // 実績担当者

                    standard_route: (row.standard_route ?? '').trim() || null,
                    commuting_flg: row.commuting_flg ?? null,
                    standard_trans_ways: (row.standard_trans_ways ?? '').trim() || null,
                    standard_purpose: (row.standard_purpose ?? '').trim() || null,
                    time_adjustability_id: row.time_adjustability_id || null,
                    kodoengo_plan_link: (row.kodoengo_plan_link ?? '').trim() || null,
                    care_consultant: row.care_consultant || null,
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

    // ★ この利用者の実績担当者が所属するチーム（例外込み）
    const staff = staffList.find(
        (s) => s.user_id === row.asigned_jisseki_staff
    );
    // 実効的なチームID：担当者の org_unit_id があればそれ、なければ DB の asigned_org
    const effectiveOrgId = staff?.org_unit_id ?? row.asigned_org ?? "";

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
                    <label className="block text-sm text-gray-600">カナ</label>
                    <input
                        className="w-full border rounded px-2 py-1"
                        value={row.kana ?? ''}
                        onChange={(e) => setRow({ ...row, kana: e.target.value })}
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
                {/* 郵便番号 */}
                <div className="space-y-2">
                    <label className="block text-sm text-gray-600">郵便番号</label>
                    <input
                        className="w-full border rounded px-2 py-1"
                        value={row.postal_code ?? ''}
                        onChange={(e) => setRow({ ...row, postal_code: e.target.value })}
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

                {/* ★ 追加：住所 / カナ / 性別 / 電話番号1・2 */}
                <div className="space-y-2">
                    <label className="block text-sm text-gray-600">住所</label>
                    <input
                        className="w-full border rounded px-2 py-1"
                        value={row.address ?? ''}
                        onChange={(e) => setRow({ ...row, address: e.target.value })}
                    />
                </div>

                <div className="space-y-2">
                    <label className="block text-sm text-gray-600">性別</label>
                    <input
                        className="w-full border rounded px-2 py-1"
                        value={row.gender ?? ''}
                        onChange={(e) => setRow({ ...row, gender: e.target.value })}
                    />
                </div>

                <div className="space-y-2">
                    <label className="block text-sm text-gray-600">電話番号１</label>
                    <input
                        className="w-full border rounded px-2 py-1"
                        value={row.phone_01 ?? ''}
                        onChange={(e) => setRow({ ...row, phone_01: e.target.value })}
                    />
                </div>

                <div className="space-y-2">
                    <label className="block text-sm text-gray-600">電話番号２</label>
                    <input
                        className="w-full border rounded px-2 py-1"
                        value={row.phone_02 ?? ''}
                        onChange={(e) => setRow({ ...row, phone_02: e.target.value })}
                    />
                </div>

                {/* チーム（assigned_org） */}
                <div className="space-y-2">
                    <label className="block text-sm text-gray-600">チーム</label>
                    <select
                        className="w-full border rounded px-2 py-1"
                        value={effectiveOrgId}
                        onChange={(e) => setRow({ ...row, asigned_org: e.target.value })}
                    >
                        <option value="">選択してください</option>
                        {orgTeams.map((org) => (
                            <option key={org.orgunitid} value={org.orgunitid}>
                                {org.orgunitname}
                            </option>
                        ))}
                    </select>
                </div>

                {/* 実績担当者（assigned_jisseki_staff） */}
                <div className="space-y-2">
                    <label className="block text-sm text-gray-600">実績担当者</label>
                    <select
                        className="w-full border rounded px-2 py-1"
                        value={row?.asigned_jisseki_staff ?? ""}
                        onChange={(e) => {
                            const newStaffId = e.target.value;

                            // 1) 実績担当者IDを更新
                            // 2) その担当者のチーム（org_unit_id：例外込み）を asigned_org に反映
                            const selectedStaff = staffList.find((s) => s.user_id === newStaffId);
                            const newOrgId = selectedStaff?.org_unit_id ?? null;

                            setRow({
                                ...row,
                                asigned_jisseki_staff: newStaffId || null,
                                asigned_org: newOrgId, // ← 担当者の org を保存
                            });
                        }}
                    >
                        <option value="">選択してください</option>
                        {staffList.map((staff) => (
                            <option key={staff.user_id} value={staff.user_id}>
                                {staff.name} {/* 姓と名を結合して表示 */}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* 備考 */}
            <div className="space-y-2 max-w-2xl">
                <label className="block text-sm text-gray-600">備考</label>
                <textarea
                    className="w-full border rounded p-2"
                    rows={3}
                    value={row.biko ?? ''}
                    onChange={(e) => setRow({ ...row, biko: e.target.value })}
                />
            </div>

            <div className="max-w-[14rem] md:max-w-[18rem]">
                <label className="block text-sm text-gray-600">ケアマネ（相談支援）</label>
                <select
                    className="w-full border rounded px-2 py-1"
                    value={row.care_consultant ?? ""}
                    onChange={(e) => setRow({ ...row, care_consultant: e.target.value || null })}
                >
                    <option value="">未設定</option>
                    {faxOptions.map((o) => (
                        <option key={o.id} value={o.id}>
                            {o.office_name ?? "(名称未設定)"}
                        </option>
                    ))}
                </select>
            </div>

            {/* 希望性別 */}
            <div className="space-y-2 max-w-xs">
                <label className="block text-sm text-gray-600">希望性別</label>
                <select
                    className="border rounded px-2 py-1 w-full"
                    value={row.gender_request ?? ''}
                    onChange={(e) => setRow({ ...row, gender_request: e.target.value || null })}
                >
                    {GENDER_OPTIONS.map((g) => (
                        <option key={g.id} value={g.id}>{g.label}</option>
                    ))}
                </select>
            </div>


            {/* 時間調整マスタ */}
            <div className="space-y-2 max-w-xs">
                <label className="block text-sm text-gray-600">時間調整（候補）</label>
                <select
                    className="border rounded px-2 py-1 w-full"
                    value={row.time_adjustability_id ?? ''}   // string を想定
                    onChange={(e) => setRow({ ...row, time_adjustability_id: e.target.value || null })}
                >
                    <option value="">未設定</option>
                    {timeAdjustOptions.map((o) => (
                        <option key={o.id} value={o.id}>{o.label}</option>
                    ))}
                </select>
                {timeAdjustOptions.length === 0 && (
                    <div className="text-xs text-red-600 mt-1">
                        候補が0件です（マスタ未登録・権限・取得エラーの可能性）。コンソール/アラートをご確認ください。
                    </div>
                )}
            </div>

            {/* 標準ルート / 通勤可否 / 手段 / 目的 */}
            {/* 標準ルート / 通勤可否 / 手段 / 目的 / 行動援護プランURL */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 md:gap-4">
                <div className="space-y-2">
                    <label className="block text-sm text-gray-600">標準ルート（初期値）</label>
                    <textarea
                        className="w-full border rounded p-2"
                        rows={2}
                        value={row.standard_route ?? ''}
                        onChange={(e) => setRow({ ...row, standard_route: e.target.value })}
                    />
                </div>

                <div className="space-y-2">
                    <label className="block text-sm text-gray-600">通勤可否（初期値）</label>
                    <select
                        className="border rounded px-2 py-1 w-full"
                        value={row.commuting_flg ? '1' : '0'}
                        onChange={(e) => setRow({ ...row, commuting_flg: e.target.value === '1' })}
                    >
                        <option value="0">不可</option>
                        <option value="1">可</option>
                    </select>
                </div>

                <div className="space-y-2">
                    <label className="block text-sm text-gray-600">手段（初期値）</label>
                    <textarea
                        className="w-full border rounded p-2"
                        rows={2}
                        value={row.standard_trans_ways ?? ''}
                        onChange={(e) => setRow({ ...row, standard_trans_ways: e.target.value })}
                    />
                </div>

                <div className="space-y-2">
                    <label className="block text-sm text-gray-600">目的（初期値）</label>
                    <textarea
                        className="w-full border rounded p-2"
                        rows={2}
                        value={row.standard_purpose ?? ''}
                        onChange={(e) => setRow({ ...row, standard_purpose: e.target.value })}
                    />
                </div>

                {/* 追加：行動援護プランURL（支援手順書リンク） */}
                <div className="space-y-2 md:col-span-2">
                    <label className="block text-sm text-gray-600">行動援護プラン（支援手順書）リンク</label>
                    <div className="flex gap-2">
                        <input
                            type="url"
                            placeholder="https://...（Driveや社内URLなど）"
                            className="w-full border rounded px-2 py-1"
                            value={row.kodoengo_plan_link ?? ''}
                            onChange={(e) => setRow({ ...row, kodoengo_plan_link: e.target.value })}
                        />
                        {(row.kodoengo_plan_link ?? '').trim() && (
                            <a
                                className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                                href={row.kodoengo_plan_link!}
                                target="_blank" rel="noreferrer"
                            >
                                開く
                            </a>
                        )}
                    </div>
                    <p className="text-xs text-gray-500">※ 行動援護実施者のプラン／支援手順書の参照URLを登録</p>
                </div>
            </div>

            <div>
                {/* 駐車場所フォーム */}
                <div>
                    <h3>駐車場所の追加・編集</h3>
                    <input
                        type="text"
                        name="label"
                        value={newParkingPlace.label}
                        onChange={handleChange}
                        placeholder="駐車場所ラベル"
                    />
                    <input
                        type="text"
                        name="location_link"
                        value={newParkingPlace.location_link}
                        onChange={handleChange}
                        placeholder="Googleマップリンク"
                    />
                    <select
                        name="parking_orientation"
                        value={newParkingPlace.parking_orientation}
                        onChange={handleChange}
                    >
                        <option value="北向き">北向き</option>
                        <option value="東向き">東向き</option>
                        <option value="南向き">南向き</option>
                        <option value="西向き">西向き</option>
                        <option value="北東向き">北東向き</option>
                        <option value="南東向き">南東向き</option>
                        <option value="南西向き">南西向き</option>
                        <option value="北西向き">北西向き</option>
                    </select>
                    <input
                        type="checkbox"
                        name="permit_required"
                        checked={newParkingPlace.permit_required}
                        onChange={(e) => setNewParkingPlace({ ...newParkingPlace, permit_required: e.target.checked })}
                    />
                    <span>許可証が必要</span>
                    <textarea
                        name="remarks"
                        value={newParkingPlace.remarks}
                        onChange={handleChange}
                        placeholder="備考"
                    />
                    <input
                        type="file"
                        name="picture1_url"
                        onChange={(e) => handleImageUpload(e, 1)}
                    />
                    <input
                        type="file"
                        name="picture2_url"
                        onChange={(e) => handleImageUpload(e, 2)}
                    />
                    <button className="btn-save" onClick={handleSave}>駐車場情報保存</button>
                </div>

                {/* 既存駐車場所のリスト */}
                <div>
                    <h3>駐車場所リスト</h3>
                    {parkingPlaces.map((place) => (
                        <div key={place.id}>
                            <p>{place.label} - {place.location_link}</p>
                            <button className="btn-delete"　onClick={() => handleDelete(place.id)}>削除</button>
                        </div>
                    ))}
                </div>
            </div>

            {/* 書類（documents: JSONB） */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <h2 className="text-base font-bold">書類</h2>

                    {row?.kaipoke_cs_id ? (
                        <Link
                            href={`/portal/cs_docs?kaipoke_cs_id=${encodeURIComponent(row.kaipoke_cs_id)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs underline text-blue-600 hover:opacity-80"
                        >
                            cs_docs でこの利用者の書類を見る →
                        </Link>
                    ) : (
                        <span className="text-xs text-gray-500">kaipoke_cs_id 未設定</span>
                    )}
                </div>

                {documentsArray.length > 0 ? (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {documentsArray.map((doc, idx) => {
                            const fallbackLabel = doc.label ?? doc.type ?? `doc_${idx + 1}`;
                            const edit = getDocEdit(doc);
                            const selectValue = edit.useCustom ? '__custom__' : (edit.label || '');

                            return (
                                <div key={doc.id} className="border rounded p-2 bg-white">
                                    {/* サムネイル */}
                                    <FileThumbnail
                                        title={`${fallbackLabel}（取得: ${formatAcquired(doc.acquired_at)}）`}
                                        src={doc.url ?? undefined}
                                        mimeType={doc.mimeType ?? undefined}
                                    />

                                    {/* 取得日（カレンダー入力） */}
                                    <div className="mt-2 flex items-center gap-2 text-sm">
                                        <span className="text-gray-600 shrink-0">取得日</span>
                                        <input
                                            type="date"
                                            className="border rounded px-2 py-1"
                                            value={edit.acquiredDate}
                                            onChange={(e) =>
                                                setDocEditState((prev) => ({
                                                    ...prev,
                                                    [doc.id]: {
                                                        ...getDocEdit(doc),
                                                        acquiredDate: e.target.value,
                                                    },
                                                }))
                                            }
                                        />
                                    </div>

                                    {/* 書類名（セレクト＋自由入力） */}
                                    <div className="mt-2 flex flex-col gap-1 text-sm">
                                        <span className="text-gray-600">書類名 / 種別</span>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <select
                                                className="border rounded px-2 py-1"
                                                value={selectValue}
                                                onChange={(e) => {
                                                    const v = e.target.value;
                                                    if (v === '__custom__') {
                                                        setDocEditState((prev) => ({
                                                            ...prev,
                                                            [doc.id]: {
                                                                ...getDocEdit(doc),
                                                                useCustom: true,
                                                            },
                                                        }));
                                                    } else {
                                                        setDocEditState((prev) => ({
                                                            ...prev,
                                                            [doc.id]: {
                                                                ...getDocEdit(doc),
                                                                useCustom: false,
                                                                label: v,
                                                            },
                                                        }));
                                                    }
                                                }}
                                            >
                                                <option value="">（書類名を選択）</option>
                                                {docMaster.other.map((l) => (
                                                    <option key={l} value={l}>
                                                        {l}
                                                    </option>
                                                ))}
                                                <option value="__custom__">（自由入力）</option>
                                            </select>

                                            {edit.useCustom && (
                                                <input
                                                    className="border rounded px-2 py-1 flex-1 min-w-[8rem]"
                                                    placeholder="書類名を入力"
                                                    value={edit.label}
                                                    onChange={(e) =>
                                                        setDocEditState((prev) => ({
                                                            ...prev,
                                                            [doc.id]: {
                                                                ...getDocEdit(doc),
                                                                useCustom: true,
                                                                label: e.target.value,
                                                            },
                                                        }))
                                                    }
                                                />
                                            )}
                                        </div>
                                    </div>

                                    {/* 差し替え・削除・更新 ボタン列 */}
                                    <div className="mt-3 flex flex-wrap items-center gap-2">
                                        {/* 既存の差し替えボタン */}
                                        <label className="px-2 py-1 bg-blue-600 text-white rounded cursor-pointer">
                                            差し替え
                                            <input
                                                type="file"
                                                accept="image/*,application/pdf"
                                                className="hidden"
                                                onChange={async (e) => {
                                                    const f = e.target.files?.[0];
                                                    if (!f) return;
                                                    try {
                                                        const { url, mimeType } = await uploadFileViaApi(f);
                                                        const next = documentsArray.map((d) =>
                                                            d.id === doc.id
                                                                ? { ...d, url, mimeType, uploaded_at: new Date().toISOString() }
                                                                : d
                                                        );
                                                        await saveDocuments(next);
                                                        alert(`${fallbackLabel} を差し替えました`);
                                                    } catch (err) {
                                                        const msg = err instanceof Error ? err.message : String(err);
                                                        alert(`差し替えに失敗: ${msg}`);
                                                    } finally {
                                                        e.currentTarget.value = '';
                                                    }
                                                }}
                                            />
                                        </label>

                                        {/* 既存の削除ボタン */}
                                        <button
                                            className="px-2 py-1 border rounded"
                                            onClick={() => handleDeleteById(doc.id)}
                                        >
                                            削除
                                        </button>

                                        {/* 新規: メタ情報 更新ボタン */}
                                        <button
                                            className="px-3 py-1 border rounded bg-green-50 hover:bg-green-100"
                                            onClick={async () => {
                                                const current = getDocEdit(doc);
                                                const label = current.label.trim();
                                                if (!label) {
                                                    alert('書類名を選択または入力してください');
                                                    return;
                                                }
                                                if (!current.acquiredDate) {
                                                    alert('取得日を選択してください');
                                                    return;
                                                }
                                                try {
                                                    const iso = new Date(
                                                        `${current.acquiredDate}T00:00:00+09:00`
                                                    ).toISOString();
                                                    const next = documentsArray.map((d) =>
                                                        d.id === doc.id
                                                            ? { ...d, label, acquired_at: iso }
                                                            : d
                                                    );
                                                    await saveDocuments(next);
                                                    alert('書類情報を更新しました');
                                                } catch (err) {
                                                    const msg = err instanceof Error ? err.message : String(err);
                                                    alert(`更新に失敗: ${msg}`);
                                                }
                                            }}
                                        >
                                            書類情報を更新
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
                                    try {
                                        const label = (useCustomOther ? newDocLabel : newDocLabel).trim(); // ← ここは実際は newDocLabel を使えばOK
                                        if (!label) {
                                            alert('書類名を選択または入力してください');
                                            e.currentTarget.value = '';
                                            return;
                                        }
                                        await handleOtherDocUpload(file, label);
                                    } catch (err) {
                                        const msg = err instanceof Error ? err.message : String(err);
                                        alert(`アップロードに失敗: ${msg}`);
                                    } finally {
                                        e.currentTarget.value = '';
                                    }
                                }}


                            />
                        </label>
                    </div>
                </div>
            </div>
        </div >
    );
}

/**
 * 簡易サムネイル
 */
function FileThumbnail({
    title,
    src,
    mimeType,
}: {
    title: string;
    src?: string;
    mimeType?: string | null;
}) {
    if (!src) {
        return (
            <div className="text-sm text-center text-gray-500">
                {title}
                <br />
                ファイルなし
            </div>
        );
    }

    const isDriveUrl = src.includes("drive.google.com");

    // Google Drive の fileId を URL から抽出（/file/d/... や ?id=... どちらでも拾う）
    const fileIdMatch = src.match(/[-\w]{25,}/);
    const fileId = fileIdMatch ? fileIdMatch[0] : null;

    // Drive 以外で fileId が取れない場合は、そのままリンク/画像扱い
    if (isDriveUrl && !fileId) {
        return (
            <div className="text-sm text-center text-gray-500">
                {title}
                <br />
                表示できません
            </div>
        );
    }

    const isPdfLike =
        (mimeType ?? "").includes("pdf") ||
        // mimeType が無いけど Drive の URL → ほぼ PDF とみなしてプレビュー
        (isDriveUrl && !mimeType);

    const previewUrl = isDriveUrl && fileId
        ? `https://drive.google.com/file/d/${fileId}/preview`
        : src;

    return (
        <div className="border rounded p-2 bg-white">
            <div className="text-xs text-gray-600 mb-1">{title}</div>

            {isPdfLike ? (
                // PDF / Drive 系は iframe でプレビュー
                <iframe
                    src={previewUrl}
                    className="w-full h-40 border"
                />
            ) : (
                // 画像などはそのまま <Image> で
                <Image
                    src={src}
                    alt={title}
                    width={400}
                    height={300}
                    className="w-full h-40 object-contain"
                />
            )}
        </div>
    );
}