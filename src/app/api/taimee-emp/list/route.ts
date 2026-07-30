import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type UpdateItem = {
  key: string
  black_list?: boolean
  send_disabled?: boolean
  memo?: string
}

type RequestBody = {
  updates?: UpdateItem[]
}

function getErrorMessage(error: unknown): string {
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

    const parts = [
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
    ].filter(Boolean)

    if (parts.length > 0) {
      return parts.join(' / ')
    }
  }

  return String(error)
}

export async function POST(req: Request) {
  try {
    const body =
      (await req.json()) as RequestBody

    const updates = body.updates

    if (!Array.isArray(updates)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'updates must be an array',
        },
        { status: 400 }
      )
    }

    if (updates.length === 0) {
      return NextResponse.json({
        ok: true,
        updated: 0,
      })
    }

    let updated = 0

    for (const item of updates) {
      const applicantId =
        typeof item.key === 'string'
          ? item.key.trim()
          : ''

      if (!applicantId) {
        throw new Error(
          '応募者IDが指定されていません'
        )
      }

      const updateData: {
        black_list?: boolean
        send_disabled?: boolean
        memo?: string
      } = {}

      if (
        typeof item.black_list ===
        'boolean'
      ) {
        updateData.black_list =
          item.black_list
      }

      if (
        typeof item.send_disabled ===
        'boolean'
      ) {
        updateData.send_disabled =
          item.send_disabled
      }

      if (
        typeof item.memo === 'string'
      ) {
        updateData.memo = item.memo
      }

      if (
        Object.keys(updateData).length ===
        0
      ) {
        continue
      }

      const { data, error } =
        await supabaseAdmin
          .from('taimee_applicants')
          .update(updateData)
          .eq('id', applicantId)
          .select('id')
          .maybeSingle()

      if (error) {
        console.error(
          '[taimee-emp/save] update failed',
          {
            applicantId,
            updateData,
            error,
          }
        )

        throw error
      }

      if (!data) {
        throw new Error(
          `対象のタイミー応募者が見つかりません: ${applicantId}`
        )
      }

      updated += 1
    }

    return NextResponse.json({
      ok: true,
      updated,
    })
  } catch (error: unknown) {
    const message =
      getErrorMessage(error)

    console.error(
      '[taimee-emp/save] failed',
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