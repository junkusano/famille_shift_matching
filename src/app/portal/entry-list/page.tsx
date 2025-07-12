'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useUserRole } from '@/context/RoleContext';
import { getMapLinkFromZip } from '@/lib/getMapLinkFromZip';
import { getAddressFromZip } from '@/lib/getAddressFromZip';

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
    postal_code?: string;
    address: string;
    shortAddress?: string;
    googleMapUrl?: string;
    status?: string;
    status_label?: string;
    level_label?: string;
    level_sort?: number;
}

export default function EntryListPage() {
    const [entries, setEntries] = useState<EntryData[]>([]);
    const [entriesWithMap, setEntriesWithMap] = useState<EntryData[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalCount, setTotalCount] = useState(0);
    const [searchText, setSearchText] = useState('');
    const pageSize = 50;
    const role = useUserRole();

    useEffect(() => {
        const fetchData = async () => {
            if (!['admin', 'manager'].includes(role)) {
                setLoading(false);
                return;
            }

            const from = (currentPage - 1) * pageSize;
            const to = from + pageSize - 1;

            const { data, error, count } = await supabase
                .from('form_entries_with_status')
                .select('*', { count: 'exact' })
                .range(from, to);

            if (error) {
                console.error('Supabase取得エラー:', error.message);
                setEntries([]);
            } else {
                const sorted = (data || []).sort((a, b) => {
                    if (!a.status && b.status) return -1;
                    if (a.status && !b.status) return 1;
                    return 0;
                });
                setEntries(sorted);
                setTotalCount(count || 0);
            }

            setLoading(false);
        };

        fetchData();
    }, [role, currentPage]);

    useEffect(() => {
        const addMapLinks = async () => {
            const updated = await Promise.all(
                entries.map(async (entry) => {
                    const zipcode = entry.postal_code?.toString().padStart(7, '0');
                    let googleMapUrl: string | undefined = undefined;
                    let shortAddress = '―';

                    if (zipcode && zipcode.length === 7) {
                        googleMapUrl = await getMapLinkFromZip(zipcode);
                        const address = await getAddressFromZip(zipcode);
                        if (address) shortAddress = address;
                    }

                    return { ...entry, googleMapUrl, shortAddress };
                })
            );

            setEntriesWithMap(updated);
        };

        if (entries.length > 0) {
            addMapLinks();
        }
    }, [entries]);

    if (!['admin', 'manager'].includes(role)) {
        return <p className="p-6">このページは管理者およびマネジャーのみがアクセスできます。</p>;
    }

    const filteredEntries = entriesWithMap.filter((entry) => {
        const fullName = `${entry.last_name_kanji}${entry.first_name_kanji}${entry.last_name_kana}${entry.first_name_kana}`;
        return fullName.includes(searchText) || entry.address.includes(searchText);
    });

    const totalPages = Math.ceil(totalCount / pageSize);

    return (
        <div className="content">
            <h2 className="text-xl font-bold mb-4">全エントリー一覧</h2>

            <input
                type="text"
                placeholder="名前・住所で検索"
                className="mb-4 p-2 border"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
            />

            {loading ? (
                <p>読み込み中...</p>
            ) : entriesWithMap.length === 0 ? (
                <p>該当するエントリーはありません。</p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="min-w-full border-collapse border border-gray-300">
                        <thead>
                            <tr className="bg-gray-100 text-left">
                                <th className="border px-2 py-1">氏名</th>
                                <th className="border px-2 py-1">性別</th>
                                <th className="border px-2 py-1">年齢</th>
                                <th className="border px-2 py-1">住所</th>
                                <th className="border px-2 py-1">レベル</th>
                                <th className="border px-2 py-1">ステータス</th>
                                <th className="border px-2 py-1">登録日</th>
                                <th className="border px-2 py-1"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredEntries.map((entry) => {
                                const age = new Date().getFullYear() - entry.birth_year - (
                                    new Date().getMonth() + 1 < entry.birth_month ||
                                    (new Date().getMonth() + 1 === entry.birth_month && new Date().getDate() < entry.birth_day)
                                        ? 1 : 0
                                );

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
                                        <td className="border px-2 py-1">
                                            <a href={entry.googleMapUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
                                                {entry.shortAddress || '―'}
                                            </a>
                                        </td>
                                        <td className="border px-2 py-1">{entry.level_label ?? '―'}</td>
                                        <td className="border px-2 py-1">{entry.status_label ?? '―'}</td>
                                        <td className="border px-2 py-1">{new Date(entry.created_at).toLocaleDateString()}</td>
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

            <div className="flex justify-between items-center mt-4">
                <button disabled={currentPage === 1} onClick={() => setCurrentPage((p) => p - 1)} className="px-3 py-1 border">
                    ◀ 前へ
                </button>
                <span>{currentPage} / {totalPages}</span>
                <button disabled={currentPage === totalPages} onClick={() => setCurrentPage((p) => p + 1)} className="px-3 py-1 border">
                    次へ ▶
                </button>
            </div>
        </div>
    );
}
