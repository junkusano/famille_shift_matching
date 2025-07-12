'use client'

import { useEffect, useState } from 'react'

type KaipokeInfo = {
  id: string
  kaipoke_cs_id: string
  name: string
  end_at: string | null
  service_kind: string
  email: string
  biko: string
}

export default function KaipokeInfoPage() {
  const [data, setData] = useState<KaipokeInfo[] | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    fetch('/api/kaipoke-info')
      .then((res) => {
        if (!res.ok) throw new Error(`Network response was not ok: ${res.status}`)
        return res.json()
      })
      .then((json) => setData(json))
      .catch((err) => {
        console.error('Fetch error:', err)
        setError(true)
      })
      .finally(() => setIsLoading(false))
  }, [])

  if (error) return <div className="p-4 text-red-600">読み込みエラーが発生しました</div>

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold">カイポケ顧客情報一覧</h1>
      {isLoading ? (
        <div className="h-48 w-full bg-gray-100 animate-pulse" />
      ) : (
        <table className="w-full table-auto border border-collapse">
          <thead>
            <tr className="bg-gray-100 text-left">
              <th className="border p-2">事業所名</th>
              <th className="border p-2">顧客ID</th>
              <th className="border p-2">種別</th>
              <th className="border p-2">メール</th>
              <th className="border p-2">終了日</th>
              <th className="border p-2">備考</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((item) => (
              <tr key={item.id}>
                <td className="border p-2">{item.name}</td>
                <td className="border p-2">{item.kaipoke_cs_id}</td>
                <td className="border p-2">{item.service_kind}</td>
                <td className="border p-2">{item.email}</td>
                <td className="border p-2">
                  {item.end_at ? new Date(item.end_at).toLocaleDateString() : '-'}
                </td>
                <td className="border p-2">{item.biko}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
