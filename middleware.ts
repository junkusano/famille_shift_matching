// middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const supabase = createMiddlewareClient({ req, res })
  const { data: { user } } = await supabase.auth.getUser()
  const pathname = req.nextUrl.pathname

   // ★ Cron / バッチ挿入APIはミドルウェアで素通りさせる
  if (pathname.startsWith('/api/cron/')) return NextResponse.next();
  if (pathname.startsWith('/api/alert_add/')) return NextResponse.next();


  // 🔸 ログインが必要なパス（/portal 全体）
  if (pathname.startsWith('/portal')) {
    if (!user) {
      return NextResponse.redirect(new URL('/login', req.url))
    }

    // 🔸 管理者専用ページチェック
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
      const { data: profile } = await supabase
        .from('users')
        .select('system_role')
        .eq('id', user.id)
        .single()

      if (!profile || !['admin', 'manager'].includes(profile.system_role)) {
        return NextResponse.redirect(new URL('/unauthorized', req.url))
      }
    }
  }

  return res
}

// すでに config.matcher を使っている場合は、除外を反映
export const config = {
  // 例: すべてに適用しつつ、cron/alert_add/_next等を除外するパターン
  matcher: ['/((?!api/cron/|api/alert_add/|_next/|favicon.ico).*)'],
};