// /src/app/api/users/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/service'

type StaffRow = {
  user_id: string
  last_name_kanji: string | null
  first_name_kanji: string | null
  certifications: unknown // 形式は環境依存なので unknown として受ける
}

export async function GET() {
  console.info('[users][GET] start')
  const { data, error } = await supabaseAdmin
    .from('user_entry_united_view_single')
    .select('user_id,last_name_kanji,first_name_kanji,certifications')

  if (error) {
    console.error('[users][GET] error', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = (Array.isArray(data) ? data : []).map((r: StaffRow) => ({
    user_id: r.user_id,
    display_name: `${r.last_name_kanji ?? ''}${r.first_name_kanji ?? ''}`.trim() || r.user_id,
    certifications: r.certifications,
  }))

  console.info('[users][GET] count=', rows.length)
  return NextResponse.json(rows, { status: 200 })
}
