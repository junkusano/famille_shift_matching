'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import '@/styles/portal.css';  // portal.cssを読み込む
import Image from 'next/image';  // Image コンポーネントのインポート

interface UserData {
    last_name_kanji: string;
    first_name_kanji: string;
    last_name_kana: string;
    first_name_kana: string;
    photo_url: string | null;
}

export default function PortalPage() {
    const router = useRouter()
    const [role, setRole] = useState<string | null>(null)
    const [userData, setUserData] = useState<UserData | null>(null)  // 型をUserDataに指定

    useEffect(() => {
        const fetchUserData = async () => {
            const { data: { user } } = await supabase.auth.getUser()

            if (!user) {
                router.push('/login')
                return
            }

            // users テーブルからロールを取得する処理
            const { data } = await supabase
                .from('users')
                .select('system_role')
                .eq('auth_user_id', user.id)
                .single()  // 単一のデータを取得

            if (data) {
                setRole(data.system_role)  // system_role のみ取得して設定
            } else {
                setRole('member') // デフォルトのロール
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
        <main className="p-6">
            <div className="flex portal-container">
                {/* サイドバー */}
                <div className="left-menu">
                    <h2 className="text-xl font-semibold">{userData.last_name_kanji} {userData.first_name_kanji}</h2>
                    <p>ユーザー権限: {role}</p>
                    <div className="mt-4">
                        <img
                            alt="User Avatar"
                            loading="lazy"
                            width="128"
                            height="128"
                            decoding="async"
                            data-nimg="1"
                            className="w-32 h-32 rounded-full object-cover"
                            src={userData.photo_url || '/default-avatar.png'}
                        />
                    </div>
                    <ul className="mt-6">
                        <li><a href="/entry/list" className="text-blue-600">エントリー一覧</a></li>
                        {role === 'admin' && <li><a href="/admin/tools" className="text-blue-600">管理ツール</a></li>}
                        {role === 'manager' && <li><a href="/shift/manage" className="text-blue-600">シフト管理</a></li>}
                    </ul>
                </div>

                {/* メインコンテンツ */}
                <div className="content">
                    {/* 「ファミーユポータル」 → 「myfamille」 に変更 */}
                    <h1 className="text-2xl font-bold flex items-center">
                        <Image
                            src="/myfamille_logo.png"
                            alt="ファミーユロゴ"
                            width={80} // ロゴのサイズ
                            //height={15} // ロゴのサイズ
                        />
                        <span className="ml-2">myfamille</span> {/* ロゴと「myfamille」テキストを並べる */}
                    </h1>
                    <p>ユーザー権限：{role}</p>

                    <div className="mt-8">
                        <h3 className="text-xl font-semibold">氏名</h3>
                        <p>{userData.last_name_kanji} {userData.first_name_kanji}</p>
                        <h3 className="text-xl font-semibold mt-4">ふりがな</h3>
                        <p>{userData.last_name_kana} {userData.first_name_kana}</p>
                    </div>
                </div>
            </div>
        </main>
    )
}
