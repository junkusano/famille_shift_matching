'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

export default function PortalPage() {
  const router = useRouter()
  const [role, setRole] = useState<string | null>(null)

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
    }

    fetchUserData()
  }, [router])

  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold mb-4">ファミーユポータル</h1>
      <p>ログイン中のロール：{role}</p>

      <ul className="mt-4 list-disc pl-5 space-y-2">
        <li><a href="/entry/list">エントリー一覧</a></li>
        {role === 'admin' && <li><a href="/admin/tools">管理ツール</a></li>}
        {role === 'manager' && <li><a href="/shift/manage">シフト管理</a></li>}
      </ul>
    </main>
  )
}
