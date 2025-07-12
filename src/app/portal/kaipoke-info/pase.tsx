'use client'

import { useEffect, useState } from 'react'

export default function KaipokeInfoPage() {
  const [data, setData] = useState<{ id: number, title?: string, description?: string, created_at: string }[] | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    fetch('/portal/kaipoke-info')
      .then(res => res.json())
      .then(json => setData(json))
      .catch(() => setError(true))
      .finally(() => setIsLoading(false))
  }, [])

  if (error) return <div>読み込みエラーが発生しました</div>

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold">カイポケ情報 一覧</h1>
      {isLoading ? (
        <div className="h-48 w-full bg-gray-100 animate-pulse" />
      ) : (
        data?.map((item) => (
          <div key={item.id} className="border rounded-md p-4 shadow-sm space-y-2">
            <div className="text-sm text-gray-500">ID: {item.id}</div>
            <div className="text-lg font-semibold">{item.title || 'タイトルなし'}</div>
            <div className="text-sm">{item.description || '説明なし'}</div>
            <div className="text-xs text-right text-gray-400">
              登録日: {new Date(item.created_at).toLocaleString()}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
