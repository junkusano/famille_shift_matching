//portal/entry/detail[id]/

'use client';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import Image from 'next/image';
import Link from 'next/link';
import { addStaffLog } from '@/lib/addStaffLog';
import hepburn from 'hepburn';
import { OrgUnit } from '@/lib/lineworks/getOrgUnits';
import { lineworksInviteTemplate } from '@/lib/emailTemplates/lineworksInvite';
import { addAreaPrefixToKana, hiraToKata } from '@/utils/kanaPrefix';
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import DocUploader, { DocItem } from "@/components/DocUploader";
import {
    determineServicesFromCertificates,
    type DocMasterRow as CertMasterRow,
    type ServiceKey,
} from '@/lib/certificateJudge';


// 既存 interface Attachment を置き換え
interface Attachment {
    id: string;                  // ★一意ID
    url: string | null;
    type?: string;
    label?: string;
    mimeType?: string | null;
    uploaded_at: string;         // ★アップロード日時 ISO
    acquired_at: string;         // ★取得日 ISO（YYYYMM/YYYMMDD入力→補完）
}

interface EntryDetail {
    id: string;
    last_name_kanji: string;
    first_name_kanji: string;
    last_name_kana: string;
    first_name_kana: string;
    gender: string;
    birth_year: number;
    birth_month: number;
    birth_day: number;
    address: string;
    postal_code: string;
    phone: string;
    email: string;
    motivation: string;
    work_styles: string[];
    workstyle_other: string;
    commute_options?: string[];
    health_condition: string;
    photo_url?: string;
    attachments?: Attachment[];
    created_at: string;
    consent_snapshot: string;
    manager_note: string;
}

interface StaffLog {
    id: number;
    staff_id: string;
    action_at: string;
    action_detail: string;
    registered_by: string;
    created_at: string;
}

interface UserOjtRecord {
    id: string;
    user_id: string;
    date: string;              // date 型だが string で受ける
    start_time?: string | null;   // ★追加
    trainer_user_id: string | null;
    kaipoke_cs_id: string | null;
    memo: string | null;
    create_ad: string;
    update_ad: string;
}

type UserOption = {
    user_id: string;
    display_name: string;
};

type KaipokeOption = {
    kaipoke_cs_id: string;
    name: string;
};


interface UserRecord {
    user_id: string;
    email: string;
    auth_user_id?: string | null;
    org_unit_id?: string | null;
    level_id?: string | null;
    position_id?: string | null;
    status?: string;
    roster_sort?: string | null;

    // ここから追加
    entry_date_original?: string | null;   // 最初の入社日
    entry_date_latest?: string | null;     // 入社日（最新）
    resign_date_latest?: string | null;    // 退職日（最新）
}

type NameInfo = {
    firstKana: string;
    lastKana: string;
};

// 1〜3行の職歴キーを型で表現
type WorkIdx = 1 | 2 | 3;
type WorkKey =
    | `workplace_${WorkIdx}`
    | `period_from_${WorkIdx}`
    | `period_to_${WorkIdx}`;

// DBスキーマに合わせて補強（work_styles/commute_options は text）
type EntryDetailEx =
    Omit<EntryDetail, 'work_styles' | 'commute_options'> &
    Partial<Record<WorkKey, string | null>> & {
        work_styles: string | null;
        commute_options?: string | null;
        certificates?: DocItem[]; // ★ 追加
    };

// DB側（work_styles/commute_options は text か text[]）
type ArrayOrString = string[] | string | null;

type FormEntriesRow =
    Omit<EntryDetail, 'work_styles' | 'commute_options'> & {
        work_styles: ArrayOrString;
        commute_options?: ArrayOrString;
    } & Partial<Record<WorkKey, string | null>>;

// URL から Google Drive fileId を抽出
function extractFileId(u?: string | null): string | null {
    if (!u) return null;
    const m = u.match(/(?:\/d\/|[?&]id=)([-\w]{25,})/);
    return m ? m[1] : null;
}

export default function EntryDetailPage() {
    const { id } = useParams();
    const [entry, setEntry] = useState<EntryDetailEx | null>(null);
    const [managerNote, setManagerNote] = useState('');
    const [noteSaving, setNoteSaving] = useState(false);
    const [noteMsg, setNoteMsg] = useState<string | null>(null);
    const [restricted, setRestricted] = useState(false);
    const [userId, setUserId] = useState('');
    const [userIdLoading, setUserIdLoading] = useState(false);
    const [existingIds, setExistingIds] = useState<string[]>([]);
    const [userIdSuggestions, setUserIdSuggestions] = useState<string[]>([]);
    const [userRecord, setUserRecord] = useState<UserRecord | null>(null);
    const [orgList, setOrgList] = useState<OrgUnit[]>([]);
    const [levelList, setLevelList] = useState<{ levelId: string; levelName: string }[]>([]);
    const [positionList, setPositionList] = useState<{ positionId: string; positionName: string }[]>([]);
    const [selectedOrg, setSelectedOrg] = useState<string>('');
    const [selectedLevel, setSelectedLevel] = useState<string>('');
    const [selectedPosition, setSelectedPosition] = useState<string>('');
    const [creatingKaipokeUser, setCreatingKaipokeUser] = useState(false);
    const [masterRows, setMasterRows] = useState<CertMasterRow[]>([]);
    const [services, setServices] = useState<ServiceKey[]>([]);

    const [rosterSaving, setRosterSaving] = useState(false);
    const [rosterSaved, setRosterSaved] = useState(false);

    const getField = <K extends WorkKey>(key: K): string =>
        (entry?.[key] ?? '') as string;
    const setField = <K extends WorkKey>(key: K, value: string) => {
        setEntry(prev => (prev ? ({ ...prev, [key]: value } as EntryDetailEx) : prev));
    };

    // 配列カラムかどうかを実データから判断するフラグ
    const [workStylesIsArray, setWorkStylesIsArray] = useState(false);
    const [commuteIsArray, setCommuteIsArray] = useState(false);

    // 文字列→配列の共通変換
    const splitToArray = (s: string) => s.split(/[、,，\s]+/).filter(Boolean);

    // DBレコード -> 画面用（常に文字列で保持）へ正規化
    const normalizeEntryFromDb = (data: FormEntriesRow): EntryDetailEx => {
        setWorkStylesIsArray(Array.isArray(data.work_styles));
        setCommuteIsArray(Array.isArray(data.commute_options));

        const ws = Array.isArray(data.work_styles)
            ? data.work_styles.join('、')
            : (data.work_styles ?? '');

        const cm = Array.isArray(data.commute_options)
            ? (data.commute_options as string[]).join('、')
            : (data.commute_options ?? '');

        return { ...data, work_styles: ws, commute_options: cm } as EntryDetailEx;
    };

    // 追記: ログ用に実行者IDを取るヘルパ
    const getCurrentUserId = async () => {
        const s = await supabase.auth.getSession();
        return s.data?.session?.user?.id ?? 'システム';
    };

    //type DocMasterRow = { category: 'certificate' | 'other'; label: string; sort_order?: number; is_active?: boolean };
    const [docMaster, setDocMaster] = useState<{ certificate: string[]; other: string[] }>({ certificate: [], other: [] });

    // attachmentsArray（常にトップで）
    const attachmentsArray: Attachment[] = useMemo(() => {
        const raw = Array.isArray(entry?.attachments) ? (entry!.attachments as Partial<Attachment>[]) : [];
        const now = new Date().toISOString();
        return raw.map((p) => ({
            id: p.id ?? crypto.randomUUID(),
            url: p.url ?? null,
            type: p.type,
            label: p.label,
            mimeType: p.mimeType ?? null,
            uploaded_at: p.uploaded_at ?? now,
            acquired_at: p.acquired_at ?? p.uploaded_at ?? now,
        }));
    }, [entry]);

    const handleCreateKaipokeUser = async () => {
        if (!entry || !userId) {
            alert('必要な情報が不足しています。');
            return;
        }
        if (!selectedOrg) {
            alert('所属組織（事業所）を選択してください');
            return;
        }
        if (!selectedLevel) {
            alert('雇用区分（職級）を選択してください');
            return;
        }

        setCreatingKaipokeUser(true);

        try {
            // ヘボン式変換
            let lastNameHebon = hepburn.fromKana(entry.last_name_kana || '').toLowerCase();
            if (!lastNameHebon) lastNameHebon = 'User';
            // 頭文字だけ大文字に
            lastNameHebon = lastNameHebon.charAt(0).toUpperCase() + lastNameHebon.slice(1);
            // 10文字未満なら末尾に0を追加
            let password = lastNameHebon;
            if (password.length < 10) {
                password = password + '0'.repeat(10 - password.length);
            } else if (password.length > 10) {
                password = password.slice(0, 10);
            }

            // Supabase認証から管理者IDを取得（junkusano削除）
            const session = await supabase.auth.getSession();
            const currentUserId = session.data?.session?.user?.id;
            if (!currentUserId) {
                alert('管理者ユーザーの情報が取得できません。');
                setCreatingKaipokeUser(false);
                return;
            }

            // テンプレートID取得
            const kaipokeTemplateId = 'a3ce7551-90f0-4e03-90bb-6fa8534fd31b'; // 例: 'e1b02a00-7057-4471-bcdf-xxxxxxx'
            const orgUnit = orgList.find(o => o.orgUnitId === selectedOrg);
            const orgUnitName = orgUnit?.orgUnitName || '';
            const areaName = (orgUnit?.orgUnitName || '') + (orgUnit?.parentOrgUnitName || '');
            const level = levelList.find(l => l.levelId === selectedLevel);
            const employmentTypeName = level?.levelName || '';

            const requestDetails = {
                user_id: userId,
                last_name: entry.last_name_kanji,
                last_name_kana: addAreaPrefixToKana(areaName, entry.last_name_kana || ""), // ←ここだけprefix付き
                first_name: entry.first_name_kanji,
                first_name_kana: hiraToKata(entry.first_name_kana || ""),
                gender: entry.gender,
                employment_type: employmentTypeName,
                org_unit: orgUnitName,
                password: password,
            };

            const { error: insertError } = await supabase
                .from('rpa_command_requests')
                .insert({
                    template_id: kaipokeTemplateId,
                    requester_id: currentUserId,
                    approver_id: currentUserId,
                    status: 'approved',
                    request_details: requestDetails,
                });

            if (insertError) {
                alert('RPAリクエスト登録に失敗しました: ' + insertError.message);
            } else {
                alert('カイポケユーザー追加リクエストを登録しました！');
                await addStaffLog({
                    staff_id: entry.id,
                    action_at: new Date().toISOString(),
                    action_detail: 'カイポケユーザー追加リクエスト',
                    registered_by: currentUserId,
                });
            }
        } catch (e) {
            alert('処理中に予期しないエラーが発生しました');
            console.error(e);
        } finally {
            setCreatingKaipokeUser(false);
        }
    };

    // 表記ゆれを“正”に寄せる
    const canonType = (
        t?: string | null
    ): '資格証明書' | '免許証表' | '免許証裏' | '住民票' | 'その他' => {
        const s = (t ?? '').trim().toLowerCase();
        if (s === 'certificate' || s === '資格証' || s === '資格証明書') return '資格証明書';
        if (s === '免許証表' || s === 'license_front') return '免許証表';
        if (s === '免許証裏' || s === 'license_back') return '免許証裏';
        if (s === '住民票' || s === 'residence') return '住民票';
        if (s === 'その他' || s === 'other') return 'その他';
        return 'その他';
    };

    // 指定カテゴリ（日本語）に属するか
    const isInCategory = (a: Attachment, catJP: ReturnType<typeof canonType>) =>
        canonType(a?.type) === catJP;

    // 資格証：変更即保存
    const onCertificatesChange = async (next: DocItem[]) => {
        setCertificates(next);
        try {
            await saveAttachmentsForCategory('certificate', next);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            alert('資格証の保存に失敗: ' + msg);
        }
    };

    const onOtherDocsChange = async (next: DocItem[]) => {
        setOtherDocsState(next);
        try {
            await saveAttachmentsForCategory('other', next);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            alert('その他書類の保存に失敗: ' + msg);
        }
    };

    // 既存の saveAttachmentsForCategory をこの中身に置換（1つだけ残す）
    const saveAttachmentsForCategory = async (
        category: 'certificate' | 'other',
        nextDocs: DocItem[]
    ) => {
        if (!entry) return;

        const catJP: '資格証明書' | 'その他' =
            category === 'certificate' ? '資格証明書' : 'その他';

        const base: Attachment[] = Array.isArray(entry.attachments)
            ? (entry.attachments as Attachment[])
            : [];

        // 'certificate' も '資格証明書' もまとめて除外
        const others = base.filter(a => !isInCategory(a, catJP));

        const now = new Date().toISOString();
        const mapped: Attachment[] = nextDocs.map(d => ({
            id: d.id ?? crypto.randomUUID(),
            url: d.url ?? null,
            label: d.label,
            type: catJP,                          // ← DBには日本語で保存
            mimeType: d.mimeType ?? null,
            uploaded_at: d.uploaded_at ?? now,
            acquired_at: d.acquired_at ?? d.uploaded_at,
        }));

        // 正規化 + 重複除去（type|label|fileId）
        const merged0 = [...others, ...mapped];
        const seen = new Set<string>();
        const merged: Attachment[] = [];
        for (const a of merged0) {
            const key = `${canonType(a.type)}|${a.label ?? ''}|${extractFileId(a.url) ?? ''}`;
            if (seen.has(key)) continue;
            seen.add(key);
            merged.push({ ...a, type: canonType(a.type) });
        }

        const { error } = await supabase
            .from('form_entries')
            .update({ attachments: merged })
            .eq('id', entry.id);

        if (error) throw error;

        // 画面側も即同期
        setEntry(prev => (prev ? { ...prev, attachments: merged } : prev));
    };

    const [certificates, setCertificates] = useState<DocItem[]>([]);

    useEffect(() => {
        if (!entry) return;
        const att = Array.isArray(entry.attachments) ? entry.attachments : [];

        const certItems: DocItem[] = att
            .filter(a => isInCategory(a as Attachment, '資格証明書')) // ★ここで使用
            .map(a => ({
                id: a.id ?? crypto.randomUUID(),
                url: a.url ?? null,
                label: a.label ?? undefined,
                type: '資格証明書',               // canon に合わせて固定
                mimeType: a.mimeType ?? null,
                uploaded_at: a.uploaded_at,
                acquired_at: a.acquired_at ?? a.uploaded_at,
            }));

        setCertificates(certItems);
    }, [entry]);

    useEffect(() => {
        setServices(determineServicesFromCertificates(certificates, masterRows));
    }, [certificates, masterRows]);

    const saveCertificates = async () => {
        await saveAttachmentsForCategory('certificate', certificates);
        alert("資格証を保存しました");
    };

    // その他書類を DocUploader 用に state 化
    const [otherDocsState, setOtherDocsState] = useState<DocItem[]>([]);

    useEffect(() => {
        // attachments から「固定ID(免許/住民票)でも資格でもない」ものだけを DocItem に正規化
        const nowIso = new Date().toISOString();
        const others: DocItem[] = (attachmentsArray as Attachment[])
            .filter(a => a.url !== null && !isFixedId(a) && !isCert(a))
            .map(p => ({
                id: p.id ?? crypto.randomUUID(),
                url: p.url ?? null,
                label: p.label,
                type: 'other',                // 内部区分（DocUploader の docCategory と一致させる）
                mimeType: p.mimeType ?? null,
                uploaded_at: p.uploaded_at ?? nowIso,
                acquired_at: p.acquired_at ?? p.uploaded_at ?? nowIso,
            }));
        setOtherDocsState(others);
    }, [attachmentsArray]);

    const saveOtherDocs = async () => {
        if (!entry) return;
        // 免許証/住民票などは現状維持
        const fixed = (attachmentsArray as Attachment[]).filter(a => isFixedId(a));
        // DocUploader で編集したその他を Attachment へ戻す（type は「その他」に統一）
        const others: Attachment[] = otherDocsState.map(d => ({
            id: d.id,
            url: d.url,
            label: d.label,
            type: 'その他',
            mimeType: d.mimeType ?? null,
            uploaded_at: d.uploaded_at,
            acquired_at: d.acquired_at,
        }));
        const merged = [...fixed, ...others];

        const { error } = await supabase
            .from('form_entries')
            .update({ attachments: merged })
            .eq('id', entry.id);

        if (error) {
            alert('その他書類の保存に失敗: ' + error.message);
        } else {
            setEntry(prev => (prev ? { ...prev, attachments: merged } : prev));
            alert('その他書類を保存しました');
        }
    };

    useEffect(() => {
        const fetchData = async () => {
            // OrgUnits
            try {
                const orgRes = await fetch('/api/lineworks/getOrgUnits');
                const orgData: OrgUnit[] = await orgRes.json();

                if (Array.isArray(orgData)) {
                    setOrgList(orgData);  // ✅ orgList専用
                } else {
                    console.warn('orgData が配列ではありません:', orgData);
                    setOrgList([]);
                }
            } catch (err) {
                console.error('OrgUnit データ取得エラー:', err);
            }

            // Levels
            try {
                const levelsRes = await fetch('/api/lineworks/getLevels');
                const levelData: { levelId: string; levelName: string }[] = await levelsRes.json();

                if (Array.isArray(levelData)) {
                    setLevelList([{ levelId: '', levelName: 'なし' }, ...levelData]); // ✅ Level専用
                } else {
                    console.warn('Levelsが配列ではありません:', levelData);
                    setLevelList([{ levelId: '', levelName: 'なし' }]);
                }
            } catch (err) {
                console.error('Level データ取得エラー:', err);
            }

            // Positions
            try {
                const posRes = await fetch('/api/lineworks/getPositions');
                const posData: { positionId: string; positionName: string }[] = await posRes.json();

                if (Array.isArray(posData)) {
                    setPositionList([{ positionId: '', positionName: 'なし' }, ...posData]); // ✅ Position専用
                } else {
                    console.warn('Positionsが配列ではありません:', posData);
                    setPositionList([{ positionId: '', positionName: 'なし' }]);
                }
            } catch (err) {
                console.error('Position データ取得エラー:', err);
            }
        };

        fetchData();
    }, []);

    const [myLevelSort, setMyLevelSort] = useState<number | null>(null);

    useEffect(() => {
        const fetchMyLevelSort = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data: userRecord } = await supabase
                .from('users')
                .select('level_id')
                .eq('auth_user_id', user.id)
                .single();

            if (!userRecord?.level_id) return;

            const { data: levelRecord } = await supabase
                .from('levels')
                .select('sort_order')
                .eq('id', userRecord.level_id)
                .single();

            if (levelRecord?.sort_order !== undefined) {
                setMyLevelSort(levelRecord.sort_order);
            }
        };

        fetchMyLevelSort();
    }, []);

    useEffect(() => {
        if (!id) return;
        (async () => {
            const { data, error } = await supabase
                .from('form_entries_with_status')
                .select('*')
                .eq('id', id)
                .single();
            if (error) return;

            // 自分のユーザーレコード取得
            const { data: { user } } = await supabase.auth.getUser();
            let isAdmin = false;
            if (user) {
                const { data: record } = await supabase
                    .from('users')
                    .select('system_role')
                    .eq('auth_user_id', user.id)
                    .single();
                if (record?.system_role === 'admin') {
                    isAdmin = true;
                }
            }

            // ★ adminは常に unrestricted
            if (!isAdmin) {
                const entryLevelSort = data.level_sort ?? 99999999;
                if (myLevelSort !== null && entryLevelSort <= myLevelSort) {
                    setRestricted(true);
                    return;
                }
            }

            setRestricted(false);
            setEntry(normalizeEntryFromDb(data));
            setManagerNote(data?.manager_note ?? '');
        })();
    }, [id, myLevelSort]);


    const fetchExistingIds = async () => {
        const { data } = await supabase.from('users').select('user_id');
        setExistingIds(data?.map((row: { user_id: string }) => row.user_id) ?? []);
    };

    useEffect(() => {
        fetchExistingIds();
    }, []);

    useEffect(() => {
        if (entry && existingIds.length) {
            const nameInfo = {
                firstKana: entry.first_name_kana,
                lastKana: entry.last_name_kana,
            };
            const suggestions = getUserIdSuggestions(nameInfo, existingIds);
            setUserIdSuggestions(suggestions);
            if (suggestions.length > 0) setUserId(suggestions[0]);
        }
    }, [entry, existingIds]);


    const fetchUserRecord = useCallback(async () => {
        if (!entry?.id) return;
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('entry_id', entry.id)
            .single();

        if (!error && data) {
            setUserRecord(data);
            setUserId(data.user_id);  // DBにあるIDをそのまま使う
        } else {
            setUserRecord(null);
        }
    }, [entry?.id]);

    useEffect(() => {
        if (entry) {
            fetchUserRecord();
        }
    }, [entry, fetchUserRecord]);

    useEffect(() => {
        if (entry && !userRecord && existingIds.length) {
            const nameInfo = {
                firstKana: entry.first_name_kana,
                lastKana: entry.last_name_kana,
            };
            const suggestions = getUserIdSuggestions(nameInfo, existingIds);
            setUserIdSuggestions(suggestions);
            if (suggestions.length > 0) setUserId(suggestions[0]);
        }
    }, [entry, userRecord, existingIds]);

    const handleAccountCreate = async () => {
        if (existingIds.includes(userId)) {
            alert('このアカウントIDは既に存在します。別のIDを入力してください。');
            return;
        }

        setUserIdLoading(true);

        const { error } = await supabase.from('users').insert({
            user_id: userId,
            system_role: 'member',
            entry_id: entry?.id,
            status: 'account_id_create',  // アカウントID作成済の状態
        });

        setUserIdLoading(false);

        if (!error) {
            alert('アカウントを作成しました');
            await fetchExistingIds();  // 登録後の最新状態を反映
            await fetchUserRecord();
        } else {
            alert('エラーが発生しました：' + (error.message || ''));
        }
    };

    // 既存の loadDocMaster useEffect を置き換え or 修正
    useEffect(() => {
        const loadDocMaster = async () => {
            const { data, error } = await supabase
                .from('user_doc_master')
                .select('category,label,is_active,sort_order,service_key:doc_group') // ← 追加
                .order('sort_order', { ascending: true });

            if (error) {
                console.error('user_doc_master load error:', error);
                return;
            }

            const rows = (data ?? []) as CertMasterRow[];
            setMasterRows(rows);

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


    const [sendingInvite, setSendingInvite] = useState(false);
    void sendingInvite;
    const [inviteSent, setInviteSent] = useState(false);
    void inviteSent;

    const handleSendInvite = async () => {
        if (!userId || !entry?.email) {
            alert('必要な情報が不足しています。');
            return;
        }

        setSendingInvite(true);
        setInviteSent(false);

        try {
            // 🔑 仮パスワード生成
            //const password = generateSecurePassword();

            // 🔑 Supabase サインアップ
            const { data, error } = await supabase.auth.signUp({
                email: entry.email,
                password: 'DummyPass123!',
                options: {
                    emailRedirectTo: 'https://myfamille.shi-on.net/signup/complete',
                    data: {
                        full_name: `${entry.last_name_kanji} ${entry.first_name_kanji}`
                    }
                }
            });

            if (error) {
                console.error('Sign-up error:', error);
                alert(`メール送信に失敗しました: ${error.message}`);
                return;
            }

            if (!data.user?.id) {
                alert('認証ユーザー情報が取得できませんでした。');
                return;
            }

            alert('認証メールを送信しました！');
            setInviteSent(true);

            await addStaffLog({
                staff_id: entry.id,
                action_at: new Date().toISOString(),
                action_detail: '認証メール送信',
                registered_by: 'システム'
            });
            console.log('📝 認証メール送信ログを記録しました');

            const { error: statusError } = await supabase
                .from('users')
                .update({ status: '認証メール送信済' })
                .eq('user_id', userId);

            if (statusError) {
                console.error('ステータス更新エラー:', statusError.message);
            } else {
                console.log('✅ ステータスを認証メール送信済に変更しました');
            }

            if (entry?.id) {
                const { data: userRow } = await supabase
                    .from('users')
                    .select('user_id, status, level_id, position_id, roster_sort')
                    .eq('entry_id', entry.id)
                    .maybeSingle();
                void userRow; // ← 未使用警告回避
            }

            // 📝 users テーブルを更新
            const { error: updateError } = await supabase.from('users')
                .update({
                    auth_user_id: data.user.id,
                    status: 'auth_mail_send'
                })
                .eq('user_id', userId);

            if (updateError) {
                console.error('Supabase users 更新エラー:', updateError);
                alert('ユーザー情報更新に失敗しました。');
                return;
            }

        } catch (e) {
            console.error('招待送信中エラー:', e);
            alert('招待送信中に予期しないエラーが発生しました。');
        } finally {
            setSendingInvite(false);
        }
    };

    useEffect(() => {
        if (!userRecord?.auth_user_id) return;
        const interval = setInterval(async () => {
            const { data, error } = await supabase.auth.admin.getUserById(userRecord.auth_user_id);
            if (!error && data.user?.last_sign_in_at) {
                setUserRecord(prev => prev ? { ...prev, auth_user_id: data.user.id } : prev);
                clearInterval(interval);  // 認証完了で監視終了
            }
        }, 5000);  // 5秒おきに確認（必要に応じて間隔調整）

        return () => clearInterval(interval);
    }, [userRecord?.auth_user_id]);

    const updateEntry = async () => {
        if (!entry) return;

        const wsInput = (entry.work_styles ?? '').trim();
        const cmInput = (entry.commute_options ?? '').trim();

        const workStylesForDB = workStylesIsArray
            ? (wsInput ? splitToArray(wsInput) : [])   // DBが text[] のとき
            : (wsInput || null);                        // DBが text のとき

        const commuteForDB = commuteIsArray
            ? (cmInput ? splitToArray(cmInput) : [])   // DBが text[] のとき
            : (cmInput || null);                        // DBが text のとき

        const emailForDB = (entry.email ?? '').trim() || null; // 空はnullに

        const { error } = await supabase
            .from("form_entries")
            .update({
                first_name_kanji: entry.first_name_kanji,
                last_name_kanji: entry.last_name_kanji,
                first_name_kana: entry.first_name_kana,
                last_name_kana: entry.last_name_kana,
                gender: entry.gender,
                postal_code: entry.postal_code,
                address: entry.address,
                phone: entry.phone,
                birth_year: entry.birth_year,
                birth_month: entry.birth_month,
                birth_day: entry.birth_day,
                email: emailForDB,

                motivation: entry.motivation ?? '',
                work_styles: workStylesForDB,
                workstyle_other: entry.workstyle_other ?? '',
                commute_options: commuteForDB,
                health_condition: entry.health_condition ?? '',

                workplace_1: entry?.workplace_1 ?? null,
                period_from_1: entry?.period_from_1 ?? null,
                period_to_1: entry?.period_to_1 ?? null,
                workplace_2: entry?.workplace_2 ?? null,
                period_from_2: entry?.period_from_2 ?? null,
                period_to_2: entry?.period_to_2 ?? null,
                workplace_3: entry?.workplace_3 ?? null,
                period_from_3: entry?.period_from_3 ?? null,
                period_to_3: entry?.period_to_3 ?? null,
            })
            .eq("id", entry.id);

        if (error) {
            console.error("更新失敗:", error);
            alert("更新に失敗しました: " + error.message);
        } else {
            alert("保存しました");
        }
    };


    const handleSaveManagerNote = async () => {
        setNoteSaving(true);
        setNoteMsg(null);
        if (!entry) return;
        const { error } = await supabase
            .from('form_entries')
            .update({ manager_note: managerNote })
            .eq('id', entry.id);

        if (error) {
            setNoteMsg('保存に失敗しました：' + error.message);
        } else {
            setNoteMsg('保存しました');
        }
        setNoteSaving(false);
    };


    const [sendingContract, setSendingContract] = useState(false);

    const handleSendContractMail = async () => {
        if (!entry) {
            alert('エントリー情報が取得できていません。');
            return;
        }

        setSendingContract(true);  // ここを追加！

        const result = await fetch('/api/send-contract-email', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                entry,  // 必要に応じて必要なデータだけ送る
            }),
        });

        const resJson = await result.json();

        if (result.ok === true) {
            alert(`雇用契約書メールを ${entry.email} に送信しました。`);
        } else {
            alert(`メール送信に失敗しました: ${resJson.error}`);
        }

        setSendingContract(false);
    };

    const [lineWorksExists, setLineWorksExists] = useState<boolean | null>(null);


    useEffect(() => {
        if (entry) {
            console.log('LINE WORKS アカウント作成送信データ', {
                userId,
                fullName: `${entry.last_name_kanji} ${entry.first_name_kanji}`,
                email: entry.email
            });
        }
    }, [entry, userId]);


    // LINE WORKS
    // サーバーAPIを呼び出すだけにする
    const [creatingLineWorks, setCreatingLineWorks] = useState(false);  // 処理中フラグ

    const handleCreateLineWorksAccount = async () => {
        if (!userId || !entry) {
            alert('必要な情報が不足しています。');
            return;
        }

        setCreatingLineWorks(true);  // 処理開始

        try {
            const payload: Record<string, unknown> = {
                loginId: userId, // ← localName → loginId に修正（API設計と一致）
                lastName: entry.last_name_kanji,
                firstName: entry.first_name_kanji,
                orgUnitId: selectedOrg
            };
            if (selectedPosition) payload.positionId = selectedPosition;
            if (selectedLevel) payload.levelId = selectedLevel;

            console.log('送信データ:', payload);

            const res = await fetch('/api/lineworks/create-user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();

            if (!res.ok || !data.success) {
                console.error('LINE WORKS アカウント作成失敗:', data.error);
                alert(`LINE WORKS アカウント作成に失敗しました: ${data.error}`);
                return;
            }

            await addStaffLog({
                staff_id: entry.id,
                action_at: new Date().toISOString(),
                action_detail: 'LINE WORKS アカウント作成',
                registered_by: 'システム'
            });

            const { error: statusError } = await supabase
                .from('users')
                .update({ status: 'lw_registered' })
                .eq('user_id', userId);

            if (statusError) {
                console.error('ステータス更新エラー:', statusError.message);
            } else {
                console.log('✅ ステータスを4（LINE WORKS登録済）に変更しました');
            }

            alert(`LINE WORKS アカウント作成成功！仮パスワード: ${data.tempPassword}`);

            // Supabase ユーザー情報を更新
            console.log('Supabase 更新データ:', {
                temp_password: data.tempPassword,
                org_unit_id: selectedOrg,
                level_id: selectedLevel,
                position_id: selectedPosition
            });

            await supabase.from('users').update({
                temp_password: data.tempPassword,
                org_unit_id: selectedOrg,
                level_id: selectedLevel,
                position_id: selectedPosition
            }).eq('user_id', userId);


            if (!res.ok || !data.success) {
                console.error('LINE WORKS アカウント作成失敗:', data.error);
                alert(`LINE WORKS アカウント作成に失敗しました: ${data.error}`);
                return;
            } else {
                console.log('ユーザー情報を更新しました');
            }

            setLineWorksExists(true);

            // メールテンプレート生成
            const { subject, body } = lineworksInviteTemplate({
                fullName: `${entry.last_name_kanji} ${entry.first_name_kanji}`,
                userId,
                tempPassword: data.tempPassword
            });

            console.log('メール送信データ:', {
                to: entry.email,
                subject,
                body
            });

            const mailRes = await fetch('/api/send-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to: entry.email,
                    subject,
                    html: body
                })
            });

            if (!mailRes.ok) {
                const err = await mailRes.json();
                alert(`メール送信に失敗しました: ${err.error || '不明なエラー'}`);
            } else {
                await addStaffLog({
                    staff_id: entry.id,
                    action_at: new Date().toISOString(),
                    action_detail: 'LINE WORKS ログイン案内メール送信',
                    registered_by: 'システム'
                });
                alert('LINE WORKS ログイン案内メールを送信しました！');
            }

            // 2. ユーザー情報を同期（GETリクエスト）
            await fetch('/api/cron/sync-lineworks-users', { method: 'GET' });

            // 3. 少し待機（Supabase反映待ち）
            await new Promise(resolve => setTimeout(resolve, 1000));

            //すでに一度　lw_userIdもっている場合には更新
            //alert('updateLWuser: userId:'+userId+'lw_userid:'+data.userId);
            await fetch('/api/update-lw-userid', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, lwUserId: data.userId })
            });


            //ラインワークス・アイコン画像アップロード
            //alert('selectedOrg:' + selectedOrg);
            const iconUrl = await getOrgIconUrl(selectedOrg);
            //alert('iconUrl:' + iconUrl);
            console.log('取得した orgUnitId:', selectedOrg);
            console.log('取得された iconUrl:', iconUrl);

            //alert('data.userId:' + data.userId);

            if (iconUrl) {
                console.log('🟢 アイコンアップロード開始');
                //alert('🟢 アイコンアップロード開始');
                const lwUserId = data.userId;  // ← LINE WORKS の内部UUID
                await fetch('/api/upload-lwuser_icon', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ userId: lwUserId, iconUrl })
                });

            } else {
                console.warn('⚠️ アイコンURLが取得できなかったため、アップロードをスキップ');
            }

            console.log('🟢 続けてグループ初期化を開始します');
            let mgrLwUserId: string | null = null;
            try {
                const { data: orgRow } = await supabase
                    .from('orgs')
                    .select('mgr_user_id')
                    .eq('orgunitid', selectedOrg)
                    .maybeSingle();

                const mgrUserId = orgRow?.mgr_user_id ?? null;
                if (mgrUserId) {
                    const { data: mgrView } = await supabase
                        .from('user_entry_united_view')
                        .select('lw_userid')
                        .eq('user_id', mgrUserId)
                        .not('lw_userid', 'is', null)
                        .maybeSingle();

                    if (mgrView?.lw_userid) {
                        mgrLwUserId = mgrView.lw_userid;  // ← ここで代入
                    }
                }
            } catch (e) {
                console.warn(`mgr_user_id 解決スキップ: ${e instanceof Error ? e.message : String(e)}`);
            }

            try {
                const groupRes = await fetch('/api/lineworks/init-group', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        userId: data.userId,  // ✅ lw_userid（UUID）を渡す
                        orgUnitId: selectedOrg,
                        extraMemberIds: [mgrLwUserId].filter(Boolean), // ②-1: 上司も同席
                        applicantName: `${entry.last_name_kanji ?? ""}${entry.first_name_kanji ?? ""}`,
                        fullName: `${entry.last_name_kanji ?? ""} ${entry.first_name_kanji ?? ""}`.trim(),
                        name: `${entry.last_name_kanji ?? ""}${entry.first_name_kanji ?? ""}`,
                    })
                });

                if (groupRes.ok) {
                    console.log('✅ LINE WORKS グループ初期化成功');
                    await addStaffLog({
                        staff_id: entry.id,
                        action_at: new Date().toISOString(),
                        action_detail: 'LINE WORKS グループ初期化',
                        registered_by: 'システム'
                    });
                } else {
                    const err = await groupRes.json();
                    console.error('❌ グループ初期化失敗:', err);
                    alert(`グループ初期化に失敗しました: ${err.error || '不明なエラー'}`);
                }
            } catch (groupErr) {
                console.error('グループ初期化中の通信エラー:', groupErr);
                alert('グループ初期化中に通信エラーが発生しました。');
            }

        } catch (err) {
            console.error('LINE WORKS アカウント作成中エラー:', err);
            alert('LINE WORKS アカウント作成中にエラーが発生しました。');
        } finally {

            setCreatingLineWorks(false);  // 処理終了
        }

    };

    // Supabase からアイコンURLを取得（修正版）
    const getOrgIconUrl = async (orgId: string): Promise<string | null> => {
        const { data, error } = await supabase
            .from('org_icons')
            .select('file_id')
            .eq('org_id', orgId)
            .eq('category', 'none') // ✅ 追加条件
            .maybeSingle(); // ← これで複数でも安全に処理できる

        if (error) {
            console.error('アイコン取得エラー:', error.message);
            return null;
        }

        if (!data?.file_id) {
            console.warn('該当 org_id のアイコン（category=none）が存在しません:', orgId);
            return null;
        }

        return data.file_id; // ← 完全URLがすでに格納されている
    };
    useEffect(() => {
        const load = async () => {
            if (!userId) return;

            try {
                const res = await fetch('/api/check-lineworks-user', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId }),
                });

                const text = await res.text();

                try {
                    const data = JSON.parse(text);
                    if (res.ok && typeof data.exists === 'boolean') {
                        setLineWorksExists(data.exists);
                    } else {
                        console.warn('LINE WORKS ユーザー確認のレスポンスが不正です:', data);
                        setLineWorksExists(null);
                    }
                } catch (parseErr) {
                    console.warn('JSON パース失敗（check-user）:', parseErr, 'レスポンス内容:', text);
                    setLineWorksExists(null);
                }

            } catch (err) {
                console.error('LINE WORKS ユーザー確認中エラー:', err);
                setLineWorksExists(null);
            }
        };

        load();
    }, [userId]);

    useEffect(() => {
        if (
            userRecord &&
            orgList.length > 0 &&
            levelList.length > 0 &&
            positionList.length > 0
        ) {
            const defaultOrg = orgList.find(
                (org) => org.orgUnitName === "管理者直属チーム"
            );

            const defaultLevel = levelList.find(
                (level) => level.levelName === "契約社員"
            );

            setSelectedOrg(userRecord.org_unit_id || defaultOrg?.orgUnitId || "");
            setSelectedLevel(userRecord.level_id || defaultLevel?.levelId || "");
            setSelectedPosition(userRecord.position_id || "");
        }
    }, [userRecord, orgList, levelList, positionList]);

    // 写真再アップロー

    // 2. Entryの再取得関数
    const fetchEntry = useCallback(async () => {
        const { data, error } = await supabase
            .from('form_entries')
            .select('*')
            .eq('id', id)
            .single();
        if (!error && data) setEntry(normalizeEntryFromDb(data));
    }, [id]);

    // 3. 削除ハンドラ
    const handleDeletePhoto = async () => {
        if (!entry) return;
        const { error } = await supabase
            .from('form_entries')
            .update({ photo_url: null })
            .eq('id', entry.id);

        if (!error) {
            await fetchEntry(); // 削除後、再fetchして即時反映
            alert("顔写真を削除しました");
        } else {
            console.error("DB update error:", error);
            alert("削除に失敗しました: " + error.message);
        }
    };

    // 4. アップロードハンドラ
    const handlePhotoReupload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith("image/")) {
            alert("jpgまたはpng形式の画像を選択してください。");
            return;
        }
        const formData = new FormData();
        formData.append("file", file);
        formData.append("filename", `photo_reupload_${Date.now()}_${file.name}`);
        const res = await fetch("/api/upload", { method: "POST", body: formData });  // ←これでOK
        const result = await res.json();
        console.log('アップロードAPI result:', result);
        const url = result.url;
        if (!url) {
            alert("アップロード失敗");
            return;
        }
        const { error } = await supabase
            .from('form_entries')
            .update({ photo_url: url })
            .eq('id', entry.id);
        if (!error) {
            await fetchEntry();
            alert("顔写真をアップロードしました");
        } else {
            alert("DB更新に失敗しました: " + error.message);
        }
    };

    if (!entry) return <p className="p-4">読み込み中...</p>;

    // 追加: 判定ヘルパ
    const isFixedId = (att?: Attachment) =>
        ['免許証表', '免許証裏', '住民票'].includes(att?.type ?? '');

    const isCert = (att?: Attachment) => {
        if (!att) return false;
        // 明示の型を最優先
        if (att.type === '資格証明書') return true;
        // ラベル規約
        if (att.label && att.label.startsWith('certificate_')) return true;
        // 互換: 文字列一致のみ安全側で許可
        if (att.type && ['資格証', '資格証明書', 'certificate'].includes(att.type)) return true;
        return false;
    };

    const licenseFront = attachmentsArray.find((a: Attachment) => a.type === '免許証表');
    const licenseBack = attachmentsArray.find((a: Attachment) => a.type === '免許証裏');
    const residenceCard = attachmentsArray.find((a: Attachment) => a.type === '住民票');

    if (restricted) {
        return <p className="p-6 text-red-600 font-bold">このエントリーにはアクセスできません（権限不足）</p>;
    }
    if (!entry) return <p className="p-4">読み込み中...</p>;

    //認証ユーザーレコードを削除する
    const handleDeleteAuthUser = async () => {
        if (!userRecord?.auth_user_id) {
            alert('auth_user_id が存在しません。');
            return;
        }

        const confirmed = confirm('この認証ユーザーを削除しますか？');
        if (!confirmed) return;

        try {
            const res = await fetch('/api/delete-auth-user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ authUserId: userRecord.auth_user_id })
            });

            const result = await res.json();

            if (!res.ok) {
                alert(`認証ユーザーの削除に失敗しました: ${result.error}`);
                return;
            }

            alert('認証ユーザーを削除しました');

            // users テーブルの初期化も忘れずに
            const { error: updateError } = await supabase
                .from('users')
                .update({
                    auth_user_id: null,
                    status: 'account_id_create'
                })
                .eq('user_id', userRecord.user_id);

            if (updateError) {
                alert('usersテーブル更新に失敗しました: ' + updateError.message);
            } else {
                await fetchUserRecord();  // 再取得
            }
        } catch (e) {
            console.error('削除処理エラー:', e);
            alert('削除中にエラーが発生しました。');
        }
    };

    // 追加：共通ヘルパ
    // 置き換え：必ず mimeType を返す（file.type が空でも拡張子で補完）
    const uploadFileViaApi = async (file: File) => {
        const form = new FormData();
        form.append("file", file);
        form.append("filename", `${Date.now()}_${file.name}`);

        const res = await fetch("/api/upload", { method: "POST", body: form });
        if (!res.ok) throw new Error("upload failed");
        const json = await res.json();

        // file.type が空のブラウザ/環境のために拡張子で補完
        const lower = file.name.toLowerCase();
        const guessedFromExt =
            lower.endsWith(".pdf") ? "application/pdf" :
                lower.endsWith(".png") ? "image/png" :
                    lower.endsWith(".jpg") || lower.endsWith(".jpeg") ? "image/jpeg" :
                        null;

        const mimeType = (file.type || json.mimeType || guessedFromExt || null) as string | null;

        return { url: json.url as string, mimeType };
    };

    // 置き換え：配列保存ヘルパはそのまま
    const saveAttachments = async (next: Attachment[]) => {
        if (!entry) return;
        const { error } = await supabase
            .from("form_entries")
            .update({ attachments: next })
            .eq("id", entry.id);
        if (error) throw error;

        // entry を安全に更新
        setEntry(prev => (prev ? { ...prev, attachments: next } : prev));
    };

    // 追加：削除ハンドラ（参照エラーの解消）
    const handleDeleteAttachment = async (by: { type?: string; label?: string }) => {
        if (!entry) return;
        const current = Array.isArray(entry.attachments) ? [...entry.attachments] : [];
        const next = current.filter(a =>
            by.type ? a.type !== by.type : by.label ? a.label !== by.label : true
        );
        await supabase.from('form_entries').update({ attachments: next }).eq('id', entry.id);
        await fetchEntry();
        const actor = await getCurrentUserId();
        const what =
            by.type ? `type=${by.type}` :
                by.label ? `label=${by.label}` : 'unknown';
        await addStaffLog({
            staff_id: entry.id,
            action_at: new Date().toISOString(),
            action_detail: `添付削除: ${what}`,
            registered_by: actor,
        });

        alert('添付を削除しました');
    };

    // （質問への回答に合わせて）const 版ハンドラ
    const handleFixedTypeUpload = async (
        file: File,
        type: "免許証表" | "免許証裏" | "住民票"
    ) => {
        if (!entry) return;
        try {
            const { url, mimeType } = await uploadFileViaApi(file);

            // 既存を探す
            const current = attachmentsArray;
            const now = new Date().toISOString();
            const existing = current.find(a => a.type === type);

            let next: Attachment[];
            if (existing) {
                // 既存レコードを差し替え
                next = current.map(a =>
                    a.id === existing.id
                        ? { ...a, url, mimeType, uploaded_at: now } // acquired_at はそのまま保持
                        : a
                );
            } else {
                // 新規追加（必要なら）
                next = [
                    ...current,
                    {
                        id: crypto.randomUUID(),
                        url,
                        mimeType,
                        type,
                        label: type,
                        uploaded_at: now,
                        acquired_at: now, // 取得日が不明なら暫定で now
                    }
                ];
            }

            await saveAttachments(next);

            const actor = await getCurrentUserId();
            await addStaffLog({
                staff_id: entry.id,
                action_at: now,
                action_detail: `添付アップロード: ${type}`,
                registered_by: actor,
            });
            alert(`${type} をアップロードしました`);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            alert(`アップロードに失敗: ${msg}`);
        } finally {

        }
    };

    // ★ 上下に同じボタン群を出す（ユーザーID決定は含めない）
    const ActionButtons = () => (
        <div className="flex flex-wrap justify-center items-center gap-3 pt-4">
            {/* 認証メール送信 */}
            {userRecord && !userRecord.auth_user_id ? (
                <button
                    className="px-4 py-2 bg-green-700 text-white rounded shadow hover:bg-green-800 transition"
                    onClick={handleSendInvite}
                    disabled={!userId || !entry?.email}
                >
                    認証メール送信
                </button>
            ) : (
                userRecord?.auth_user_id ? (
                    <span className="px-2 py-1 rounded bg-gray-200 text-green-700 font-bold">認証完了</span>
                ) : (
                    <span className="text-sm text-gray-500">ユーザーID未登録（まずIDを決定）</span>
                )
            )}

            {/* 認証情報削除 */}
            <button
                onClick={handleDeleteAuthUser}
                className="px-3 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm whitespace-nowrap"
                disabled={!userRecord?.auth_user_id}
            >
                認証情報削除
            </button>

            {/* LINE WORKS アカウント生成 */}
            {lineWorksExists ? (
                <span className="px-2 py-1 rounded bg-gray-200 text-blue-700 font-bold">LINEWORKS登録済</span>
            ) : (
                <button
                    className="px-3 py-2 bg-blue-700 text-white rounded hover:bg-blue-800 text-sm whitespace-nowrap"
                    onClick={handleCreateLineWorksAccount}
                    disabled={creatingLineWorks}
                >
                    {creatingLineWorks ? '処理中...' : 'LWアカウント生成'}
                </button>
            )}

            {/* カイポケユーザー追加 */}
            <button
                className="px-3 py-2 bg-orange-700 text-white rounded hover:bg-orange-800 text-sm whitespace-nowrap"
                disabled={!selectedOrg || !selectedLevel || creatingKaipokeUser}
                onClick={handleCreateKaipokeUser}
            >
                {creatingKaipokeUser ? '登録中...' : 'カイポケユーザー追加'}
            </button>

            {/* 雇用契約書メール送信 */}
            <button
                onClick={handleSendContractMail}
                disabled={sendingContract}
                className="px-3 py-2 bg-purple-700 text-white rounded shadow hover:bg-purple-800 text-sm whitespace-nowrap"
            >
                {sendingContract ? '送信中...' : '雇用契約書メール送信'}
            </button>

            {/* 保存 / 戻る */}
            <button
                className="px-4 py-2 bg-green-700 text-white rounded shadow hover:bg-green-800 transition"
                onClick={updateEntry}
            >
                保存
            </button>
            <Link
                href="/portal/entry-list"
                className="px-4 py-2 bg-blue-600 text-white rounded shadow hover:bg-blue-700 flex items-center gap-2 transition"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6" /></svg>
                戻る
            </Link>
        </div>
    );

    return (
        <div className="max-w-4xl mx-auto p-6 bg-white rounded shadow space-y-6">
            <div className="text-center mb-4">
                {entry?.photo_url ? (
                    <>
                        <Image
                            src={entry.photo_url}
                            alt="顔写真"
                            width={160}
                            height={160}
                            className="inline-block h-40 w-40 rounded-full border object-cover shadow"
                        />
                        <div className="mt-2">
                            <button
                                className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700"
                                onClick={handleDeletePhoto}
                            >
                                顔写真を削除
                            </button>
                        </div>
                    </>
                ) : (
                    <div className="flex flex-col items-center gap-2">
                        <label className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 cursor-pointer">
                            顔写真をアップロード
                            <input
                                type="file"
                                accept="image/png, image/jpeg"
                                onChange={handlePhotoReupload}
                                className="hidden"
                            />
                        </label>
                        <span className="text-xs text-gray-500">
                            jpg または png 形式の画像のみアップロード可能です
                        </span>
                    </div>
                )}
            </div>
            {/* 顔写真エリアの直後に共通ボタン */}
            <ActionButtons />
            <h1 className="text-2xl font-bold">エントリー詳細</h1>
            <div className="grid md:grid-cols-2 gap-4">
                <div className="flex items-center gap-2">
                    <Label>名前：</Label>
                    <Input
                        id="last_name_kanji"
                        className="h-9 w-32 text-sm"
                        value={entry?.last_name_kanji || ""}
                        onChange={(e) => setEntry({ ...entry!, last_name_kanji: e.target.value })}
                    />
                    <Input
                        id="first_name_kanji"
                        className="h-9 w-32 text-sm"
                        value={entry?.first_name_kanji || ""}
                        onChange={(e) => setEntry({ ...entry!, first_name_kanji: e.target.value })}
                    />
                </div>
                <div className="flex items-center gap-2">
                    <Label>よみがな：</Label>
                    <Input
                        id="last_name_kana"
                        className="h-9 w-32 text-sm"
                        value={entry?.last_name_kana || ""}
                        onChange={(e) => setEntry({ ...entry!, last_name_kana: e.target.value })}
                    />
                    <Input
                        id="first_name_kana"
                        className="h-9 w-32 text-sm"
                        value={entry?.first_name_kana || ""}
                        onChange={(e) => setEntry({ ...entry!, first_name_kana: e.target.value })}
                    />
                </div>
                <div className="flex items-center gap-2">
                    <Label>性別：</Label>
                    <div className="flex gap-4">
                        <label className="flex items-center gap-1">
                            <input
                                type="radio"
                                name="gender"
                                value="男性"
                                checked={entry?.gender === "男性"}
                                onChange={(e) =>
                                    setEntry({ ...entry!, gender: e.target.value })
                                }
                            />
                            男性
                        </label>

                        <label className="flex items-center gap-1">
                            <input
                                type="radio"
                                name="gender"
                                value="女性"
                                checked={entry?.gender === "女性"}
                                onChange={(e) =>
                                    setEntry({ ...entry!, gender: e.target.value })
                                }
                            />
                            女性
                        </label>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Label>生年月日:</Label>
                    <Input
                        id="birth_year"
                        type="number"
                        className="h-9 w-10 text-sm"
                        value={entry?.birth_year ?? ""}
                        onChange={(e) =>
                            setEntry({ ...entry!, birth_year: Number(e.target.value) })
                        }
                    />
                    <Input
                        id="birth_month"
                        type="number"
                        className="h-9 w-8 text-sm text-center"
                        value={entry?.birth_month ?? ""}
                        onChange={(e) =>
                            setEntry({ ...entry!, birth_month: Number(e.target.value) })
                        }
                    />
                    <Input
                        id="birth_day"
                        type="number"
                        className="h-9 w-8 text-sm text-center"
                        value={entry?.birth_day ?? ""}
                        onChange={(e) =>
                            setEntry({ ...entry!, birth_day: Number(e.target.value) })
                        }
                    />
                    {entry.birth_year && (
                        <span className="ml-2 text-gray-500">
                            （{new Date().getFullYear() - entry.birth_year -
                                ((new Date().getMonth() + 1 < entry.birth_month) ||
                                    (new Date().getMonth() + 1 === entry.birth_month && new Date().getDate() < entry.birth_day)
                                    ? 1 : 0)}歳）
                        </span>
                    )}
                </div>
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                        <Label className="w-20">郵便番号：</Label>
                        <Input
                            id="postal_code"
                            className="h-9 w-32 text-sm"
                            value={entry?.postal_code || ""}
                            onChange={(e) =>
                                setEntry({
                                    ...entry!,
                                    postal_code: e.target.value.replace(/[^0-9\-]/g, ""),
                                })
                            }
                            placeholder="000-0000"
                            maxLength={8}
                        />
                    </div>

                    <div className="flex items-center gap-2">
                        <Label className="w-20">住所：</Label>
                        <Input
                            id="address"
                            className="h-9 flex-1 text-sm"
                            value={entry?.address || ""}
                            onChange={(e) => setEntry({ ...entry!, address: e.target.value })}
                        />
                        {entry.address && (
                            <a
                                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(entry.address)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 underline"
                            >
                                地図
                            </a>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <Label>📞電話:</Label>
                    <Input
                        id="phone"
                        className="h-15 w-32  text-sm "
                        value={entry?.phone || ""}
                        onChange={(e) => setEntry({ ...entry!, phone: e.target.value })}
                    />
                </div>
                {/* メールアドレスと認証状態・認証ボタン */}
                <div className="flex items-center gap-2">
                    <label htmlFor="email" className="block mb-1 font-medium">メールアドレス</label>
                    <input
                        id="email"
                        type="email"
                        className="border rounded px-2 py-1 w-full"
                        value={entry?.email ?? ''}
                        onChange={(e) => setEntry({ ...entry!, email: e.target.value })}
                    />
                </div>
                {/* ユーザーID表示・入力・決定欄 */}
                <div className="flex items-center border rounded p-2 gap-2 mt-2">
                    <label className="text-xs text-gray-500">ユーザーID</label>

                    {userRecord ? (
                        <span className="text-sm text-gray-700 font-mono">{userRecord.user_id}</span>
                    ) : (
                        <>
                            <input
                                value={userId}
                                onChange={e => setUserId(e.target.value)}
                                className="border rounded px-2 py-1 w-32"
                            />
                            <button
                                className="px-3 py-1 text-sm bg-blue-600 text-white rounded shadow hover:bg-blue-700 transition whitespace-nowrap"
                                onClick={handleAccountCreate}
                                disabled={userIdLoading || !userId}
                            >
                                {userIdLoading ? "作成中..." : "ﾕｰｻﾞｰID決定"}
                            </button>
                            {userIdSuggestions.length > 0 && (
                                <div className="flex flex-col ml-4">
                                    <span className="text-xs text-gray-500">候補:</span>
                                    {userIdSuggestions.map(sug => (
                                        <button
                                            type="button"
                                            key={sug}
                                            className="text-blue-600 text-xs underline text-left"
                                            onClick={() => setUserId(sug)}
                                            disabled={sug === userId}
                                        >
                                            {sug}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>
                {/* 入社日（最初の入社日 / entry_date_original） */}
                <div className="flex items-center gap-2">
                    <Label className="w-40">最初の入社日</Label>
                    <Input
                        type="date"
                        className="border rounded px-2 py-1 w-40"
                        value={userRecord?.entry_date_original ?? ""}
                        onChange={async (e) => {
                            const next = e.target.value || null;
                            await supabase
                                .from("users")
                                .update({ entry_date_original: next })
                                .eq("user_id", userRecord?.user_id);
                            setUserRecord(prev => prev ? { ...prev, entry_date_original: next } : prev);
                        }}
                    />
                </div>

                {/* 入社日（最新の入社日 / entry_date_latest） */}
                <div className="flex items-center gap-2">
                    <Label className="w-40">入社日</Label>
                    <Input
                        type="date"
                        className="border rounded px-2 py-1 w-40"
                        value={userRecord?.entry_date_latest ?? ""}
                        onChange={async (e) => {
                            const next = e.target.value || null;
                            await supabase
                                .from("users")
                                .update({ entry_date_latest: next })
                                .eq("user_id", userRecord?.user_id);
                            setUserRecord(prev => prev ? { ...prev, entry_date_latest: next } : prev);
                        }}
                    />
                </div>

                {/* 退職日（resign_date_latest） */}
                <div className="flex items-center gap-2">
                    <Label className="w-40">退職日</Label>
                    <Input
                        type="date"
                        className="border rounded px-2 py-1 w-40"
                        value={userRecord?.resign_date_latest ?? ""}
                        onChange={async (e) => {
                            const next = e.target.value || null;
                            await supabase
                                .from("users")
                                .update({ resign_date_latest: next })
                                .eq("user_id", userRecord?.user_id);
                            setUserRecord(prev => prev ? { ...prev, resign_date_latest: next } : prev);
                        }}
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <div>
                        <label className="block text-sm text-gray-600">所属組織</label>
                        <select
                            className="border rounded px-2 py-1 w-full"
                            value={selectedOrg}
                            onChange={e => setSelectedOrg(e.target.value)}
                        >
                            <option value="">選択してください</option>
                            {orgList.map(org => (
                                <option key={org.orgUnitId} value={org.orgUnitId}>
                                    {org.orgUnitName}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm text-gray-600">職級</label>
                        <select
                            className="border rounded px-2 py-1 w-full"
                            value={selectedLevel}
                            onChange={e => setSelectedLevel(e.target.value)}
                        >
                            <option value="">選択してください</option>
                            {levelList.map(level => (
                                <option key={level.levelId} value={level.levelId}>
                                    {level.levelName}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm text-gray-600">役職</label>
                        <select
                            className="border rounded px-2 py-1 w-full"
                            value={selectedPosition}
                            onChange={e => setSelectedPosition(e.target.value)}
                        >
                            <option value="">選択してください</option>
                            {positionList.map(pos => (
                                <option key={pos.positionId} value={pos.positionId}>
                                    {pos.positionName}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Label className="w-24">ステータス</Label>
                    <select
                        className="flex-1 border rounded px-2 py-1"
                        value={userRecord?.status ?? 'account_id_create'}
                        onChange={async (e) => {
                            const next = e.target.value;
                            const { error } = await supabase
                                .from('users')
                                .update({ status: next })
                                .eq('user_id', userRecord ? userRecord.user_id : userId);
                            if (error) alert('ステータス更新に失敗: ' + error.message);
                            else setUserRecord(prev => prev ? { ...prev, status: next } : prev);
                        }}
                    >
                        {['account_id_create', 'auth_mail_send', 'auth_completed', 'lw_registered', 'kaipoke_requested', 'active', 'inactive']
                            .map(s => (<option key={s} value={s}>{s}</option>))}
                    </select>
                </div>

                {/* 並び順(roster) — セレクトの外へ新設 */}
                <div className="flex items-center gap-2">
                    <Label className="w-24">並び順(roster)</Label>
                    <input
                        className="flex-1 border rounded px-2 py-1"
                        value={userRecord?.roster_sort ?? ''}
                        onChange={(e) => setUserRecord(prev => prev ? { ...prev, roster_sort: e.target.value } : prev)}
                        placeholder="9999"
                        disabled={!userRecord?.user_id}
                        title={!userRecord?.user_id ? 'ユーザー未作成のため編集不可（先にユーザーIDを作成）' : ''}
                    />
                    <button
                        className="px-3 py-1 bg-green-600 text-white rounded disabled:opacity-50"
                        disabled={!userRecord?.user_id || rosterSaving}
                        onClick={async () => {
                            if (!userRecord?.user_id) return;
                            setRosterSaving(true); setRosterSaved(false);
                            const v = (userRecord?.roster_sort ?? '').trim() || '9999';
                            const { error } = await supabase
                                .from('users')
                                .update({ roster_sort: v })
                                .eq('user_id', userRecord.user_id);
                            setRosterSaving(false);
                            if (error) alert('roster_sort更新に失敗: ' + error.message);
                            else { setRosterSaved(true); setTimeout(() => setRosterSaved(false), 1200); }
                        }}
                    >
                        {rosterSaving ? '保存中…' : '保存'}
                    </button>
                    {rosterSaved && <span className="text-xs text-green-600">保存しました</span>}
                </div>
                <div className="md:col-span-2 space-y-1">
                    <strong>職歴:</strong>
                    <table className="border w-full text-sm">
                        <thead>
                            <tr>
                                <th className="border px-2 py-1">勤務先</th>
                                <th className="border px-2 py-1">期間（開始）</th>
                                <th className="border px-2 py-1">期間（終了）</th>
                            </tr>
                        </thead>
                        <tbody>
                            {[1, 2, 3].map((n) => {
                                const wpKey = `workplace_${n}` as WorkKey;
                                const pfKey = `period_from_${n}` as WorkKey;
                                const ptKey = `period_to_${n}` as WorkKey;
                                return (
                                    <tr key={n}>
                                        <td className="border px-2 py-1">
                                            <input
                                                className="border rounded px-2 py-1 w-full"
                                                value={getField(wpKey)}
                                                onChange={(e) => setField(wpKey, e.target.value)}
                                            />
                                        </td>
                                        <td className="border px-2 py-1">
                                            <input
                                                className="border rounded px-2 py-1 w-full"
                                                value={getField(pfKey)}
                                                onChange={(e) => setField(pfKey, e.target.value)}
                                            />
                                        </td>
                                        <td className="border px-2 py-1">
                                            <input
                                                className="border rounded px-2 py-1 w-full"
                                                value={getField(ptKey)}
                                                onChange={(e) => setField(ptKey, e.target.value)}
                                            />
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
            <div className="space-y-4">
                <div>
                    <label className="block font-semibold mb-1">志望動機</label>
                    <textarea
                        className="w-full border rounded p-2"
                        rows={4}
                        value={entry?.motivation ?? ''}
                        onChange={(e) => setEntry(prev => (prev ? { ...prev, motivation: e.target.value } : prev))}

                    />
                </div>
                <div>
                    <label className="block font-semibold mb-1">働き方の希望（カンマ/スペース/読点で区切り）</label>
                    <input
                        className="w-full border rounded px-2 py-1"
                        value={entry?.work_styles ?? ''}
                        onChange={(e) => setEntry(prev => (prev ? { ...prev, work_styles: e.target.value } : prev))}
                    />
                    <div className="text-xs text-gray-500 mt-1">自由記述</div>
                    <input
                        className="w-full border rounded px-2 py-1"
                        value={entry.workstyle_other ?? ''}
                        onChange={(e) => setEntry({ ...entry!, workstyle_other: e.target.value })}
                    />
                </div>
                <div>
                    <label className="block font-semibold mb-1">通勤方法（カンマ/スペース/読点で区切り）</label>
                    <input
                        className="w-full border rounded px-2 py-1"
                        value={entry?.commute_options ?? ''}
                        onChange={(e) => setEntry(prev => (prev ? { ...prev, commute_options: e.target.value } : prev))}
                    />
                </div>
                <div>
                    <label className="block font-semibold mb-1">健康状態</label>
                    <textarea
                        className="w-full border rounded p-2"
                        rows={3}
                        value={entry.health_condition ?? ''}
                        onChange={(e) => setEntry({ ...entry!, health_condition: e.target.value })}
                    />
                </div>
            </div>
            <div className="space-y-4">
                <h2 className="text-lg font-semibold">アップロード画像</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {/* 免許証 表 */}
                    <div>
                        <FileThumbnail
                            title="免許証（表）"
                            src={licenseFront?.url ?? undefined}
                            mimeType={licenseFront?.mimeType ?? undefined}
                        />
                        <div className="mt-2 flex items-center gap-2">
                            <label className="inline-block mt-1 px-2 py-1 text-xs bg-blue-600 text-white rounded cursor-pointer">
                                差し替え / 追加
                                <input
                                    type="file"
                                    accept="image/*,application/pdf"
                                    className="hidden"
                                    onChange={(e) => {
                                        const f = e.target.files?.[0];
                                        if (!f) return;
                                        handleFixedTypeUpload(f, '免許証表');
                                        e.currentTarget.value = '';
                                    }}
                                />
                            </label>
                            {licenseFront?.url && (
                                <button
                                    className="px-2 py-1 bg-red-600 text-white rounded"
                                    onClick={() => handleDeleteAttachment({ type: "免許証表" })}
                                >
                                    削除
                                </button>
                            )}
                        </div>
                    </div>

                    {/* 免許証 裏 */}
                    <div>
                        <FileThumbnail
                            title="免許証（裏）"
                            src={licenseBack?.url ?? undefined}
                            mimeType={licenseBack?.mimeType ?? undefined}
                        />
                        <div className="mt-2 flex items-center gap-2">
                            免許証（裏）
                            <label className="inline-block mt-1 px-2 py-1 text-xs bg-blue-600 text-white rounded cursor-pointer">
                                差し替え / 追加
                                <input
                                    type="file"
                                    accept="image/*,application/pdf"
                                    className="hidden"
                                    onChange={(e) => {
                                        const f = e.target.files?.[0];
                                        if (!f) return;
                                        handleFixedTypeUpload(f, '免許証裏');
                                        e.currentTarget.value = '';
                                    }}
                                />
                            </label>
                            {licenseBack?.url && (
                                <button
                                    className="px-2 py-1 bg-red-600 text-white rounded"
                                    onClick={() => handleDeleteAttachment({ type: "免許証裏" })}
                                >
                                    削除
                                </button>
                            )}
                        </div>
                    </div>

                    {/* 住民票 */}
                    <div>
                        <FileThumbnail
                            title="住民票"
                            src={residenceCard?.url ?? undefined}
                            mimeType={residenceCard?.mimeType ?? undefined}
                        />
                        <div className="mt-2 flex items-center gap-2">
                            <label className="inline-block mt-1 px-2 py-1 text-xs bg-blue-600 text-white rounded cursor-pointer">
                                差し替え / 追加
                                <input
                                    type="file"
                                    accept="image/*,application/pdf"
                                    className="hidden"
                                    onChange={(e) => {
                                        const f = e.target.files?.[0];
                                        if (!f) return;
                                        handleFixedTypeUpload(f, '住民票');
                                        e.currentTarget.value = '';
                                    }}
                                />
                            </label>
                            {residenceCard?.url && (
                                <button
                                    className="px-2 py-1 bg-red-600 text-white rounded"
                                    onClick={() => handleDeleteAttachment({ type: "住民票" })}
                                >
                                    削除
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <DocUploader
                title="資格情報（attachments列）"
                value={certificates}
                onChange={onCertificatesChange}     // まずは“表示だけ”に集中：保存は後で
                docMaster={{ certificate: docMaster.certificate }}
                docCategory="certificate"
                showPlaceholders={false}        // 未提出スロットを出さない
            />
            <button
                onClick={saveCertificates}
                className="mt-2 px-3 py-1 bg-green-600 text-white rounded"
            >
                資格証を保存
            </button>
            {/* ▼ ここから：資格判定結果の表示（資格情報の下） */}
            {services.length > 0 && (
                <div className="mt-4 p-3 border rounded bg-white">
                    <div className="font-semibold">
                        入れるサービス（{entry.last_name_kanji ?? ''}{entry.first_name_kanji ?? ''} さんの資格から判定）
                    </div>
                    <ul className="list-disc pl-5 mt-2">
                        {services.map((s) => (
                            <li key={s}>{s}</li>
                        ))}
                    </ul>
                </div>
            )}
            {/* ▲ ここまで */}

            <div className="space-y-2">
                <h2 className="text-lg font-semibold">その他の書類</h2>

                <DocUploader
                    title="その他の書類（attachments列）"
                    value={otherDocsState}
                    onChange={onOtherDocsChange}
                    docMaster={{ other: docMaster.other }}
                    docCategory="other"
                />
                <button
                    onClick={saveOtherDocs}
                    className="mt-2 px-3 py-1 bg-green-600 text-white rounded"
                >
                    その他書類を保存
                </button>
            </div>

            <div>
                <strong>同意内容:</strong>
                {entry.consent_snapshot ? (
                    <div className="text-xs text-gray-700 border rounded bg-gray-50 p-2 mt-1">
                        {Object.entries(JSON.parse(entry.consent_snapshot)).map(([k, v]) => (
                            <div key={k}>{v as string}</div>
                        ))}
                        <div className="mt-2 text-right text-gray-400">
                            登録日時：{entry.created_at && new Date(entry.created_at).toLocaleString()}
                        </div>
                    </div>
                ) : (
                    '―'
                )}
            </div>

            {/* マネジャー特記エリア */}
            <div className="mb-8">
                <h2 className="text-lg font-semibold mb-2">マネジャー特記・共有事項</h2>
                <textarea
                    className="w-full border rounded p-2 mb-2"
                    rows={5}
                    maxLength={2000}
                    value={managerNote}
                    onChange={e => setManagerNote(e.target.value)}
                    placeholder="このエントリーについて特記事項・サマリー・情報共有を記入"
                    disabled={noteSaving}
                />
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleSaveManagerNote}
                        disabled={noteSaving}
                        className="px-4 py-1 bg-green-600 text-white rounded hover:bg-green-700"
                    >
                        {noteSaving ? '保存中...' : '保存'}
                    </button>
                    {noteMsg && <span className="text-sm">{noteMsg}</span>}
                </div>
                <div className="text-xs text-gray-400 mt-1">（最大2000文字まで保存可能）</div>
            </div>
            {/* ここでログセクションを挿入 */}
            <StaffLogSection staffId={entry.id} />
            {/* User OJT 記録 */}
            <UserOjtSection
                userId={userRecord?.user_id ?? ''}
                userName={
                    entry
                        ? `${entry.last_name_kanji ?? ''} ${entry.first_name_kanji ?? ''}`.trim()
                        : ''
                }
            />

            {/* 顔写真エリアの直後に共通ボタン */}
            <ActionButtons />
        </div>
    );
}

// 職員ログ（追加＋一覧）セクション
function StaffLogSection({ staffId }: { staffId: string }) {
    const [logs, setLogs] = useState<StaffLog[]>([]);
    const [actionAt, setActionAt] = useState('');
    const [actionDetail, setActionDetail] = useState('');
    const [registeredBy, setRegisteredBy] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // ログ一覧取得
    const fetchLogs = useCallback(async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('staff_log')
            .select('*')
            .eq('staff_id', staffId)
            .order('action_at', { ascending: false });

        if (error) {
            setError(error.message);
        } else {
            setLogs(data as StaffLog[]);
        }
        setLoading(false);
    }, [staffId]);

    useEffect(() => {
        if (staffId) fetchLogs();
    }, [staffId, fetchLogs]);

    // 追加イベント
    const handleAddLog = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!actionAt || !actionDetail || !registeredBy) {
            setError('全項目入力してください。');
            return;
        }

        const logResult = await addStaffLog({
            staff_id: staffId,
            action_at: new Date().toISOString(),
            action_detail: 'LINE WORKS アカウント作成',
            registered_by: 'システム'
        });

        if (logResult?.error) {
            console.error('ログ追加失敗:', logResult.error);
        } else {
            console.log('ログ追加成功');
        }


        if (error) {
            setError(error);
        } else {
            setActionAt('');
            setActionDetail('');
            setRegisteredBy('');
            fetchLogs();
        }
    };

    return (
        <div className="my-12">
            <h2 className="text-lg font-semibold mb-2">職員対応ログ（最新順）</h2>
            <form onSubmit={handleAddLog} className="mb-4 space-y-2 p-4 border rounded bg-gray-50">
                <div>
                    <label className="mr-2">日時:</label>
                    <input
                        type="datetime-local"
                        value={actionAt}
                        onChange={e => setActionAt(e.target.value)}
                        className="border px-2 py-1 rounded"
                        required
                    />
                </div>
                <div>
                    <label className="mr-2">内容:</label>
                    <input
                        type="text"
                        value={actionDetail}
                        onChange={e => setActionDetail(e.target.value)}
                        className="border px-2 py-1 rounded w-80"
                        required
                    />
                </div>
                <div>
                    <label className="mr-2">登録者:</label>
                    <input
                        type="text"
                        value={registeredBy}
                        onChange={e => setRegisteredBy(e.target.value)}
                        className="border px-2 py-1 rounded"
                        required
                    />
                </div>
                <button type="submit" className="ml-2 px-4 py-1 bg-blue-600 text-white rounded hover:bg-blue-700">追加</button>
                {error && <p className="text-red-500 mt-2">{error}</p>}
            </form>
            {loading ? (
                <p>読み込み中...</p>
            ) : logs.length === 0 ? (
                <p className="text-gray-500">履歴はまだありません。</p>
            ) : (
                <table className="w-full text-sm border bg-white rounded">
                    <thead>
                        <tr>
                            <th className="border px-2 py-1">日時</th>
                            <th className="border px-2 py-1">内容</th>
                            <th className="border px-2 py-1">登録者</th>
                        </tr>
                    </thead>
                    <tbody>
                        {logs.map(log => (
                            <tr key={log.id}>
                                <td className="border px-2 py-1">{new Date(log.action_at).toLocaleString()}</td>
                                <td className="border px-2 py-1">{log.action_detail}</td>
                                <td className="border px-2 py-1">{log.registered_by}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
}

// 画像表示＋PDFボタン
function FileThumbnail({
    title,
    src,
    mimeType
}: { title: string; src?: string; mimeType?: string | null }) {
    if (!src) {
        return (
            <div className="text-sm text-center text-gray-500">
                {title}<br />
                ファイルなし
            </div>
        );
    }

    // Google Drive の fileId を URL から抽出
    //const fileIdMatch = src.match(/[-\w]{25,}/);
    const fileId = extractFileId(src);
    if (!fileId) {
        return (
            <div className="text-sm text-center text-red-500">
                {title}<br />
                無効なURL
            </div>
        );
    }

    // ---- 表示ロジック（強化）----
    const mt = (mimeType || "").toLowerCase();
    const titleLower = (title || "").toLowerCase();

    const isPdf = mt === "application/pdf" || /\.pdf$/.test(titleLower);
    const isImage = mt.startsWith("image/");

    // Drive のビュー/ダウンロードURL
    const viewUrl = `https://drive.google.com/uc?export=view&id=${fileId}`;
    const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;

    // PDF は常にボタン（画像化しない）
    if (isPdf) {
        return (
            <div className="text-sm text-center">
                <p className="mb-1">{title}</p>
                <a
                    href={downloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block p-2 border rounded bg-gray-100 hover:bg-gray-200"
                >
                    📄 PDF/ファイルを開く
                </a>
            </div>
        );
    }

    // 画像だけ <Image/>、それ以外（docx等）はリンク
    if (isImage) {
        return (
            <div className="text-sm text-center">
                <p className="mb-1">{title}</p>
                <Image
                    src={viewUrl}
                    alt={title}
                    width={320}
                    height={192}
                    className="w-full h-auto max-h-48 object-contain rounded border hover:scale-105 transition-transform"
                />
                <div className="mt-2">
                    <a
                        href={viewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 underline"
                    >
                        ファイルとして開く
                    </a>
                </div>
            </div>
        );
    }

    // 不明 or 非画像はリンク表示
    return (
        <div className="text-sm text-center">
            <p className="mb-1">{title}</p>
            <a
                href={downloadUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block p-2 border rounded bg-gray-100 hover:bg-gray-200"
            >
                📎 ファイルを開く
            </a>
        </div>
    );
}

function UserOjtSection({ userId, userName }: { userId: string; userName?: string }) {
    const [records, setRecords] = useState<UserOjtRecord[]>([]);
    const [userOptions, setUserOptions] = useState<UserOption[]>([]);
    const [kaipokeOptions, setKaipokeOptions] = useState<KaipokeOption[]>([]);
    const [selectedUserId, setSelectedUserId] = useState<string>(userId);
    const [trainerUserId, setTrainerUserId] = useState<string>('');
    const [selectedKaipokeCsId, setSelectedKaipokeCsId] = useState<string>('');
    const [date, setDate] = useState<string>('');
    // ★★★ 追加：開始時間（start_time） ★★★
    const [startTime, setStartTime] = useState<string>('');
    const [memo, setMemo] = useState<string>('');

    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // userId prop が変わったら、デフォルト選択も合わせる
    useEffect(() => {
        if (userId) {
            setSelectedUserId(userId);
        }
    }, [userId]);

    // マスタ取得（ユーザー & 事業所）
    useEffect(() => {
        const loadMasters = async () => {
            try {
                // ユーザー一覧（OJT対象 & 指導者候補）
                const { data: users, error: userErr } = await supabase
                    .from('user_entry_united_view_single')
                    .select('user_id, last_name_kanji, first_name_kanji')
                    .order('last_name_kanji', { ascending: true })
                    .order('first_name_kanji', { ascending: true });

                if (userErr) throw userErr;

                const uOptions: UserOption[] =
                    (users ?? []).map((u) => ({
                        user_id: u.user_id,
                        display_name: `${u.last_name_kanji ?? ''} ${u.first_name_kanji ?? ''}`.trim() || u.user_id,
                    }));

                setUserOptions(uOptions);

                // カイポケ事業所一覧
                const { data: csList, error: csErr } = await supabase
                    .from('cs_kaipoke_info')
                    .select('kaipoke_cs_id, name, is_active')
                    .eq('is_active', true)
                    .order('name', { ascending: true });

                if (csErr) throw csErr;

                const kOptions: KaipokeOption[] =
                    (csList ?? []).map((c) => ({
                        kaipoke_cs_id: c.kaipoke_cs_id,
                        name: `${c.name}（${c.kaipoke_cs_id}）`,
                    }));

                setKaipokeOptions(kOptions);
            } catch (e) {
                console.error('OJT マスタ取得エラー:', e);
                setError('マスタ情報の取得に失敗しました。');
            }
        };

        loadMasters();
    }, []);

    // 表示用の名前辞書
    const userNameById = useMemo(() => {
        const m: Record<string, string> = {};
        userOptions.forEach(u => { m[u.user_id] = u.display_name; });
        return m;
    }, [userOptions]);

    const kaipokeNameById = useMemo(() => {
        const m: Record<string, string> = {};
        kaipokeOptions.forEach(k => { m[k.kaipoke_cs_id] = k.name; });
        return m;
    }, [kaipokeOptions]);

    // OJT レコード取得（対象 userId で絞り込み）
    const fetchRecords = useCallback(async () => {
        if (!userId) {
            setRecords([]);
            return;
        }
        setLoading(true);
        setError(null);
        const { data, error } = await supabase
            .from('user_ojt_record')
            .select('*')
            .eq('user_id', userId)
            .order('date', { ascending: false });

        if (error) {
            console.error('OJT 取得エラー:', error);
            setError('OJT 記録の取得に失敗しました。');
        } else {
            setRecords((data ?? []) as UserOjtRecord[]);
        }
        setLoading(false);
    }, [userId]);

    useEffect(() => {
        fetchRecords();
    }, [fetchRecords]);

    // 追加
    const handleAddOjt = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!selectedUserId || !date) {
            setError('ユーザーと日付は必須です。');
            return;
        }

        try {
            setSaving(true);
            const { error: insertErr } = await supabase
                .from('user_ojt_record')
                .insert({
                    user_id: selectedUserId,
                    date,
                    start_time: startTime || null,   // ★ここ追加
                    trainer_user_id: trainerUserId || null,
                    kaipoke_cs_id: selectedKaipokeCsId || null,
                    memo: memo || null,
                });

            if (insertErr) throw insertErr;

            setDate('');
            setTrainerUserId('');
            setSelectedKaipokeCsId('');
            setMemo('');

            await fetchRecords();
        } catch (e) {
            console.error('OJT 追加エラー:', e);
            setError('OJT 記録の追加に失敗しました。');
        } finally {
            setSaving(false);
        }
    };

    if (!userId) {
        return (
            <div className="my-12 border rounded p-4 bg-gray-50">
                <h2 className="text-lg font-semibold mb-2">User OJT 記録</h2>
                <p className="text-sm text-gray-500">
                    ユーザーIDが未登録のため、OJT 記録は表示・登録できません。
                </p>
            </div>
        );
    }

    return (
        <div className="my-12">
            <h2 className="text-lg font-semibold mb-2">{userName ? `${userName} さん OJT 記録` : 'User OJT 記録'}</h2>

            <form onSubmit={handleAddOjt} className="mb-4 space-y-2 p-4 border rounded bg-gray-50">
                {/* OJT 対象ユーザー */}
                <div className="flex flex-col md:flex-row md:items-center gap-2">
                    <label className="md:w-24">対象ユーザー</label>
                    <select
                        className="border rounded px-2 py-1 flex-1 min-w-[200px]"
                        value={selectedUserId}
                        onChange={e => setSelectedUserId(e.target.value)}
                    >
                        <option value="">選択してください</option>
                        {userOptions.map(u => (
                            <option key={u.user_id} value={u.user_id}>
                                {u.display_name}
                            </option>
                        ))}
                    </select>
                </div>

                {/* 指導者 */}
                <div className="flex flex-col md:flex-row md:items-center gap-2">
                    <label className="md:w-24">指導者</label>
                    <select
                        className="border rounded px-2 py-1 flex-1 min-w-[200px]"
                        value={trainerUserId}
                        onChange={e => setTrainerUserId(e.target.value)}
                    >
                        <option value="">（任意）</option>
                        {userOptions.map(u => (
                            <option key={u.user_id} value={u.user_id}>
                                {u.display_name}
                            </option>
                        ))}
                    </select>
                </div>

                {/* 事業所（カイポケ CS） */}
                <div className="flex flex-col md:flex-row md:items-center gap-2">
                    <label className="md:w-24">利用者（カイポケCS）</label>
                    <select
                        className="border rounded px-2 py-1 flex-1 min-w-[200px]"
                        value={selectedKaipokeCsId}
                        onChange={e => setSelectedKaipokeCsId(e.target.value)}
                    >
                        <option value="">（任意）</option>
                        {kaipokeOptions.map(k => (
                            <option key={k.kaipoke_cs_id} value={k.kaipoke_cs_id}>
                                {k.name}
                            </option>
                        ))}
                    </select>
                </div>

                {/* 日付 + 開始時間 */}
                <div className="flex flex-col md:flex-row md:items-center gap-2">
                    <label className="md:w-24">日付 / 開始</label>

                    {/* 日付 */}
                    <input
                        type="date"
                        className="border rounded px-2 py-1"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        required
                    />

                    {/* ★ start_time 追加 */}
                    <input
                        type="time"
                        className="border rounded px-2 py-1"
                        value={startTime}
                        onChange={e => setStartTime(e.target.value)}
                    />
                </div>

                {/* メモ */}
                <div className="flex flex-col gap-2">
                    <label>内容 / メモ</label>
                    <textarea
                        className="border rounded px-2 py-1 min-h-[80px]"
                        value={memo}
                        onChange={e => setMemo(e.target.value)}
                    />
                </div>

                <button
                    type="submit"
                    className="px-4 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                    disabled={saving}
                >
                    {saving ? '登録中...' : 'OJT 記録を追加'}
                </button>

                {error && <p className="text-red-500 mt-2 text-sm">{error}</p>}
            </form>

            {/* 一覧 */}
            {loading ? (
                <p>読み込み中...</p>
            ) : records.length === 0 ? (
                <p className="text-gray-500">OJT 記録はまだありません。</p>
            ) : (
                <table className="w-full text-sm border bg-white rounded">
                    <thead>
                        <tr>
                            <th className="border px-2 py-1">日付</th>
                            {/* ★ ここを追加（開始時間） ★ */}
                            <th className="border px-2 py-1">開始</th>
                            <th className="border px-2 py-1">指導者</th>
                            <th className="border px-2 py-1">利用者様</th>
                            <th className="border px-2 py-1">メモ</th>
                        </tr>
                    </thead>
                    <tbody>
                        {records.map(r => (
                            <tr key={r.id}>
                                <td className="border px-2 py-1">
                                    {r.date}
                                </td>
                                {/* ★ ここを追加（開始時間） ★ */}
                                <td className="border px-2 py-1">
                                    {r.start_time ? r.start_time.slice(0, 5) : '―'}
                                </td>
                                <td className="border px-2 py-1">
                                    {r.trainer_user_id ? (userNameById[r.trainer_user_id] ?? r.trainer_user_id) : '―'}
                                </td>
                                <td className="border px-2 py-1">
                                    {r.kaipoke_cs_id ? (kaipokeNameById[r.kaipoke_cs_id] ?? r.kaipoke_cs_id) : '―'}
                                </td>
                                <td className="border px-2 py-1 whitespace-pre-wrap">
                                    {r.memo ?? ''}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
}


// 複数候補を返す関数
function getUserIdSuggestions(
    { firstKana, lastKana }: NameInfo,
    existingIds: string[]
): string[] {
    const firstHeb = hepburn.fromKana(firstKana).toLowerCase().replace(/[^a-z]/g, "");
    const lastHeb = hepburn.fromKana(lastKana).toLowerCase().replace(/[^a-z]/g, "");
    const firstInitial = firstHeb.charAt(0);
    const lastInitial = lastHeb.charAt(0);

    const candidates = [
        `${firstHeb}${lastHeb}`,
        `${firstInitial}${lastHeb}`,
        `${firstHeb}${lastInitial}`,
        `${firstInitial}${lastInitial}${lastHeb}`,
        `${firstInitial}${lastInitial}${firstHeb}`,
    ];
    const base = `${firstHeb}${lastHeb}`;
    for (let num = 2; num < 5; num++) {
        candidates.push(`${base}${num}`);
    }
    return candidates.filter(c => !existingIds.includes(c));
}

