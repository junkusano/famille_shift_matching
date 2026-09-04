// middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const supabase = createMiddlewareClient({ req, res })
  const { pathname } = req.nextUrl

  // ✅ セッション確立（cookie更新のため）
  await supabase.auth.getSession()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // ✅ public paths（ログインなしで通す）
  const publicPrefixes = [
    '/login',
    '/signup',
    '/signup/complete',
    '/entry',
    '/auth/callback',
    '/unauthorized',
    '/_next',
    '/favicon.ico',
  ]
  if (publicPrefixes.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return res
  }

  // ★ Cron/内部バッチは素通り（※必要なら署名チェック推奨）
  if (pathname.startsWith('/api/cron/')) return NextResponse.next()

  // GAS専用2経路は各Routeのshared API key検証へ委ねる。
  const apiKeyRpaPaths = [
    '/api/rpa/form-entry-attachments',
    '/api/rpa/lineworks/users/sync',
  ]
  if (apiKeyRpaPaths.includes(pathname)) return NextResponse.next()

  // 公開応募は各Routeの入力検証・server-side Supabase処理へ委ねる。
  const publicEntryApiPaths = [
    '/api/entry/submit',
    '/api/entry/attachments',
  ]
  if (publicEntryApiPaths.includes(pathname)) return NextResponse.next()

  // タイミーRPA APIは各RouteでCookie/Bearerの有効性と管理者権限を検証する。
  // 拡張機能からのログイン済み画面セッションを、ここでCookieだけで拒否しない。
  if (pathname.startsWith('/api/rpa/taimee/')) return NextResponse.next()

  // ★ それ以外の /api はログイン必須（cron以外）
  if (pathname.startsWith('/api/')) {
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return res
  }

  // ==============================
  // 🔸 /portal（訪問介護用）
  // ==============================
  if (pathname.startsWith('/portal')) {
    if (!user) {
      return NextResponse.redirect(new URL('/login', req.url))
    }

    const { data: profile, error } = await supabase
      .from('users')
      .select('user_id, system_role, service_type')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    // ✅ 外部者（usersテーブルにいない）をここで弾く
    if (error || !profile) {
      return NextResponse.redirect(new URL('/unauthorized', req.url))
    }

    // ケアマネ（kyotaku）は /cm-portal へリダイレクト
    if (profile.service_type === 'kyotaku') {
      return NextResponse.redirect(new URL('/cm-portal', req.url))
    }

    // 管理者専用パス
    const adminOnlyPaths = [
      '/portal/entry-list',
      '/portal/entry-detail',
      '/portal/rpa_requests',
      '/portal/rpa_temp',
      '/portal/admin/monitoring-office-notice',
      '/portal/admin/website',
      '/portal/admin/health-check-results',
    ]

    const isAdminPath = adminOnlyPaths.some((path) => pathname.startsWith(path))

    if (isAdminPath) {
      if (!['admin', 'manager'].includes(profile.system_role) || profile.user_id === 'servicesuport') {
        return NextResponse.redirect(new URL('/unauthorized', req.url))
      }
    }

    return res
  }

  // ==============================
  // 🔸 /cm-portal（居宅介護支援用）
  // ==============================
  if (pathname.startsWith('/cm-portal')) {
    if (!user) {
      return NextResponse.redirect(new URL('/login', req.url))
    }

    const { data: profile, error } = await supabase
      .from('users')
      .select('service_type')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    // ✅ 外部者（usersテーブルにいない）を弾く
    if (error || !profile) {
      return NextResponse.redirect(new URL('/unauthorized', req.url))
    }

    // 訪問介護ユーザー（houmon_kaigo）は /portal へリダイレクト
    if (profile.service_type === 'houmon_kaigo') {
      return NextResponse.redirect(new URL('/portal', req.url))
    }

    // 'kyotaku' または 'both' のみアクセス可
    if (!['kyotaku', 'both'].includes(profile.service_type ?? '')) {
      return NextResponse.redirect(new URL('/unauthorized', req.url))
    }

    return res
  }

  return res
}
