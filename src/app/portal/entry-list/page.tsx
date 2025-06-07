'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useUserRole } from '@/context/RoleContext';

interface Certification {
    label: string;
    file_url?: string;
}

interface EntryData {
    id: string;
    last_name_kanji: string;
    first_name_kanji: string;
    last_name_kana: string;
    first_name_kana: string;
    gender: string;
    created_at: string;
    auth_uid: string | null;
    birth_year: number;
    birth_month: number;
    birth_day: number;
    address: string;
    certifications?: Certification[]; // ← 追加（任意）
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
                .select('id, last_name_kanji, first_name_kanji, last_name_kana, first_name_kana, gender, created_at, auth_uid, birth_year, birth_month, birth_day, address, certifications')
                .is('auth_uid', null);

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
                                <th className="border px-2 py-1">性別</th>
                                <th className="border px-2 py-1">年齢</th>
                                <th className="border px-2 py-1">住所</th>
                                <th className="border px-2 py-1">資格</th>
                                <th className="border px-2 py-1">登録日</th>
                                <th className="border px-2 py-1"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {entries.map((entry) => {
                                const age = new Date().getFullYear() - entry.birth_year - (
                                    new Date().getMonth() + 1 < entry.birth_month ||
                                        (new Date().getMonth() + 1 === entry.birth_month && new Date().getDate() < entry.birth_day)
                                        ? 1 : 0
                                );

                                // 市町村以下の住所を抽出（例：春日井市白山町）
                                const match = entry.address?.match(/(?:県|都|府|道)?(.+?[市区町村])(.+?)$/);
                                const shortAddress = match ? match[1] + match[2].split(/[０-９0-9\-−ー丁目番地]/)[0] : '―';

                                return (
                                    <tr key={entry.id}>
                                        <td className="border px-2 py-1">
                                            <span className="text-sm text-gray-500">
                                                {entry.last_name_kana} {entry.first_name_kana}
                                            </span><br />
                                            {entry.last_name_kanji} {entry.first_name_kanji}
                                        </td>
                                        <td className="border px-2 py-1">{entry.gender ?? '―'}</td>
                                        <td className="border px-2 py-1">{isNaN(age) ? '―' : `${age}歳`}</td>
                                        <td className="border px-2 py-1">{shortAddress}</td>
                                        <td className="border px-2 py-1">
                                            {entry.certifications && entry.certifications.length > 0 ? 'あり' : 'なし'}
                                        </td>
                                        <td className="border px-2 py-1">
                                            {new Date(entry.created_at).toLocaleDateString()}
                                        </td>
                                        <td className="border px-2 py-1">
                                            <a
                                                href={`/portal/entry-detail/${entry.id}`}
                                                className="text-blue-600 underline hover:text-blue-800 text-sm"
                                            >
                                                詳細
                                            </a>
                                        </td>
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
