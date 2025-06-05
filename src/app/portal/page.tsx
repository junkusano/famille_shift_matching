'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { User as SupabaseUser } from '@supabase/auth-js'  // SupabaseのUser型をインポート
import '@/styles/portal.css'  // portal.css のインポート

export default function PortalPage() {
  const router = useRouter()
  const [role, setRole] = useState<string | null>(null)
  const [user, setUser] = useState<SupabaseUser | null>(null) // SupabaseUser 型を使用
  const [menuOpen, setMenuOpen] = useState(false)

  // ユーザー情報とロールを取得する処理
  useEffect(() => {
    const fetchUserData = async () => {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push('/login') // ユーザーがログインしていない場合、ログインページにリダイレクト
        return
      }

      setUser(user) // user の型を SupabaseUser に合わせる

      // users テーブルからロールを取得する処理
      const { data } = await supabase
        .from('users')
        .select('system_role_id, name, kana, avatar_url')  // 名前、かな、顔写真のURLも取得
        .eq('uid', user.id)
        .single()

      if (data) {
        setRole(data.system_role_id)
      } else {
        setRole('member') // デフォルト
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
      <button className="hamburger" onClick={toggleMenu}>
        ☰
      </button>

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
          {user.avatar_url && (
            <img
              src={user.avatar_url}
              alt="User Avatar"
              className="user-avatar"
            />
          )}
          <h2>{user.name}</h2>
          <p>{user.kana}</p> {/* よみがな */}
        </div>

        {/* ここにポータルの他のメインコンテンツを配置 */}
      </div>
    </div>
  )
}
