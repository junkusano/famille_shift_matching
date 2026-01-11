'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'
import Footer from '@/components/Footer'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
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
        redirectTo: `${origin}/auth/callback`,
      },
    })

    if (error) {
      setLoading(false)
      setError(error.message)
      return
    }

    // 環境によっては自動遷移しないことがあるので明示遷移
    if (data?.url) {
      window.location.assign(data.url)
      return
    }

    setLoading(false)
    setError('OAuth の開始に失敗しました（URLが取得できません）')
  }

  return (
    <div className="p-4 max-w-md mx-auto">
      <h1 className="text-xl font-bold mb-4">ログイン</h1>

      {/* OAuth */}
      <div className="space-y-2 mb-6">
        <button
          type="button"
          onClick={() => handleOAuthLogin('google')}
          disabled={loading}
          className="w-full border px-4 py-2 rounded disabled:opacity-60"
        >
          Googleでログイン
        </button>

        <button
          type="button"
          onClick={() => handleOAuthLogin('facebook')}
          disabled={loading}
          className="w-full border px-4 py-2 rounded disabled:opacity-60"
        >
          Facebookでログイン
        </button>
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
          className="w-full border px-3 py-2"
        />
        <input
          type="password"
          placeholder="パスワード"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="w-full border px-3 py-2"
        />

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="bg-green-600 text-white px-4 py-2 rounded disabled:opacity-60"
        >
          {loading ? '処理中...' : 'ログイン'}
        </button>
      </form>

      <Footer />
    </div>
  )
}
