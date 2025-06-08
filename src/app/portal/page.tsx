'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import '@/styles/portal.css';  // portal.cssを読み込む
import Image from 'next/image';  // Image コンポーネントのインポート
//import { useUserRole } from '@/context/RoleContext';
//import Link from 'next/link'; // ← 必ず追加
//import Footer from '@/components/Footer'; // ← 追加
//import { ReactNode } from 'react';

interface UserData {
    last_name_kanji: string;
    first_name_kanji: string;
    last_name_kana: string;
    first_name_kana: string;
    photo_url: string | null;
}

export default function PortalPage() {
    const router = useRouter()
    //const [role, setRole] = useState<string | null>(null)
    //const role = useUserRole();
    const [userData, setUserData] = useState<UserData | null>(null)  // 型をUserDataに指定

    const [entries, setEntries] = useState<EntryData[]>([]);
    const [entriesWithMap, setEntriesWithMap] = useState<EntryData[]>([]);

    // 1. データ取得用 useEffect（1回だけ）
    useEffect(() => {
        const fetchData = async () => {
            if (role !== 'admin') {
                setLoading(false);
                return;
            }

            const { data, error } = await supabase
                .from('form_entries')
                .select('id, last_name_kanji, first_name_kanji, last_name_kana, first_name_kana, gender, created_at, auth_uid, birth_year, birth_month, birth_day, address, certifications')
                .is('auth_uid', null);

            if (error) {
                console.error("取得エラー:", error.message);
            } else {
                setEntries(data || []);
            }

            setLoading(false);
        };

        fetchData();
    }, [role]);


    fetchUserData()
}, [router])

if (!userData) return <p>Loading...</p>

return (
    <>
        {/* メインコンテンツ */}
        <div className="content">
            {/* 「ファミーユポータル」 → 「myfamille」 に変更 */}
            <h1 className="text-2xl font-bold flex items-center">
                <Image
                    src="/myfamille_logo.png"
                    alt="ファミーユロゴ"
                    width={120} // ロゴのサイズ
                //height={15} // ロゴのサイズ
                />
            </h1>
            <div className="mt-8">
                <h3 className="text-xl font-semibold">氏名</h3>
                <p>{userData.last_name_kanji} {userData.first_name_kanji}</p>
                <h3 className="text-xl font-semibold mt-4">ふりがな</h3>
                <p>{userData.last_name_kana} {userData.first_name_kana}</p>
            </div>
        </div>
    </>
)
}
