// app/api/user-doc-master/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getServiceClient() {
  const url = process.env.SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key)
}

type UserDocMasterRow = {
  id: string
  label: string
  category: string
  sort_order: number | null
}

type Option = { value: string; label: string }

/**
 * GET /api/user-doc-master?category=certificate
 * - user_doc_master から category で抽出し、sort_order → label の順で並べる
 * - セレクト用に {value, label} 配列で返す
 */
export async function GET(req: Request) {
  const supabase = getServiceClient()
  const { searchParams } = new URL(req.url)
  const categoryParam = searchParams.get('category')

  const query = supabase
    .from('user_doc_master')
    .select('id,label,category,sort_order')

  const { data, error } = categoryParam
    ? await query.eq('category', categoryParam).order('sort_order', { ascending: true }).order('label', { ascending: true })
    : await query.order('sort_order', { ascending: true }).order('label', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = (data ?? []) as UserDocMasterRow[]

  const options: Option[] = rows.map((d) => ({
    value: d.label, // id を value にしたいならここを d.id に変更
    label: d.label,
  }))

  return NextResponse.json(options)
}
