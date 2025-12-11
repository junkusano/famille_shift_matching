// middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const supabase = createMiddlewareClient({ req, res })
  const { data: { user } } = await supabase.auth.getUser()
  const { pathname } = req.nextUrl;

  // ★ Cron/内部バッチは素通り
  if (pathname.startsWith('/api/cron/')) return NextResponse.next();

  // ==============================
  // 🔸 /portal（訪問介護用）
  // ==============================
  if (pathname.startsWith('/portal')) {
    if (!user) {
      return NextResponse.redirect(new URL('/login', req.url))
    }

    const { data: profile } = await supabase
      .from('users')
      .select('system_role, service_type')
      .eq('auth_user_id', user.id)
      .single()

    // ケアマネ（kyotaku）は /cm-portal へリダイレクト
    if (profile?.service_type === 'kyotaku') {
      return NextResponse.redirect(new URL('/cm-portal', req.url))
    }

    // 管理者専用パス
    const adminOnlyPaths = [
      '/portal/entry-list',
      '/portal/entry-detail',
      '/portal/rpa_requests',
      '/portal/rpa_temp',
    ]

    const isAdminPath = adminOnlyPaths.some((path) =>
      pathname.startsWith(path),
    )

    if (isAdminPath) {
      if (!profile || !['admin', 'manager'].includes(profile.system_role)) {
        return NextResponse.redirect(new URL('/unauthorized', req.url))
      }
    }
  }

  // ==============================
  // 🔸 /cm-portal（居宅介護支援用）
  // ==============================
  if (pathname.startsWith('/cm-portal')) {
    if (!user) {
      return NextResponse.redirect(new URL('/login', req.url))
    }

    const { data: profile } = await supabase
      .from('users')
      .select('service_type')
      .eq('auth_user_id', user.id)
      .single()

    // 訪問介護ユーザー（houmon_kaigo）は /portal へリダイレクト
    if (profile?.service_type === 'houmon_kaigo') {
      return NextResponse.redirect(new URL('/portal', req.url))
    }

    // 'kyotaku' または 'both' のみアクセス可
    if (!profile || !['kyotaku', 'both'].includes(profile.service_type ?? '')) {
      return NextResponse.redirect(new URL('/unauthorized', req.url))
    }
  }

  return NextResponse.next();
}