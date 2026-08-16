import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/service'

const GROUP_KEY = 'taimee_emp'
const SMS_BODY_KEY = 'sms_body'

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message) return message
  }
  return '設定の保存に失敗しました'
}

async function requireManager(req: NextRequest): Promise<void> {
  const token = req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) throw new Error('UNAUTHORIZED')

  const { data, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !data.user) throw new Error('UNAUTHORIZED')

  const { data: staff, error: staffError } = await supabaseAdmin
    .from('users')
    .select('system_role')
    .eq('auth_user_id', data.user.id)
    .maybeSingle()

  if (staffError) throw staffError
  if (!['admin', 'manager'].includes((staff?.system_role ?? '').toLowerCase())) {
    throw new Error('FORBIDDEN')
  }
}

function errorResponse(error: unknown) {
  const rawMessage = errorMessage(error)
  const status = rawMessage === 'UNAUTHORIZED' ? 401 : rawMessage === 'FORBIDDEN' ? 403 : 500
  const message = rawMessage === 'UNAUTHORIZED'
    ? 'ログインしてください'
    : rawMessage === 'FORBIDDEN'
      ? 'この操作を実行する権限がありません'
      : rawMessage

  console.error('[taimee-emp/settings] failed', error)
  return NextResponse.json({ ok: false, error: message }, { status })
}

export async function GET(req: NextRequest) {
  try {
    await requireManager(req)
    const { data, error } = await supabaseAdmin
      .from('env_variables')
      .select('value')
      .eq('group_key', GROUP_KEY)
      .eq('key_name', SMS_BODY_KEY)
      .maybeSingle()

    if (error) throw error
    return NextResponse.json({ ok: true, smsBody: data?.value ?? null })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function PUT(req: NextRequest) {
  try {
    await requireManager(req)
    const body = await req.json() as { smsBody?: unknown }
    const smsBody = typeof body.smsBody === 'string' ? body.smsBody.trim() : ''

    if (!smsBody) {
      return NextResponse.json({ ok: false, error: '本文を入力してください' }, { status: 400 })
    }
    if (smsBody.length > 5000) {
      return NextResponse.json({ ok: false, error: '本文は5,000文字以内にしてください' }, { status: 400 })
    }

    const { error } = await supabaseAdmin
      .from('env_variables')
      .upsert({
        group_key: GROUP_KEY,
        key_name: SMS_BODY_KEY,
        value: smsBody,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'group_key,key_name' })

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (error) {
    return errorResponse(error)
  }
}
