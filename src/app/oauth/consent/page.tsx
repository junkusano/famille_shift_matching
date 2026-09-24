'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Button } from '@/components/ui/button'

type AuthorizationDetails = {
  authorization_id?: string
  redirect_url?: string
  redirect_uri?: string
  scope?: string
  client?: {
    name?: string
  }
}

const SCOPE_LABELS: Record<string, string> = {
  openid: '本人確認',
  email: 'メールアドレスの確認',
  profile: 'プロフィール情報の確認',
  phone: '電話番号の確認',
}

export default function OAuthConsentPage() {
  const [authorizationId, setAuthorizationId] = useState<string | null>(null)
  const [details, setDetails] = useState<AuthorizationDetails | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const scopes = (details?.scope ?? '').split(' ').map((item) => item.trim()).filter(Boolean)

  useEffect(() => {
    let active = true

    const load = async () => {
      const requestedAuthorizationId = new URLSearchParams(window.location.search).get('authorization_id')
      setAuthorizationId(requestedAuthorizationId)

      if (!requestedAuthorizationId) {
        setError('認証リクエストが見つかりません。ChatGPTから接続をやり直してください。')
        return
      }

      const { data: userData, error: userError } = await supabase.auth.getUser()
      const user = userData.user

      if (userError || !user) {
        const next = window.location.pathname + window.location.search
        window.location.assign('/login?next=' + encodeURIComponent(next))
        return
      }

      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('user_id, system_role')
        .eq('auth_user_id', user.id)
        .maybeSingle()

      const role = String(profile?.system_role ?? '').trim().toLowerCase()
      if (
        profileError ||
        !profile ||
        profile.user_id === 'servicesuport' ||
        !['admin', 'manager'].includes(role)
      ) {
        setError('この連携を許可できるのは、ファミーユの管理者またはマネージャーだけです。')
        return
      }

      const { data, error: detailsError } =
        await supabase.auth.oauth.getAuthorizationDetails(requestedAuthorizationId)

      if (detailsError || !data) {
        setError(detailsError?.message || '認証内容を確認できませんでした。')
        return
      }

      const authDetails = data as unknown as AuthorizationDetails
      if (!('authorization_id' in authDetails) && authDetails.redirect_url) {
        window.location.assign(authDetails.redirect_url)
        return
      }

      if (active) setDetails(authDetails)
    }

    void load()
    return () => {
      active = false
    }
  }, [])

  const decide = async (decision: 'approve' | 'deny') => {
    if (!authorizationId || busy) return
    setBusy(true)
    setError(null)

    const result =
      decision === 'approve'
        ? await supabase.auth.oauth.approveAuthorization(authorizationId)
        : await supabase.auth.oauth.denyAuthorization(authorizationId)

    if (result.error || !result.data?.redirect_url) {
      setError(result.error?.message || '認証結果を返せませんでした。')
      setBusy(false)
      return
    }

    window.location.assign(result.data.redirect_url)
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10">
      <section className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-sm font-semibold text-blue-700">ファミーユ操作MCP</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">ChatGPTとの連携を確認</h1>

        {error ? (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {error}
          </div>
        ) : !details ? (
          <p className="mt-6 text-sm text-slate-600">認証内容を確認しています…</p>
        ) : (
          <>
            <div className="mt-6 space-y-4 text-sm text-slate-700">
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="font-semibold text-slate-900">
                  {details.client?.name || 'ChatGPT'} が接続を求めています
                </p>
                <p className="mt-2">
                  この画面で許可しても、ファミーユで許可した業務操作だけが実行できます。
                </p>
              </div>

              <div>
                <p className="font-semibold text-slate-900">共有する基本情報</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {scopes.map((scope) => (
                    <li key={scope}>{SCOPE_LABELS[scope] || scope}</li>
                  ))}
                </ul>
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
                WordPress公開、本番デプロイ、コミットなどの重要操作は、
                MCP側で別途確認が必要です。この許可だけで自動実行されることはありません。
              </div>
            </div>

            <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button variant="outline" disabled={busy} onClick={() => void decide('deny')}>
                許可しない
              </Button>
              <Button disabled={busy} onClick={() => void decide('approve')}>
                {busy ? '処理中…' : 'ChatGPTとの連携を許可'}
              </Button>
            </div>
          </>
        )}
      </section>
    </main>
  )
}
