'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { useUserRole } from '@/context/RoleContext';

type TrainingGoalRow = {
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

type JoinedRow = TrainingGoalRow & {
    entry?: EmployeeRow | null;
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

            const { data: goalData, error: goalError } = await supabase
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
                .eq('entry_id', targetEntryId)
                .order('sort_order', { ascending: true })
                .order('goal_key', { ascending: true });

            if (goalError) {
                console.error('employee_training_goals load error:', goalError);
                setRows([]);
                setLoading(false);
                return;
            }

            const entry = employeeRows.find((e) => e.entry_id === targetEntryId) ?? null;
            const joined: JoinedRow[] = ((goalData ?? []) as TrainingGoalRow[]).map((goal) => ({
                ...goal,
                entry,
            }));

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

    const updateGoal = async (id: string, patch: Partial<TrainingGoalRow>) => {
        const { error } = await supabase
            .from('employee_training_goals')
            .update({
                ...patch,
                updated_at: new Date().toISOString(),
            })
            .eq('id', id);

        if (error) {
            console.error('employee_training_goals update error:', error);
            return;
        }

        setRows((prev) =>
            prev.map((row) =>
                row.id === id
                    ? {
                        ...row,
                        ...patch,
                        updated_at: new Date().toISOString(),
                    }
                    : row
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
            ) : (
                <div className="overflow-x-auto">
                    <table className="min-w-full border-collapse border border-gray-300">
                        <thead>
                            <tr className="bg-gray-100 text-left">
                                <th className="border px-2 py-1">氏名</th>
                                <th className="border px-2 py-1">目標キー</th>
                                <th className="border px-2 py-1">目標</th>
                                <th className="border px-2 py-1">選択</th>
                                <th className="border px-2 py-1">動画URL</th>
                                <th className="border px-2 py-1">視聴状況</th>
                                <th className="border px-2 py-1">備考</th>
                                <th className="border px-2 py-1">更新日時</th>
                                <th className="border px-2 py-1">詳細</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredRows.map((row) => (
                                <tr key={row.id}>
                                    <td className="border px-2 py-1">
                                        <div className="text-sm text-gray-500">
                                            {(row.entry?.last_name_kana ?? '')} {(row.entry?.first_name_kana ?? '')}
                                        </div>
                                        <div>
                                            {(row.entry?.last_name_kanji ?? '')} {(row.entry?.first_name_kanji ?? '')}
                                        </div>
                                    </td>

                                    <td className="border px-2 py-1">{row.goal_key}</td>

                                    <td className="border px-2 py-1">{row.goal_title}</td>

                                    <td className="border px-2 py-1 text-center">
                                        <input
                                            type="checkbox"
                                            checked={row.selected}
                                            onChange={(e) => void updateGoal(row.id, { selected: e.target.checked })}
                                        />
                                    </td>

                                    <td className="border px-2 py-1">
                                        <input
                                            type="url"
                                            value={row.video_url ?? ''}
                                            onChange={(e) => void updateGoal(row.id, { video_url: e.target.value })}
                                            placeholder="https://..."
                                            className="w-full border rounded px-2 py-1"
                                        />
                                        {row.video_url && (
                                            <a
                                                href={row.video_url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-blue-600 underline break-all text-sm mt-1 inline-block"
                                            >
                                                動画を開く
                                            </a>
                                        )}
                                    </td>

                                    <td className="border px-2 py-1 text-center">
                                        <input
                                            type="checkbox"
                                            checked={row.watched}
                                            onChange={(e) => void updateGoal(row.id, { watched: e.target.checked })}
                                        />
                                    </td>

                                    <td className="border px-2 py-1">
                                        <textarea
                                            value={row.remark ?? ''}
                                            onChange={(e) => void updateGoal(row.id, { remark: e.target.value })}
                                            rows={2}
                                            className="w-full border rounded px-2 py-1"
                                            placeholder="メモがあれば入力"
                                        />
                                    </td>

                                    <td className="border px-2 py-1">
                                        {new Date(row.updated_at).toLocaleString()}
                                    </td>

                                    <td className="border px-2 py-1">
                                        <Link
                                            href={`/portal/entry-detail/${row.entry_id}`}
                                            className="px-3 py-1 bg-blue-600 text-white rounded inline-block"
                                        >
                                            詳細
                                        </Link>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}