// app/portal/layout.tsx
'use client';

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import '@/styles/portal.css';  // portal.cssを読み込む
import Image from 'next/image';  // Image コンポーネントのインポート
import { useUserRole } from '@/context/RoleContext';
import Link from 'next/link'; // ← 必ず追加
import Footer from '@/components/Footer'; // ← 追加
import { ReactNode } from 'react';

interface UserData {
    last_name_kanji: string;
    first_name_kanji: string;
    last_name_kana: string;
    first_name_kana: string;
    photo_url: string | null;
}

interface Props {
    children: ReactNode;
}

export default function PortalLayout({ children }: Props) {
    const router = useRouter()
    const role = useUserRole();
    const [userData, setUserData] = useState<UserData | null>(null)  // 型をUserDataに指定

    useEffect(() => {
        const fetchUserData = async () => {
            const { data: { user } } = await supabase.auth.getUser()

            if (!user) {
                router.push('/login')
                return
            }

            // form_entries テーブルからユーザー情報を取得
            const { data: entryData } = await supabase
                .from('form_entries')
                .select('last_name_kanji, first_name_kanji, last_name_kana, first_name_kana, photo_url')
                .eq('auth_uid', user.id)
                .single()

            setUserData(entryData)
        }

        fetchUserData()
    }, [router])

    if (!userData) return <p>Loading...</p>
    return (
        <div className="flex portal-container min-h-screen">
            {/* 左サイドメニュー */}

            <div className="left-menu flex flex-col justify-between h-full min-h-screen">

                {/* 上部：ユーザー情報とナビゲーション */}
                <div>
                    <p className="text-sm text-gray-300 mt-1">
                        <Link href="/" className="text-blue-300 hover:underline">🏠 Homeへ戻る</Link>
                    </p>
                    <h2 className="text-xl font-semibold">
                        {userData.last_name_kanji} {userData.first_name_kanji}
                    </h2>
                    <p className="text-white font-semibold text-sm mt-1 drop-shadow-sm">ユーザー権限: {role}</p>

                    <div className="mt-4">
                        <Image
                            src={userData.photo_url}
                            width={128}
                            height={128}
                            alt="写真"
                            className="rounded-full object-cover"
                        />
                    </div>

                    {/* 📌 管理者はすべてのメニューを表示 */}
                    <ul className="mt-6 space-y-2">
                        <li><Link href="/portal/entry-list" className="text-blue-300 hover:underline">エントリー一覧</Link></li>
                        <li><Link href="/portal/shift/manage/matching" className="text-blue-300 hover:underline">マッチング管理</Link></li>
                        <li><Link href="/portal/badge" className="text-blue-300 hover:underline">職員証（バッジ）</Link></li>
                    </ul>
                </div>

                {/* 下部：ログアウト */}
                {/* 下部：ログアウトとHR */}
                <div className="pt-4">
                    {/* 白線2本に調整 */}
                    <hr className="border-white my-2" />
                    <button
                        onClick={async () => {
                            await supabase.auth.signOut();
                            router.push("/");
                        }}
                        className="text-sm text-red-500 hover:underline"
                    >
                        🚪 ログアウト
                    </button>
                    <hr className="border-white my-2" />
                </div>
            </div>


            {/* 右側の切り替えコンテンツ */}
            <div className="flex-1 p-6 flex flex-col justify-between">
                <div className="flex-1 p-6">
                    {children}
                </div>
                <Footer /> {/* ← フッターをここで表示 */}
            </div>

        </div>
    );
}
