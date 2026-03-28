// app/login/page.tsx
'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'
import Footer from '@/components/Footer'
import { Button } from '@/components/ui/button'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [resetLoading, setResetLoading] = useState(false)
  const [resetMsg, setResetMsg] = useState("")
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    setLoading(false)

    if (error) {
      setError(error.message)
    } else {
      router.push('/portal')
    }
  }

  const handleOAuthLogin = async (provider: 'google' | 'facebook') => {
    setError(null)
    setLoading(true)

    const origin = window.location.origin

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${origin}/signup/complete`,
      },
    })

    if (error) {
      setLoading(false)
      setError(error.message)
      return
    }

    if (data?.url) {
      window.location.assign(data.url)
      return
    }

    setLoading(false)
    setError('OAuth の開始に失敗しました（URLが取得できません）')
  }

  const handlePasswordResetReinvite = async () => {
    setResetLoading(true)
    setResetMsg("")

    try {
      const res = await fetch("/api/auth/reset-password-reinvite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      })

      const json = await res.json().catch(() => null)

      setResetMsg(
        json?.message ||
          "該当するアカウントが存在する場合、メールを送信しました。メールをご確認ください。"
      )
    } catch {
      setResetMsg(
        "該当するアカウントが存在する場合、メールを送信しました。メールをご確認ください。"
      )
    } finally {
      setResetLoading(false)
    }
  }

  return (
    <div className="p-4 max-w-md mx-auto">
      <h1 className="text-xl font-bold mb-4">ログイン</h1>

      {/* OAuth */}
      <div className="grid gap-2">
        <Button
          variant="outline"
          onClick={() => handleOAuthLogin("google")}
          className="w-full justify-start gap-2"
          disabled={loading}
        >
          <img src="/icons/google.png" alt="" className="h-5 w-5" />
          Googleでログイン（@shi-on.net アカウントのみ使用可能）
        </Button>

        <Button
          variant="outline"
          onClick={() => handleOAuthLogin("facebook")}
          className="w-full justify-start gap-2"
          disabled={loading}
        >
          <img src="/icons/facebook.png" alt="" className="h-5 w-5" />
          Facebookでログイン
        </Button>
      </div>

      <div className="my-4 text-center text-sm text-gray-500">または</div>

      {/* Email/Password */}
      <form onSubmit={handleLogin} className="space-y-4">
        <input
          type="email"
          placeholder="メールアドレス"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full border px-3 py-2 rounded"
        />

        <div className="relative">
          <input
            type={showPassword ? "text" : "password"}
            placeholder="パスワード"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full border px-3 py-2 pr-16 rounded"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 hover:text-gray-700 px-2 py-1"
          >
            {showPassword ? "非表示" : "表示"}
          </button>
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <div className="space-y-2">
          <button
            type="button"
            onClick={handlePasswordResetReinvite}
            disabled={resetLoading}
            className="w-full border border-gray-300 bg-white text-gray-700 py-2 rounded hover:bg-gray-50 transition disabled:opacity-60"
          >
            {resetLoading ? "送信中..." : "初回設定 / パスワード再設定メールを送る"}
          </button>

          <p className="text-xs text-gray-500">
            初回ログイン時、もしくはパスワード再設定時にご利用ください。
            入力したメールアドレス宛に、該当するアカウントが存在する場合のみメールを送信します。
          </p>

          {resetMsg && <p className="text-sm text-green-600">{resetMsg}</p>}
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-green-600 text-white px-4 py-2 rounded disabled:opacity-60"
        >
          {loading ? '処理中...' : 'ログイン'}
        </button>
      </form>

      <Footer />
    </div>
  )
}