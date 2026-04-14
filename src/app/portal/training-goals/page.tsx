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
};

type FormEntryRow = {
    id: string;
    last_name_kanji: string | null;
    first_name_kanji: string | null;
    last_name_kana: string | null;
    first_name_kana: string | null;
};

type JoinedRow = TrainingGoalRow & {
    entry?: FormEntryRow | null;
};

export default function TrainingGoalsPage() {
    const role = useUserRole();

    const [rows, setRows] = useState<JoinedRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchText, setSearchText] = useState('');
    const [showOnlySelected, setShowOnlySelected] = useState(true);

    useEffect(() => {
        const load = async () => {
            if (!['admin', 'manager'].includes(role)) {
                setLoading(false);
                return;
            }

            setLoading(true);

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
          updated_at
        `)
                .order('updated_at', { ascending: false })
                .order('sort_order', { ascending: true });

            if (goalError) {
                console.error('employee_training_goals load error:', goalError);
                setRows([]);
                setLoading(false);
                return;
            }

            const goals = (goalData ?? []) as TrainingGoalRow[];

            const entryIds = Array.from(new Set(goals.map((g) => g.entry_id).filter(Boolean)));

            let entryMap = new Map<string, FormEntryRow>();

            if (entryIds.length > 0) {
                const { data: entryData, error: entryError } = await supabase
                    .from('form_entries')
                    .select(`
            id,
            last_name_kanji,
            first_name_kanji,
            last_name_kana,
            first_name_kana
          `)
                    .in('id', entryIds);

                if (entryError) {
                    console.error('form_entries load error:', entryError);
                } else {
                    entryMap = new Map(
                        ((entryData ?? []) as FormEntryRow[]).map((entry) => [entry.id, entry])
                    );
                }
            }

            const joined: JoinedRow[] = goals.map((goal) => ({
                ...goal,
                entry: entryMap.get(goal.entry_id) ?? null,
            }));

            setRows(joined);
            setLoading(false);
        };

        void load();
    }, [role]);

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

            return (
                fullNameKanji.includes(q) ||
                fullNameKana.includes(q) ||
                goalTitle.includes(q) ||
                remark.includes(q) ||
                goalKey.includes(q)
            );
        });
    }, [rows, searchText, showOnlySelected]);

    if (!['admin', 'manager'].includes(role)) {
        return <p className="p-6">このページは管理者およびマネジャーのみがアクセスできます。</p>;
    }

    return (
        <div className="content p-6">
            <div className="flex items-center justify-between mb-4">
                <h1 className="text-2xl font-bold">職員の目標・研修確認</h1>
                <Link href="/portal/entry-list" className="px-3 py-2 border rounded">
                    エントリー一覧へ戻る
                </Link>
            </div>

            <div className="flex flex-col md:flex-row md:items-center gap-3 mb-4">
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

                                    <td className="border px-2 py-1">
                                        {row.selected ? (
                                            <span className="text-green-600 font-medium">選択済み</span>
                                        ) : (
                                            <span className="text-gray-500">未選択</span>
                                        )}
                                    </td>

                                    <td className="border px-2 py-1">
                                        {row.video_url ? (
                                            <a
                                                href={row.video_url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-blue-600 underline break-all"
                                            >
                                                {row.video_url}
                                            </a>
                                        ) : (
                                            '―'
                                        )}
                                    </td>

                                    <td className="border px-2 py-1">
                                        {row.watched ? (
                                            <span className="text-green-600 font-medium">視聴完了</span>
                                        ) : (
                                            <span className="text-gray-600">未完了</span>
                                        )}
                                    </td>

                                    <td className="border px-2 py-1 whitespace-pre-wrap">
                                        {row.remark?.trim() ? row.remark : '―'}
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