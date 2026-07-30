// =============================
// app/api/taimee-emp/list/route.ts
// view taimee_applicants_with_entry を返す
// =============================

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

type LinkStatus =
  | 'all'
  | 'linked'
  | 'candidate'
  | 'unlinked'

type BlackFilter =
  | 'all'
  | 'only'
  | 'exclude'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)

    const status = (
      searchParams.get('status') || 'all'
    ) as LinkStatus

    const black = (
      searchParams.get('black') || 'all'
    ) as BlackFilter

    const memo = (
      searchParams.get('memo') || ''
    ).trim()

    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL

    const serviceRoleKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Supabase environment variables are missing',
        },
        { status: 500 }
      )
    }

    const supabase = createClient(
      supabaseUrl,
      serviceRoleKey
    )

    let query = supabase
      .from('taimee_applicants_with_entry')
      .select('*')
      .order('last_fetched_at', {
        ascending: false,
        nullsFirst: false,
      })
      .order('updated_at', {
        ascending: false,
      })

    // エントリー連携状態
    if (status !== 'all') {
      query = query.eq('link_status', status)
    }

    // ブラックリスト
    if (black === 'only') {
      query = query.eq('black_list', true)
    }

    if (black === 'exclude') {
      query = query.or(
        'black_list.is.null,black_list.eq.false'
      )
    }

    // メモ検索
    if (memo) {
      query = query.ilike(
        'memo',
        `%${memo}%`
      )
    }

    const { data, error } = await query

    if (error) {
      throw error
    }

    return NextResponse.json({
      ok: true,
      items: data ?? [],
    })
  } catch (e: unknown) {
    const msg =
      e instanceof Error
        ? e.message
        : 'unknown error'

    console.error(
      '[taimee-emp/list] failed',
      e
    )

    return NextResponse.json(
      {
        ok: false,
        error: msg,
      },
      { status: 500 }
    )
  }
}