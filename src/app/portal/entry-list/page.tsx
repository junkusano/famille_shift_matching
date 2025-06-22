'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useUserRole } from '@/context/RoleContext';

interface EntryData {
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
    created_at: string;
    status?: string; // users.status を取得
}

export default function EntryListPage() {
    const [entries, setEntries] = useState<EntryData[]>([]);
    const [loading, setLoading] = useState(true);
    const role = useUserRole();

    useEffect(() => {
        const fetchEntries = async () => {
            if (role !== 'admin') {
                setLoading(false);
                return;
            }

            const { data, error } = await supabase
                .from('form_entries_with_status')  // ビューを作成済の場合
                .select('*');

            if (error) {
                console.error('取得エラー:', error.message);
            } else {
                setEntries(data || []);
            }

            setLoading(false);
        };

        fetchEntries();
    }, [role]);

    if (role !== 'admin') {
        return <p className="p-4">このページは管理者のみがアクセスできます。</p>;
    }

    return (
        <div className="content">
            <h2 className="text-xl font-bold mb-4">エントリー一覧</h2>
            {loading ? (
                <p>読み込み中...</p>
            ) : entries.length === 0 ? (
                <p>該当するエントリーはありません。</p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse border border-gray-300">
                        <thead>
                            <tr className="bg-gray-100 text-left">
                                <th className="border px-2 py-1">氏名</th>
                                <th className="border px-2 py-1">性別</th>
                                <th className="border px-2 py-1">年齢</th>
                                <th className="border px-2 py-1">住所</th>
                                <th className="border px-2 py-1">ステータス</th>
                                <th className="border px-2 py-1">登録日</th>
                            </tr>
                        </thead>
                        <tbody>
                            {entries.map(entry => {
                                const age = new Date().getFullYear() - entry.birth_year - (
                                    new Date().getMonth() + 1 < entry.birth_month ||
                                        (new Date().getMonth() + 1 === entry.birth_month && new Date().getDate() < entry.birth_day)
                                        ? 1 : 0
                                );

                                return (
                                    <tr key={entry.id}>
                                        <td className="border px-2 py-1">
                                            {entry.last_name_kanji} {entry.first_name_kanji}<br />
                                            <span className="text-xs text-gray-500">
                                                {entry.last_name_kana} {entry.first_name_kana}
                                            </span>
                                        </td>
                                        <td className="border px-2 py-1">{entry.gender ?? '―'}</td>
                                        <td className="border px-2 py-1">{isNaN(age) ? '―' : `${age}歳`}</td>
                                        <td className="border px-2 py-1">{entry.address ?? '―'}</td>
                                        <td className="border px-2 py-1">{entry.status ?? '―'}</td>
                                        <td className="border px-2 py-1">{new Date(entry.created_at).toLocaleDateString()}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
