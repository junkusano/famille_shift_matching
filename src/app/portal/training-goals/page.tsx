'use client';

import { useEffect, useMemo, useState } from 'react';
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
    const [debugRole, setDebugRole] = useState<'admin' | 'member' | ''>('');
    const effectiveRole = debugRole || role;

    const [rows, setRows] = useState<JoinedRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchText, setSearchText] = useState('');
    const [showOnlySelected, setShowOnlySelected] = useState(false);
    const [employees, setEmployees] = useState<EmployeeRow[]>([]);
    const [selectedEntryId, setSelectedEntryId] = useState<string>('');
    const [debugMemberEntryId, setDebugMemberEntryId] = useState<string>('');

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

            const employeeRows = (employeeData ?? []) as EmployeeRow[];
            setEmployees(employeeRows);

            let targetEntryId = selectedEntryId;

            if (effectiveRole === 'member') {
                if (debugRole === 'member') {
                    targetEntryId = debugMemberEntryId || employeeRows[0]?.entry_id || '';
                    if (targetEntryId && targetEntryId !== debugMemberEntryId) {
                        setDebugMemberEntryId(targetEntryId);
                    }
                } else {
                    const me = employeeRows.find((e) => e.auth_uid === authUid);
                    targetEntryId = me?.entry_id ?? '';
                }
            } else if ((effectiveRole === 'admin' || effectiveRole === 'manager') && !targetEntryId) {
                targetEntryId = employeeRows[0]?.entry_id ?? '';
                if (targetEntryId) {
                    setSelectedEntryId(targetEntryId);
                }
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

            const selectionMap = new Map(
                ((selectionData ?? []) as TrainingGoalSelectionRow[]).map((row) => [row.goal_key, row])
            );

            const roleFiltered = ((catalogData ?? []) as TrainingGoalCatalogRow[]).filter((row) => {
                if (effectiveRole === 'member') {
                    return row.target_role === 'member' || row.target_role === 'both' || row.target_role === null;
                }
                if (effectiveRole === 'manager' || effectiveRole === 'admin') {
                    return row.target_role === 'manager' || row.target_role === 'both' || row.target_role === null;
                }
                return true;
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
    }, [effectiveRole, role, selectedEntryId, debugRole, debugMemberEntryId]);

    const filteredRows = useMemo(() => {
        const q = searchText.trim();

        return rows.filter((row) => {
            if (showOnlySelected && !row.selected) return false;

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
    }, [rows, searchText, showOnlySelected]);

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
                                    onChange={(e) => setDebugMemberEntryId(e.target.value)}
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
                            value={selectedEntryId}
                            onChange={(e) => setSelectedEntryId(e.target.value)}
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
                <input
                    type="text"
                    placeholder="氏名・目標・備考で検索"
                    className="p-2 border rounded w-full md:max-w-md"
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                />

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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <h2 className="text-lg font-bold mb-3">目標一覧</h2>

                        {filteredRows.map((row) => (
                            <div key={row.id} className="border rounded p-3 mb-3">
                                <label className="flex items-start gap-2">
                                    <input
                                        type="checkbox"
                                        checked={row.selected}
                                        onChange={(e) => void updateGoal(row, { selected: e.target.checked })}
                                    />
                                    <div>
                                        <div className="font-semibold">
                                            {row.category ?? ''} {row.group_code ? ` / ${row.group_code}` : ''}
                                        </div>
                                        <div>{row.goal_title}</div>
                                        {row.training_goal && (
                                            <div className="text-sm text-gray-600 mt-1">
                                                {row.training_goal}
                                            </div>
                                        )}
                                    </div>
                                </label>

                                <div className="mt-3">
                                    <div className="text-sm font-medium mb-1">動画</div>

                                    {row.video_url ? (
                                        <a
                                            href={row.video_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-blue-600 underline break-all text-sm inline-block"
                                        >
                                            動画を開く
                                        </a>
                                    ) : (
                                        <span className="text-gray-400 text-sm">未登録</span>
                                    )}
                                </div>

                                <div className="mt-3">
                                    <label className="flex items-center gap-2 text-sm">
                                        <input
                                            type="checkbox"
                                            checked={row.watched}
                                            onChange={(e) => void updateGoal(row, { watched: e.target.checked })}
                                        />
                                        研修受講完了
                                    </label>
                                </div>
                            </div>
                        ))}

                        <div className="border rounded p-3 mt-4">
                            <div className="font-semibold mb-2">備考</div>
                            <div className="text-sm text-gray-600 mb-2">
                                一覧にない目標や受けたい研修がある場合は入力してください。
                            </div>

                            {filteredRows
                                .filter((row) => row.row_type === 'remark')
                                .map((row) => (
                                    <textarea
                                        key={row.id}
                                        value={row.remark ?? ''}
                                        onChange={(e) => void updateGoal(row, { remark: e.target.value })}
                                        rows={4}
                                        className="w-full border rounded px-2 py-2"
                                        placeholder="どんな目標・研修にしたいか入力してください"
                                    />
                                ))}
                        </div>
                    </div>

                    <div>
                        <h2 className="text-lg font-bold mb-3">動画URL表示</h2>
                        <div className="border rounded p-4 text-sm text-gray-600">
                            左の目標から選んだ研修の動画URLを確認して受講します。
                        </div>
                    </div>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="min-w-full border-collapse border border-gray-300">
                        ...
                    </table>
                </div>
            )}
        </div>
    );
}