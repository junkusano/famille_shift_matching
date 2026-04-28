'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { useUserRole } from '@/context/RoleContext';

type TrainingGoalSelectionRow = {
    id: string;
    entry_id: string;
    goal_key: string;
    goal_title: string;
    video_url: string | null;
    selected: boolean;
    watched: boolean;
    remark: string | null;
    sort_order: number;
    created_at: string;
    updated_at: string;
    category: string | null;
    group_code: string | null;
    target_condition: string | null;
    training_goal: string | null;
    row_type: 'goal' | 'remark';
};

type TrainingGoalCatalogRow = {
    id: string;
    training_type: string;
    training_code: string;
    training_key: string;
    target_role: 'manager' | 'member' | 'both' | null;
    target_group: string | null;
    training_title: string;
    training_goal: string | null;
    training_month: number | null;
    video_url: string | null;
    sort_order: number;
    is_active: boolean;
};

type JoinedRow = {
    id: string;
    entry_id: string;
    goal_key: string;
    goal_title: string;
    video_url: string | null;
    selected: boolean;
    watched: boolean;
    remark: string | null;
    sort_order: number;
    created_at: string;
    updated_at: string;
    category: string | null;
    group_code: string | null;
    target_condition: string | null;
    training_goal: string | null;
    row_type: 'goal' | 'remark';
    entry?: EmployeeRow | null;
};

type EmployeeRow = {
    entry_id: string;
    user_id: string | null;
    auth_user_id: string | null;
    auth_uid: string | null;
    system_role: string | null;
    status: string | null;
    orgunitname: string | null;
    last_name_kanji: string | null;
    first_name_kanji: string | null;
    last_name_kana: string | null;
    first_name_kana: string | null;
};

export default function TrainingGoalsPage() {
    const role = useUserRole();
    const router = useRouter();
    const searchParams = useSearchParams();

    const [debugRole, setDebugRole] = useState<'admin' | 'member' | ''>('');
    const effectiveRole = debugRole || role;

    const queryUserId = searchParams.get('user_id') ?? '';
    const ALL_ENTRY_ID = '__all__';
    const isAllEmployeesView = ['admin', 'manager'].includes(effectiveRole) && queryUserId === 'all';

    const [rows, setRows] = useState<JoinedRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchText, setSearchText] = useState('');
    const [selectedOrgName, setSelectedOrgName] = useState('');
    const [showOnlySelected, setShowOnlySelected] = useState(false);
    const [employees, setEmployees] = useState<EmployeeRow[]>([]);
    const [selectedEntryId, setSelectedEntryId] = useState<string>('');
    const [debugMemberEntryId, setDebugMemberEntryId] = useState<string>('');
    const [remarkText, setRemarkText] = useState('');
    const [remarkSending, setRemarkSending] = useState(false);
    const [remarkMessage, setRemarkMessage] = useState('');

    type AdminSortKey = 'selected' | 'watched';
    type AdminSortOrder = 'none' | 'asc' | 'desc';

    const [adminSortKey, setAdminSortKey] = useState<AdminSortKey | null>(null);
    const [adminSortOrder, setAdminSortOrder] = useState<AdminSortOrder>('none');

    useEffect(() => {
        const load = async () => {
            setLoading(true);

            const {
                data: { user },
                error: userError,
            } = await supabase.auth.getUser();

            if (userError) {
                console.error('auth.getUser error:', userError);
                setLoading(false);
                return;
            }

            const authUid = user?.id ?? null;

            const { data: employeeData, error: employeeError } = await supabase
                .from('user_entry_united_view_single')
                .select(`
    entry_id,
    user_id,
    auth_user_id,
    auth_uid,
                system_role,
                status,
                orgunitname,
                last_name_kanji,
                first_name_kanji,
                last_name_kana,
                first_name_kana
            `)
                .neq('status', 'removed_from_lineworks_kaipoke')
                .order('orgunitname', { ascending: true })
                .order('last_name_kana', { ascending: true });

            if (employeeError) {
                console.error('user_entry_united_view_single load error:', employeeError);
                setRows([]);
                setLoading(false);
                return;
            }

            const employeeMap = new Map<string, EmployeeRow>();

            for (const emp of (employeeData ?? []) as EmployeeRow[]) {
                if (!emp.entry_id) continue;

                const current = employeeMap.get(emp.entry_id);

                if (!current) {
                    employeeMap.set(emp.entry_id, emp);
                    continue;
                }

                // 同じ人が重複している場合は、管理者直属チームではない方を優先
                const currentOrg = current.orgunitname ?? '';
                const nextOrg = emp.orgunitname ?? '';

                if (
                    currentOrg === '管理者直属チーム' &&
                    nextOrg !== '管理者直属チーム'
                ) {
                    employeeMap.set(emp.entry_id, emp);
                }
            }

            const employeeRows = Array.from(employeeMap.values()).sort((a, b) => {
                const aKana = `${a.last_name_kana ?? ''}${a.first_name_kana ?? ''}`;
                const bKana = `${b.last_name_kana ?? ''}${b.first_name_kana ?? ''}`;

                return aKana.localeCompare(bKana, 'ja');
            });

            setEmployees(employeeRows);

            let targetEntryId = selectedEntryId;

            if (isAllEmployeesView) {
                targetEntryId = ALL_ENTRY_ID;

                if (selectedEntryId !== ALL_ENTRY_ID) {
                    setSelectedEntryId(ALL_ENTRY_ID);
                }
            }

            const queryEmployee =
                queryUserId && queryUserId !== 'all'
                    ? employeeRows.find((e) => e.user_id === queryUserId)
                    : null;

            // ① URLクエリー最優先
            if (queryEmployee) {
                targetEntryId = queryEmployee.entry_id;

                if (targetEntryId !== selectedEntryId) {
                    setSelectedEntryId(targetEntryId);
                }

                // ② 確認用 member 表示
            } else if (effectiveRole === 'member') {
                if (debugRole === 'member') {
                    targetEntryId = debugMemberEntryId || employeeRows[0]?.entry_id || '';

                    if (targetEntryId && targetEntryId !== debugMemberEntryId) {
                        setDebugMemberEntryId(targetEntryId);
                    }
                } else {
                    const me = employeeRows.find((e) => e.auth_uid === authUid);
                    targetEntryId = me?.entry_id ?? '';
                }

                // ③ admin / manager 表示
            } else if ((effectiveRole === 'admin' || effectiveRole === 'manager') && !targetEntryId) {
                targetEntryId = ALL_ENTRY_ID;
                setSelectedEntryId(ALL_ENTRY_ID);
                router.replace('?user_id=all', { scroll: false });
            }

            if (!targetEntryId) {
                setRows([]);
                setLoading(false);
                return;
            }

            const { data: catalogData, error: catalogError } = await supabase
                .from('training_goal_catalog')
                .select(`
        id,
        training_type,
        training_code,
        training_key,
        target_role,
        target_group,
        training_title,
        training_goal,
        training_month,
        video_url,
        sort_order,
        is_active
    `)
                .eq('is_active', true)
                .order('sort_order', { ascending: true })
                .order('training_key', { ascending: true });

            if (catalogError) {
                console.error('training_goal_catalog load error:', catalogError);
                setRows([]);
                setLoading(false);
                return;
            }

            if (isAllEmployeesView) {

                const { data: allSelectionData, error: allSelectionError } = await supabase
                    .from('employee_training_goals')
                    .select(`
            id,
            entry_id,
            goal_key,
            goal_title,
            video_url,
            selected,
            watched,
            remark,
            sort_order,
            created_at,
            updated_at,
            category,
            group_code,
            target_condition,
            training_goal,
            row_type
        `)
                    .in(
                        'entry_id',
                        employeeRows.map((e) => e.entry_id)
                    )
                    .eq('row_type', 'goal');

                if (allSelectionError) {
                    console.error('all employee_training_goals load error:', allSelectionError);
                    setRows([]);
                    setLoading(false);
                    return;
                }

                const selectionsByEntryId = new Map<string, TrainingGoalSelectionRow[]>();

                for (const row of (allSelectionData ?? []) as TrainingGoalSelectionRow[]) {
                    if (!row.selected) continue;

                    const current = selectionsByEntryId.get(row.entry_id) ?? [];
                    current.push(row);
                    selectionsByEntryId.set(row.entry_id, current);
                }

                const allJoined: JoinedRow[] = employeeRows.map((emp) => {
                    const selectedGoals = selectionsByEntryId.get(emp.entry_id) ?? [];

                    const goalText =
                        selectedGoals.length > 0
                            ? selectedGoals
                                .map((goal) => goal.training_goal || goal.goal_title)
                                .filter(Boolean)
                                .join('\n')
                            : '未設定';

                    const watchedText =
                        selectedGoals.length === 0
                            ? false
                            : selectedGoals.every((goal) => goal.watched);

                    return {
                        id: `summary-${emp.entry_id}`,
                        entry_id: emp.entry_id,
                        goal_key: `summary-${emp.entry_id}`,
                        goal_title: goalText,
                        video_url: null,
                        selected: selectedGoals.length > 0,
                        watched: watchedText,
                        remark: null,
                        sort_order: 0,
                        created_at: '',
                        updated_at: '',
                        category: null,
                        group_code: null,
                        target_condition: null,
                        training_goal: null,
                        row_type: 'goal',
                        entry: emp,
                    };
                });

                setRows(allJoined);
                setLoading(false);
                return;
            }

            const { data: selectionData, error: selectionError } = await supabase
                .from('employee_training_goals')
                .select(`
        id,
        entry_id,
        goal_key,
        goal_title,
        video_url,
        selected,
        watched,
        remark,
        sort_order,
        created_at,
        updated_at,
        category,
        group_code,
        target_condition,
        training_goal,
        row_type
    `)
                .eq('entry_id', targetEntryId);

            if (selectionError) {
                console.error('employee_training_goals load error:', selectionError);
                setRows([]);
                setLoading(false);
                return;
            }
            const entry = employeeRows.find((e) => e.entry_id === targetEntryId) ?? null;

            const remarkRow = ((selectionData ?? []) as TrainingGoalSelectionRow[]).find(
                (row) => row.row_type === 'remark'
            );

            setRemarkText(remarkRow?.remark ?? '');

            const selectionMap = new Map(
                ((selectionData ?? []) as TrainingGoalSelectionRow[]).map((row) => [row.goal_key, row])
            );

            const targetSystemRole = entry?.system_role ?? '';
            const targetCatalogRole =
                targetSystemRole === 'admin' || targetSystemRole === 'manager'
                    ? 'manager'
                    : 'member';

            const roleFiltered = ((catalogData ?? []) as TrainingGoalCatalogRow[]).filter((row) => {
                if (targetCatalogRole === 'member') {
                    return row.target_role === 'member' || row.target_role === 'both' || row.target_role === null;
                }

                return row.target_role === 'manager' || row.target_role === 'both' || row.target_role === null;
            });

            const joined: JoinedRow[] = roleFiltered.map((catalog) => {
                const selected = selectionMap.get(catalog.training_key);

                return {
                    id: selected?.id ?? `virtual-${catalog.training_key}`,
                    entry_id: targetEntryId,
                    goal_key: catalog.training_key,
                    goal_title: catalog.training_title,
                    video_url: catalog.video_url,
                    selected: selected?.selected ?? false,
                    watched: selected?.watched ?? false,
                    remark: selected?.remark ?? '',
                    sort_order: catalog.sort_order,
                    created_at: selected?.created_at ?? '',
                    updated_at: selected?.updated_at ?? '',
                    category: catalog.training_type,
                    group_code: catalog.training_code,
                    target_condition: catalog.target_group,
                    training_goal: catalog.training_goal,
                    row_type: 'goal',
                    entry,
                };
            });

            setRows(joined);
            setLoading(false);
        };

        if (!['admin', 'manager', 'member'].includes(role)) {
            setLoading(false);
            return;
        }

        void load();
    }, [effectiveRole, role, selectedEntryId, debugRole, debugMemberEntryId, queryUserId]);

    const orgOptions = useMemo(() => {
        return Array.from(
            new Set(
                rows
                    .map((row) => row.entry?.orgunitname ?? '')
                    .filter(Boolean)
            )
        ).sort((a, b) => a.localeCompare(b, 'ja'));
    }, [rows]);

    const filteredRows = useMemo(() => {
        const q = searchText.trim();

        return rows.filter((row) => {
            if (
                isAllEmployeesView &&
                selectedOrgName &&
                row.entry?.orgunitname !== selectedOrgName
            ) {
                return false;
            }
            if (selectedOrgName && row.entry?.orgunitname !== selectedOrgName) {
                return false;
            }
            if (isAllEmployeesView) {
                // すべて表示では未設定も見せたいので、ここでは絞らない
            } else if (['admin', 'manager'].includes(effectiveRole)) {
                // admin個別表示は、選択されたものだけ表示
                if (!row.selected) return false;
            } else if (showOnlySelected && !row.selected) {
                return false;
            }

            if (!q) return true;

            const fullNameKanji = `${row.entry?.last_name_kanji ?? ''}${row.entry?.first_name_kanji ?? ''}`;
            const fullNameKana = `${row.entry?.last_name_kana ?? ''}${row.entry?.first_name_kana ?? ''}`;
            const goalTitle = row.goal_title ?? '';
            const remark = row.remark ?? '';
            const goalKey = row.goal_key ?? '';
            const category = row.category ?? '';
            const groupCode = row.group_code ?? '';
            const trainingGoal = row.training_goal ?? '';

            return (
                fullNameKanji.includes(q) ||
                fullNameKana.includes(q) ||
                goalTitle.includes(q) ||
                remark.includes(q) ||
                goalKey.includes(q) ||
                category.includes(q) ||
                groupCode.includes(q) ||
                trainingGoal.includes(q)
            );
        });
    }, [rows, searchText, showOnlySelected, selectedOrgName, isAllEmployeesView, effectiveRole]);

    const toggleAdminSort = (key: AdminSortKey) => {
        if (adminSortKey !== key) {
            setAdminSortKey(key);
            setAdminSortOrder('asc');
            return;
        }

        if (adminSortOrder === 'asc') {
            setAdminSortOrder('desc');
            return;
        }

        setAdminSortKey(null);
        setAdminSortOrder('none');
    };

    const adminSortMark = (key: AdminSortKey) => {
        if (adminSortKey !== key || adminSortOrder === 'none') return '⇅';
        return adminSortOrder === 'asc' ? '▲' : '▼';
    };

    const adminSortedRows = useMemo(() => {
        if (!isAllEmployeesView) return filteredRows;

        const getValue = (row: JoinedRow) => {
            if (adminSortKey === 'selected') {
                return row.selected ? 1 : 0;
            }

            if (adminSortKey === 'watched') {
                return row.watched ? 1 : 0;
            }

            return 0;
        };

        return [...filteredRows].sort((a, b) => {
            const av = getValue(a);
            const bv = getValue(b);

            let result = 0;

            if (typeof av === 'number' && typeof bv === 'number') {
                result = av - bv;
            } else {
                result = String(av).localeCompare(String(bv), 'ja');
            }

            if (!adminSortKey || adminSortOrder === 'none') {
                return 0;
            }

            return adminSortOrder === 'asc' ? result : -result;
        });
    }, [filteredRows, isAllEmployeesView, adminSortKey, adminSortOrder]);

    const groupedRows = useMemo(() => {
        const map = new Map<string, JoinedRow[]>();

        for (const row of filteredRows) {
            if (row.row_type !== 'goal') continue;

            const sectionKey = `${row.category ?? 'その他'}__${row.group_code ?? ''}`;
            const current = map.get(sectionKey) ?? [];
            current.push(row);
            map.set(sectionKey, current);
        }

        return Array.from(map.entries()).map(([key, items]) => {
            const [category, groupCode] = key.split('__');
            return {
                category,
                groupCode,
                items,
            };
        });
    }, [filteredRows]);

    const updateGoal = async (row: JoinedRow, patch: Partial<JoinedRow>) => {
        const now = new Date().toISOString();

        const payload = {
            entry_id: row.entry_id,
            goal_key: row.goal_key,
            goal_title: row.goal_title,
            video_url: row.video_url ?? null,
            selected: patch.selected ?? row.selected,
            watched: patch.watched ?? row.watched,
            remark: patch.remark ?? row.remark ?? null,
            sort_order: row.sort_order,
            category: row.category ?? null,
            group_code: row.group_code ?? null,
            target_condition: row.target_condition ?? null,
            training_goal: row.training_goal ?? null,
            row_type: 'goal' as const,
            updated_at: now,
        };

        const { data, error } = await supabase
            .from('employee_training_goals')
            .upsert(payload, { onConflict: 'entry_id,goal_key' })
            .select('id')
            .single();

        if (error) {
            console.error('employee_training_goals upsert error:', error);
            return;
        }
        const becameSelected =
            patch.selected === true && row.selected !== true;

        const becameWatched =
            patch.watched === true && row.watched !== true;

        if (becameSelected || becameWatched) {
            try {
                await fetch('/api/training-goals/notify', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        entry_id: row.entry_id,
                        notify_type: becameWatched ? 'watched' : 'selected',
                        goal_title: row.goal_title,
                        training_goal: row.training_goal,
                        remark: '',
                    }),
                });
            } catch (e) {
                console.error('training goal lineworks notify error:', e);
            }
        }

        setRows((prev) =>
            prev.map((r) =>
                r.entry_id === row.entry_id && r.goal_key === row.goal_key
                    ? {
                        ...r,
                        ...patch,
                        id: data?.id ?? r.id,
                        updated_at: now,
                    }
                    : r
            )
        );
    };

    const submitRemark = async () => {
        const entryId = rows[0]?.entry_id || selectedEntryId;

        const remark = remarkText.trim();

        if (!entryId) {
            alert('対象職員が特定できません。');
            return;
        }

        if (!remark) {
            alert('備考を入力してください。');
            return;
        }

        try {
            setRemarkSending(true);
            setRemarkMessage('');

            const res = await fetch('/api/training-goals/notify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    entry_id: entryId,
                    remark,
                }),
            });

            const json = await res.json();

            if (!res.ok || !json.ok) {
                throw new Error(json.error ?? '送信に失敗しました');
            }

            setRemarkMessage('送信しました。LINEWORKSへ通知しています。');
        } catch (e) {
            const msg = e instanceof Error ? e.message : '送信に失敗しました';
            setRemarkMessage(msg);
        } finally {
            setRemarkSending(false);
        }
    };

    if (!['admin', 'manager', 'member'].includes(effectiveRole)) {
        return <p className="p-6">このページは利用できません。</p>;
    }

    return (
        <div className="content p-6">
            <div className="flex items-center justify-between mb-4">
                <h1 className="text-2xl font-bold">職員の目標・研修確認</h1>
                <div className="mb-4 p-3 border rounded bg-yellow-50">
                    <div className="text-sm font-semibold mb-2">確認用表示切替（今だけ）</div>

                    <div className="flex flex-col md:flex-row gap-3 md:items-center">
                        <div>
                            <label className="block text-sm mb-1">表示ロール</label>
                            <select
                                className="border rounded px-3 py-2"
                                value={debugRole}
                                onChange={(e) => setDebugRole(e.target.value as 'admin' | 'member' | '')}
                            >
                                <option value="">実際の権限を使う</option>
                                <option value="admin">admin表示</option>
                                <option value="member">member表示</option>
                            </select>
                        </div>

                        {debugRole === 'member' && (
                            <div>
                                <label className="block text-sm mb-1">memberとして表示する従業員</label>
                                <select
                                    className="border rounded px-3 py-2 min-w-[280px]"
                                    value={debugMemberEntryId}
                                    onChange={(e) => {
                                        const entryId = e.target.value;
                                        setDebugMemberEntryId(entryId);

                                        if (entryId === ALL_ENTRY_ID) {
                                            router.push('?user_id=all');
                                            return;
                                        }

                                        const emp = employees.find((x) => x.entry_id === entryId);

                                        if (emp?.user_id) {
                                            router.push(`?user_id=${encodeURIComponent(emp.user_id)}`);
                                        }
                                    }}
                                >
                                    {employees.map((emp) => (
                                        <option key={emp.entry_id} value={emp.entry_id}>
                                            {(emp.last_name_kanji ?? '')} {(emp.first_name_kanji ?? '')}
                                            {emp.orgunitname ? ` / ${emp.orgunitname}` : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <div className="text-sm text-gray-600 md:mt-6">
                            現在の表示: <span className="font-semibold">{effectiveRole}</span>
                        </div>
                    </div>
                </div>
                <Link href="/portal/entry-list" className="px-3 py-2 border rounded">
                    エントリー一覧へ戻る
                </Link>
            </div>

            <div className="flex flex-col md:flex-row md:items-center gap-3 mb-4">
                {['admin', 'manager'].includes(effectiveRole) && (
                    <div className="mb-4">
                        <label className="block text-sm font-medium mb-1">従業員を選択</label>
                        <select
                            className="border rounded px-3 py-2 w-full md:max-w-md"
                            value={isAllEmployeesView ? ALL_ENTRY_ID : selectedEntryId}
                            onChange={(e) => {
                                const entryId = e.target.value;
                                setSelectedEntryId(entryId);

                                if (entryId === ALL_ENTRY_ID) {
                                    router.push('?user_id=all');
                                    return;
                                }

                                const emp = employees.find((x) => x.entry_id === entryId);

                                if (emp?.user_id) {
                                    router.push(`?user_id=${encodeURIComponent(emp.user_id)}`);
                                }
                            }}
                        >
                            <option value={ALL_ENTRY_ID}>すべて</option>
                            {employees.map((emp) => (
                                <option key={emp.entry_id} value={emp.entry_id}>
                                    {(emp.last_name_kanji ?? '')} {(emp.first_name_kanji ?? '')}
                                    {emp.orgunitname ? ` / ${emp.orgunitname}` : ''}
                                </option>
                            ))}
                        </select>
                    </div>
                )}
                <input
                    type="text"
                    placeholder="氏名・目標・備考で検索"
                    className="p-2 border rounded w-full md:max-w-md"
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                />

                {isAllEmployeesView && (
                    <select
                        className="p-2 border rounded w-full md:max-w-xs"
                        value={selectedOrgName}
                        onChange={(e) => setSelectedOrgName(e.target.value)}
                    >
                        <option value="">すべての所属</option>
                        {orgOptions.map((org) => (
                            <option key={org} value={org}>
                                {org}
                            </option>
                        ))}
                    </select>
                )}

                <label className="flex items-center gap-2 text-sm">
                    <input
                        type="checkbox"
                        checked={showOnlySelected}
                        onChange={(e) => setShowOnlySelected(e.target.checked)}
                    />
                    選択済みのみ表示
                </label>
            </div>

            {loading ? (
                <p>読み込み中...</p>
            ) : filteredRows.length === 0 ? (
                <p>登録された目標・研修情報はありません。</p>
            ) : effectiveRole === 'member' ? (
                <div className="space-y-6">
                    <div className="rounded-lg border bg-blue-50 px-4 py-3">
                        <div className="font-semibold text-blue-900">目標・研修一覧</div>
                        <div className="text-sm text-gray-700 space-y-1 leading-relaxed">
                            <p>■ 目標の設定方法</p>
                            <p>・一覧から半期の目標を選び、チェックを入れてください</p>
                            <p>・動画がある研修はそのまま視聴できます</p>
                            <p>・視聴後は「研修受講完了」にチェックを入れてください</p>
                            <p>・チェックすると勤務キャリア・コーディネートルームにLINE通知が送信されます</p>
                            <p>・該当する目標がない場合は、画面下部から追加してください</p>
                        </div>
                    </div>

                    {groupedRows.map((section) => (
                        <section key={`${section.category}-${section.groupCode}`} className="rounded-xl border bg-white shadow-sm">
                            <div className="border-b bg-gray-50 px-4 py-3">
                                <div className="text-lg font-bold text-gray-900">
                                    【{section.category}】
                                </div>
                                {section.groupCode && (
                                    <div className="text-sm text-gray-600 mt-1">
                                        区分: {section.category}{section.groupCode}
                                    </div>
                                )}
                            </div>

                            <div className="p-4 space-y-4">
                                {section.items.map((row) => (
                                    <div
                                        key={row.id}
                                        className={`rounded-lg border p-4 transition ${row.selected ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-white'
                                            }`}
                                    >
                                        <div className="flex items-start gap-3">
                                            <input
                                                type="checkbox"
                                                className="mt-1 h-4 w-4"
                                                checked={row.selected}
                                                onChange={(e) => void updateGoal(row, { selected: e.target.checked })}
                                            />

                                            <div className="flex-1">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                                                        {row.category}
                                                    </span>
                                                    {row.group_code && (
                                                        <span className="inline-flex items-center rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
                                                            {row.category}{row.group_code}
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="mt-2 text-base font-semibold text-gray-900">
                                                    {row.goal_title}
                                                </div>

                                                {row.target_condition && (
                                                    <div className="mt-2 text-sm text-gray-600">
                                                        対象: {row.target_condition}
                                                    </div>
                                                )}

                                                {row.training_goal && (
                                                    <div className="mt-2 text-sm text-gray-700 leading-6">
                                                        目標: {row.training_goal}
                                                    </div>
                                                )}

                                                <div className="mt-4 flex flex-wrap items-center gap-4">
                                                    {row.video_url && (
                                                        <a
                                                            href={row.video_url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="inline-flex items-center rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
                                                        >
                                                            動画を開く
                                                        </a>
                                                    )}

                                                    <label className="flex items-center gap-2 text-sm text-gray-700">
                                                        <input
                                                            type="checkbox"
                                                            checked={row.watched}
                                                            onChange={(e) => void updateGoal(row, { watched: e.target.checked })}
                                                        />
                                                        研修受講完了
                                                    </label>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    ))}

                    <div className="border rounded p-4 bg-white">
                        <div className="font-semibold mb-2">追加したい目標・研修</div>
                        <div className="text-sm text-gray-600 mb-3">
                            一覧にない目標や、今後受けたい研修がある場合はここに入力してください。
                        </div>

                        <textarea
                            value={remarkText}
                            onChange={(e) => setRemarkText(e.target.value)}
                            rows={4}
                            className="w-full border rounded px-3 py-2"
                            placeholder="どんな目標・研修を追加したいか入力してください"
                        />

                        <div className="mt-3 flex items-center gap-3">
                            <button
                                type="button"
                                onClick={submitRemark}
                                disabled={remarkSending}
                                className="px-4 py-2 rounded bg-blue-600 text-white disabled:bg-gray-400"
                            >
                                {remarkSending ? '送信中...' : '送信'}
                            </button>

                            {remarkMessage && (
                                <span className="text-sm text-gray-700">{remarkMessage}</span>
                            )}
                        </div>
                    </div>
                </div>
            ) : isAllEmployeesView ? (
                <div className="overflow-x-auto">
                    {/* 全員分テーブル */}
                    <table className="min-w-full border-collapse border border-gray-300 bg-white text-sm">
                        <thead className="bg-gray-100">
                            <tr>
                                <th className="border px-3 py-2 text-left">職員名</th>
                                <th className="border px-3 py-2 text-left">所属</th>
                                <th className="border px-3 py-2 text-left">目標</th>
                                <th className="border px-3 py-2 text-center">
                                    <button type="button" onClick={() => toggleAdminSort('selected')}>
                                        設定状況 {adminSortMark('selected')}
                                    </button>
                                </th>
                                <th className="border px-3 py-2 text-center">
                                    <button type="button" onClick={() => toggleAdminSort('watched')}>
                                        受講完了 {adminSortMark('watched')}
                                    </button>
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {adminSortedRows.map((row) => (
                                <tr key={`${row.entry_id}-${row.goal_key}`}>
                                    <td className="border px-3 py-2">
                                        <Link
                                            href={`/portal/entry-detail/${row.entry_id}`}
                                            className="text-blue-600 underline hover:text-blue-800"
                                        >
                                            {(row.entry?.last_name_kanji ?? '')}
                                            {(row.entry?.first_name_kanji ?? '')}
                                        </Link>
                                    </td>
                                    <td className="border px-3 py-2">
                                        {row.entry?.orgunitname ?? ''}
                                    </td>
                                    <td className="border px-3 py-2">{row.goal_title}</td>
                                    <td className="border px-3 py-2 text-center">
                                        {row.selected ? '設定済' : '未設定'}
                                    </td>
                                    <td className="border px-3 py-2 text-center">
                                        {row.selected ? (row.watched ? '完了' : '未完了') : '未設定'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="space-y-4">
                    {/* 選択した職員の目標カード */}
                    {filteredRows.map((row) => (
                        <div key={`${row.entry_id}-${row.goal_key}`} className="rounded-lg border bg-white p-4">
                            <div className="font-semibold">{row.goal_title}</div>

                            {row.training_goal && (
                                <div className="mt-2 text-sm text-gray-700">
                                    目標: {row.training_goal}
                                </div>
                            )}

                            <div className="mt-3 text-sm">
                                選択: {row.selected ? '○' : '未選択'}
                                受講完了: {row.watched ? '○' : '未完了'}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}