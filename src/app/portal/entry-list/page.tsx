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
                            </tr>
                        </thead>
                        <tbody>
                            {entries.map((entry) => {
                                // 年齢を計算
                                //const birthDate = new Date(entry.birth_year, entry.birth_month - 1, entry.birth_day);
                                const age = new Date().getFullYear() - entry.birth_year - (
                                    new Date().getMonth() + 1 < entry.birth_month ||
                                        (new Date().getMonth() + 1 === entry.birth_month && new Date().getDate() < entry.birth_day)
                                        ? 1 : 0
                                );

                                // 住所（都道府県＋市区町村までを表示）
                                const shortAddress = entry.address?.split(' ').slice(0, 1).join(' ') ?? '';

                                // 資格保持の判定（仮に certifications 配列の有無で判定）
                                //const hasCert = entry.certifications && entry.certifications.length > 0;

                                return (
                                    <tr key={entry.id}>
                                        <td className="border px-2 py-1">
                                            {entry.last_name_kanji} {entry.first_name_kanji}
                                            <br />
                                            <span className="text-sm text-gray-500">
                                                （{entry.last_name_kana} {entry.first_name_kana}）
                                            </span>
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
