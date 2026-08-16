import {
  NextRequest,
  NextResponse,
} from 'next/server'

import { supabaseAdmin } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type LinkStatus =
  | 'all'
  | 'linked'
  | 'candidate'
  | 'unlinked'

type BlackFilter =
  | 'all'
  | 'only'
  | 'exclude'

type TaimeeListItem = Record<string, unknown> & {
  taimee_user_id?: string | null
  period_month?: string | null
}

function getErrorMessage(
  error: unknown
): string {
  if (error instanceof Error) {
    return error.message
  }

  if (
    typeof error === 'object' &&
    error !== null
  ) {
    const value = error as {
      message?: unknown
      details?: unknown
      hint?: unknown
      code?: unknown
    }

    return [
      typeof value.message === 'string'
        ? value.message
        : null,
      typeof value.details === 'string'
        ? value.details
        : null,
      typeof value.hint === 'string'
        ? value.hint
        : null,
      typeof value.code === 'string'
        ? `code=${value.code}`
        : null,
    ]
      .filter(Boolean)
      .join(' / ') || 'unknown error'
  }

  return String(error)
}

export async function GET(
  req: NextRequest
) {
  try {
    const status =
      (req.nextUrl.searchParams.get(
        'status'
      ) || 'all') as LinkStatus

    const black =
      (req.nextUrl.searchParams.get(
        'black'
      ) || 'all') as BlackFilter

    const memo =
      (
        req.nextUrl.searchParams.get(
          'memo'
        ) || ''
      ).trim()

    const validStatuses: LinkStatus[] = [
      'all',
      'linked',
      'candidate',
      'unlinked',
    ]

    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            `不正な連携状態です: ${status}`,
        },
        { status: 400 }
      )
    }

    let query = supabaseAdmin
      .from(
        'taimee_applicants_with_entry'
      )
      .select('*')
      .order('last_fetched_at', {
        ascending: false,
        nullsFirst: false,
      })
      .order('updated_at', {
        ascending: false,
      })

    if (status !== 'all') {
      query = query.eq(
        'link_status',
        status
      )
    }

    if (black === 'only') {
      query = query.eq(
        'black_list',
        true
      )
    }

    if (black === 'exclude') {
      query = query.or(
        'black_list.is.null,black_list.eq.false'
      )
    }

    if (memo) {
      query = query.ilike(
        'memo',
        `%${memo}%`
      )
    }

    const {
      data,
      error,
    } = await query

    if (error) {
      console.error(
        '[taimee-emp/list] Supabase error',
        error
      )

      return NextResponse.json(
        {
          ok: false,
          error:
            getErrorMessage(error),
        },
        { status: 500 }
      )
    }

    // View側のperiod_monthがnullになるデータがあるため、CSV取込元テーブルの
    // 実値で補完する。taimee_user_idはmonthlyテーブルで一意のため、一覧の年月は
    // CSV取込で確定した年月と常に一致する。
    const items = (data ?? []) as TaimeeListItem[]
    const taimeeUserIds = [
      ...new Set(
        items
          .map((item) => item.taimee_user_id)
          .filter((id): id is string => typeof id === 'string' && id.length > 0)
      ),
    ]
    const periodByTaimeeUserId = new Map<string, string>()

    for (let offset = 0; offset < taimeeUserIds.length; offset += 100) {
      const {
        data: monthlyRows,
        error: monthlyError,
      } = await supabaseAdmin
        .from('taimee_employees_monthly')
        .select('taimee_user_id,period_month')
        .in('taimee_user_id', taimeeUserIds.slice(offset, offset + 100))

      if (monthlyError) {
        console.error(
          '[taimee-emp/list] monthly period lookup failed',
          monthlyError
        )
        throw monthlyError
      }

      for (const monthlyRow of monthlyRows ?? []) {
        if (
          typeof monthlyRow.taimee_user_id === 'string' &&
          typeof monthlyRow.period_month === 'string'
        ) {
          periodByTaimeeUserId.set(
            monthlyRow.taimee_user_id,
            monthlyRow.period_month
          )
        }
      }
    }

    const resolvedItems = items.map((item) => {
      const periodMonth =
        typeof item.taimee_user_id === 'string'
          ? periodByTaimeeUserId.get(item.taimee_user_id)
          : undefined

      return periodMonth
        ? { ...item, period_month: periodMonth }
        : item
    })

    return NextResponse.json(
      {
        ok: true,
        items: resolvedItems,
      },
      {
        status: 200,
        headers: {
          'Cache-Control':
            'no-store, max-age=0',
        },
      }
    )
  } catch (error: unknown) {
    const message =
      getErrorMessage(error)

    console.error(
      '[taimee-emp/list] failed',
      error
    )

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 }
    )
  }
}
