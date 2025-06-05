'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import Image from 'next/image';  // Next.jsのImageコンポーネントをインポート
import './portal.css';  // portal.cssを読み込む

// 型定義を追加
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
  const [userData, setUserData] = useState<UserData | null>(null)  // 型を指定

  useEffect(() => {
    const fetchUserData = async () => {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push('/login')
        return
      }

      // users テーブルからロールを取得する処理（supabase.rpcなどでもOK）
      const { data } = await supabase
        .from('users')
        .select('system_role_id')
        .eq('uid', user.id)
        .single()

      if (data) {
        setRole(data.system_role_id)
      } else {
        setRole('member') // デフォルト
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
          <p>{userData.last_name_kana} {userData.first_name_kana}</p>
          <div className="mt-4">
            <Image 
              src={userData.photo_url || '/default-avatar.png'} 
              alt="User Avatar" 
              width={150} 
              height={150} 
              className="user-avatar" 
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
          <h1 className="text-2xl font-bold">ファミーユポータル</h1>
          <p>ログイン中のロール：{role}</p>

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
