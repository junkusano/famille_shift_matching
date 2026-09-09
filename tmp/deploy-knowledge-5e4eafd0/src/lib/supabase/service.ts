// src/lib/supabase/service.ts
// サーバーサイド専用：Service Role Key を使用した管理クライアント
// クライアントコンポーネントへは絶対に渡さないこと。

import { createClient } from '@supabase/supabase-js'
// import type { Database } from '@/types/database.types' // 型生成している場合は有効化

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Supabase環境変数が未設定です (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)')
}

// 型生成している場合：createClient<Database>(...)
export const supabaseAdmin = createClient(/*<Database>*/ supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false }, // サーバー側ではセッション保存しない
})

// 参考：API Route などでの使用例
// import { supabaseAdmin } from '@/lib/supabase/service'
// const { data, error } = await supabaseAdmin.from('taimee_employees_monthly').select('*').limit(1)
