'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useUserRole } from '@/context/RoleContext';
import { getMapLinkFromZip } from '@/lib/getMapLinkFromZip';
import { getAddressFromZip } from '@/lib/getAddressFromZip';

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
    postal_code?: string;
    address: string;
    shortAddress?: string;
    googleMapLinkHtml?: string;
    googleMapUrl?: string;
    certifications?: Certification[];
}

export default function EntryListPage() {
    const [entries, setEntries] = useState<EntryData[]>([]);
    const [loading, setLoading] = useState(true);
    const role = useUserRole();
    const [entriesWithMap, setEntriesWithMap] = useState<EntryData[]>([]);

    useEffect(() => {
        const fetchData = async () => {
            if (role !== 'admin') {
                setLoading(false);
                return;
            }

            const { data, error } = await supabase
                .from('form_entries')
                .select(`
                id,
                last_name_kanji,
                first_name_kanji,
                last_name_kana,
                first_name_kana,
                gender,
                created_at,
                auth_uid,
                birth_year,
                birth_month,
                birth_day,
                address,
                postal_code,
                certifications,
            `)
                .is('auth_uid', null);

            if (error) {
                console.error("❌ Supabase取得エラー:", error.message);
            } else {
                console.log("✅ Supabaseデータ取得成功:", data);

                // user_status を配列から最初の要素を取得して単一オブジェクトに変換
                /*
                const updatedData = data?.map(entry => ({
                    ...entry,
                    user_status: entry.user_status && entry.user_status.length > 0 ? entry.user_status[0] : { label: '未設定' }
                }));
                

                setEntries(updatedData || []); // 修正後のデータをセット
                */
            }

            setLoading(false);
        };

        fetchData(); // fetchData関数の呼び出し
    }, [role]); // useEffectの依存配列




    // 2. マップリンク付加用 useEffect（entries に依存）
    useEffect(() => {
        console.log("📦 entries useEffect 発火！entries.length =", entries.length);

        const addMapLinks = async () => {
            console.log("🧭 addMapLinks 実行開始");

            const updated = await Promise.all(entries.map(async (entry) => {
                const zipcode = entry.postal_code?.toString().padStart(7, '0');
                let googleMapUrl: string | undefined = undefined;
                let shortAddress = '―';

                if (zipcode && zipcode.length === 7) {
                    googleMapUrl = await getMapLinkFromZip(zipcode);
                    const address = await getAddressFromZip(zipcode);
                    if (address) shortAddress = address;
                }

                return { ...entry, googleMapUrl, shortAddress };
            }));

            setEntriesWithMap(updated);
        };

        if (entries.length > 0) {
            addMapLinks(); // ← ここで呼び出し
        } else {
            console.log("⛔ entries.length が 0 以下なのでスキップ");
        }
    }, [entries]);


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
                            {entriesWithMap.map((entry) => {
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
