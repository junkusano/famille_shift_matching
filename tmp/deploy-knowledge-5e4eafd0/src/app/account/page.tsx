'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type Identity = {
  id: string
  provider: string
  created_at?: string
}

export default function AccountPage() {
  const [identities, setIdentities] = useState<Identity[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const refresh = async () => {
    setError(null)
    const { data, error } = await supabase.auth.getUserIdentities()
    if (error) {
      setError(error.message)
      return
    }
    setIdentities((data?.identities ?? []) )
  }

  useEffect(() => {
    refresh()
  }, [])

  const link = async (provider: 'google' | 'facebook') => {
    setError(null)
    setLoading(true)
    const { error } = await supabase.auth.linkIdentity({ provider })
    setLoading(false)
    if (error) setError(error.message)
    // 成功時はリダイレクト→戻ってきたら refresh される想定（必要なら callback 側で refresh）
  }

  return (
    <div className="p-4 max-w-md mx-auto space-y-4">
      <h1 className="text-xl font-bold">アカウント連携</h1>

      <div className="space-y-2">
        <button
          className="w-full border px-4 py-2 rounded disabled:opacity-60"
          onClick={() => link('google')}
          disabled={loading}
        >
          Google を連携
        </button>
        <button
          className="w-full border px-4 py-2 rounded disabled:opacity-60"
          onClick={() => link('facebook')}
          disabled={loading}
        >
          Facebook を連携
        </button>
      </div>

      <div className="border rounded p-3">
        <div className="font-semibold mb-2">連携済み</div>
        {identities.length === 0 ? (
          <div className="text-sm text-gray-500">（なし）</div>
        ) : (
          <ul className="text-sm list-disc pl-5">
            {identities.map((i) => (
              <li key={i.id}>{i.provider}</li>
            ))}
          </ul>
        )}
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}
    </div>
  )
}
