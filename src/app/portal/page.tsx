'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { User as SupabaseUser } from '@supabase/auth-js'

export default function PortalPage() {
  const router = useRouter()
  const [role, setRole] = useState<string | null>(null)
  const [user, setUser] = useState<SupabaseUser | null>(null) // SupabaseUser 型を使用
  const [menuOpen, setMenuOpen] = useState(false)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null) // photo_url を保存するための状態
  const [name, setName] = useState<string | null>(null)  // 氏名
  const [kana, setKana] = useState<string | null>(null)  // よみかた

  useEffect(() => {
    const fetchUserData = async () => {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push('/login')
        return
      }

      setUser(user)

      // users テーブルからロール、氏名、よみかたを取得
      const { data } = await supabase
        .from('users')
        .select('system_role_id, name, kana')  // 氏名、よみかたも取得
        .eq('uid', user.id)
        .single()

      if (data) {
        setRole(data.system_role_id)
        setName(data.name)   // 氏名設定
        setKana(data.kana)   // よみかた設定
      } else {
        setRole('member') // デフォルト
      }

      // form_entries テーブルから photo_url を取得
      const { data: entryData } = await supabase
        .from('form_entries')
        .select('photo_url')
        .eq('auth_uid', user.id) // ユーザーのIDと一致するエントリを取得
        .single()

      if (entryData) {
        setPhotoUrl(entryData.photo_url) // photo_url を設定
      }
    }

    fetchUserData()
  }, [router])

  const toggleMenu = () => {
    setMenuOpen(!menuOpen)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (!user) {
    return <div>Loading...</div>
  }

  return (
    <div className="portal-container">
      {/* ハンバーガーメニュー */}
      <button className="hamburger" onClick={toggleMenu}>☰</button>

      {/* スマホ用メニュー */}
      <div className={`menu ${menuOpen ? 'open' : ''}`}>
        <div className="user-info">
          <p className="user-id">ユーザーID: {user.id}</p>
          <p className="user-name">ユーザー名: {user.email}</p>
        </div>
        <div className="menu-item button-primary" onClick={() => router.push('/dashboard')}>ダッシュボード</div>
        <div className="menu-item button-primary" onClick={() => router.push('/entries')}>エントリー確認</div>
        <div className="menu-item button-primary" onClick={() => router.push('/settings')}>設定</div>
        {role === 'admin' && <div className="menu-item button-primary" onClick={() => router.push('/admin/tools')}>管理ツール</div>}
        {role === 'manager' && <div className="menu-item button-primary" onClick={() => router.push('/shift/manage')}>シフト管理</div>}
        <div className="logout" onClick={handleLogout}>ログアウト</div>
      </div>

      {/* PC用左メニュー */}
      <div className="left-menu">
        <div className="user-info">
          <p className="user-id">ユーザーID: {user.id}</p>
          <p className="user-name">ユーザー名: {user.email}</p>
        </div>
        <div className="menu-item button-primary" onClick={() => router.push('/dashboard')}>ダッシュボード</div>
        <div className="menu-item button-primary" onClick={() => router.push('/entries')}>エントリー確認</div>
        <div className="menu-item button-primary" onClick={() => router.push('/settings')}>設定</div>
        {role === 'admin' && <div className="menu-item button-primary" onClick={() => router.push('/admin/tools')}>管理ツール</div>}
        {role === 'manager' && <div className="menu-item button-primary" onClick={() => router.push('/shift/manage')}>シフト管理</div>}
        <div className="logout" onClick={handleLogout}>ログアウト</div>
      </div>

      {/* メインコンテンツ */}
      <div className="content">
        <div className="user-profile">
          {/* 顔写真の表示 */}
          {photoUrl && (
            <img
              src={photoUrl}
              alt="User Avatar"
              className="user-avatar"
            />
          )}
          <h2>{name}</h2> {/* 氏名表示 */}
          <p>{kana}</p> {/* よみかた表示 */}
        </div>
      </div>
    </div>
  )
}
