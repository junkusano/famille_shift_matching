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
    created_at: string;
    auth_uid: string;
}

export default function EntryListPage() {
    const [entries, setEntries] = useState<EntryData[]>([]);
    const [loading, setLoading] = useState(true);
    const role = useUserRole();

    useEffect(() => {
        const fetchData = async () => {
            if (role !== 'admin') return;

            const { data, error } = await supabase
                .from('form_entries')
                .select('*')
                .is('auth_uid', null); // ← NULLのみ抽出

            if (error) {
                console.error("取得エラー:", error.message);
                return;
            }

            setEntries(data || []);
            setLoading(false);
        };
        fetchData();
    }, [role]);

    if (role !== 'admin') {
        return <p className="p-6">このページは管理者のみがアクセスできます。</p>;
    }

    return (
        <div className="content">
            <h2 className="text-xl font-bold mb-4">未登録ユーザーのエントリー一覧</h2>
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
                                <th className="border px-2 py-1">ふりがな</th>
                                <th className="border px-2 py-1">登録日</th>
                            </tr>
                        </thead>
                        <tbody>
                            {entries.map(entry => (
                                <tr key={entry.id}>
                                    <td className="border px-2 py-1">{entry.last_name_kanji} {entry.first_name_kanji}</td>
                                    <td className="border px-2 py-1">{entry.last_name_kana} {entry.first_name_kana}</td>
                                    <td className="border px-2 py-1">{new Date(entry.created_at).toLocaleDateString()}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
