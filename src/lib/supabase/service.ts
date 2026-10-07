// src/lib/supabase/service.ts
// サーバーサイド専用：Service Role Key を使用した管理クライアント
// クライアントコンポーネントへは絶対に渡さないこと。

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
// import type { Database } from '@/types/database.types' // 型生成している場合は有効化

let client: SupabaseClient | null = null

function getSupabaseAdmin(): SupabaseClient {
  if (client) return client

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase環境変数が未設定です (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)')
  }

  // 型生成している場合：createClient<Database>(...)
  client = createClient(/*<Database>*/ supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false }, // サーバー側ではセッション保存しない
  })
  return client
}

// Import時ではなく、APIが実際に呼ばれた時だけ環境変数を検査・初期化する。
// これにより、ビルド時のページデータ収集でSupabase接続を要求しない。
export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_target, property) {
    const value = Reflect.get(getSupabaseAdmin(), property, getSupabaseAdmin())
    return typeof value === 'function' ? value.bind(getSupabaseAdmin()) : value
  },
})

// 参考：API Route などでの使用例
// import { supabaseAdmin } from '@/lib/supabase/service'
// const { data, error } = await supabaseAdmin.from('taimee_employees_monthly').select('*').limit(1)
