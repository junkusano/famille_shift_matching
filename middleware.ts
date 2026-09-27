// middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'

export default async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const supabase = createMiddlewareClient({ req, res })
  const { pathname } = req.nextUrl

  await supabase.auth.getSession()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const publicPrefixes = [
    '/login',
    '/signup',
    '/signup/complete',
    '/entry',
    '/famille-voice/privacy',
    '/auth/callback',
    '/unauthorized',
    '/_next',
    '/favicon.ico',
  ]
  if (publicPrefixes.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return res
  }

  if (pathname.startsWith('/api/cron/')) return NextResponse.next()

  const apiKeyRpaPaths = [
    '/api/rpa/form-entry-attachments',
    '/api/rpa/lineworks/users/sync',
  ]
  if (apiKeyRpaPaths.includes(pathname)) return NextResponse.next()

  const publicEntryApiPaths = [
    '/api/entry/submit',
    '/api/entry/attachments',
  ]
  if (publicEntryApiPaths.includes(pathname)) return NextResponse.next()

  if (pathname.startsWith('/api/rpa/taimee/')) return NextResponse.next()

  if (pathname.startsWith('/api/')) {
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return res
  }

  if (pathname.startsWith('/portal')) {
    if (!user) {
      return NextResponse.redirect(new URL('/login', req.url))
    }

    const { data: profile, error } = await supabase
      .from('users')
      .select('user_id, system_role, service_type')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (error || !profile) {
      return NextResponse.redirect(new URL('/unauthorized', req.url))
    }

    if (profile.service_type === 'kyotaku') {
      return NextResponse.redirect(new URL('/cm-portal', req.url))
    }

    const adminOnlyPaths = [
      '/portal/entry-list',
      '/portal/entry-detail',
      '/portal/rpa_requests',
      '/portal/rpa_temp',
      '/portal/admin/monitoring-office-notice',
      '/portal/admin/website',
      '/portal/admin/health-check-results',
      '/portal/roster/daily-beta',
    ]

    const isAdminPath = adminOnlyPaths.some((path) => pathname.startsWith(path))

    if (isAdminPath) {
      if (!['admin', 'manager'].includes(profile.system_role) || profile.user_id === 'servicesuport') {
        return NextResponse.redirect(new URL('/unauthorized', req.url))
      }
    }

    return res
  }

  if (pathname.startsWith('/cm-portal')) {
    if (!user) {
      return NextResponse.redirect(new URL('/login', req.url))
    }

    const { data: profile, error } = await supabase
      .from('users')
      .select('service_type')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (error || !profile) {
      return NextResponse.redirect(new URL('/unauthorized', req.url))
    }

    if (profile.service_type === 'houmon_kaigo') {
      return NextResponse.redirect(new URL('/portal', req.url))
    }

    if (!['kyotaku', 'both'].includes(profile.service_type ?? '')) {
      return NextResponse.redirect(new URL('/unauthorized', req.url))
    }

    return res
  }

  return res
}
