'use client'

import { useEffect, useState } from 'react'
import { useUserRole } from '@/context/RoleContext'

// 型定義
type KaipokeInfo = {
  id: string
  kaipoke_cs_id: string
  name: string
  end_at: string | null
  service_kind: string
  email: string
  biko: string
  gender_request: string
  postal_code: string
}

export default function KaipokeInfoPage() {
  const [data, setData] = useState<KaipokeInfo[] | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)
  const role = useUserRole()

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

  const handleChange = (id: string, field: keyof KaipokeInfo, value: string) => {
    setData((prev) =>
      prev?.map((item) =>
        item.id === id ? { ...item, [field]: value } : item
      ) ?? null
    )
  }

  const handleSave = async (item: KaipokeInfo) => {
    setSavingId(item.id)
    try {
      const res = await fetch(`/api/kaipoke-info/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kaipoke_cs_id: item.kaipoke_cs_id,
          name: item.name,
          end_at: item.end_at,
          service_kind: item.service_kind,
          email: item.email,
          biko: item.biko,
          gender_request: item.gender_request,
          postal_code: item.postal_code
        }),
      })
      if (!res.ok) throw new Error('更新に失敗しました')
      alert('保存しました')
    } catch (err) {
      console.error(err)
      alert('保存に失敗しました')
    } finally {
      setSavingId(null)
    }
  }

  if (error) return <div className="p-4 text-red-600">読み込みエラーが発生しました</div>

  if (!['admin', 'manager'].includes(role)) {
    return <div className="p-4 text-red-600">このページは管理者およびマネジャーのみがアクセスできます。</div>
  }

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
              <th className="border p-2">郵便番号</th>
              <th className="border p-2">メール</th>
              <th className="border p-2">終了日</th>
              <th className="border p-2">性別希望</th>
              <th className="border p-2">備考</th>
              <th className="border p-2">操作</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((item) => (
              <tr key={item.id}>
                <td className="border p-2">
                  <input
                    type="text"
                    value={item.name}
                    onChange={(e) => handleChange(item.id, 'name', e.target.value)}
                    className="w-full border px-2 py-1"
                  />
                </td>
                <td className="border p-2">
                  <input
                    type="text"
                    value={item.kaipoke_cs_id}
                    onChange={(e) => handleChange(item.id, 'kaipoke_cs_id', e.target.value)}
                    className="w-full border px-2 py-1"
                  />
                </td>
                <td className="border p-2">
                  <input
                    type="text"
                    value={item.service_kind}
                    onChange={(e) => handleChange(item.id, 'service_kind', e.target.value)}
                    className="w-full border px-2 py-1"
                  />
                </td>
                <td className="border p-2">
                  <input
                    type="text"
                    value={item.postal_code}
                    onChange={(e) => handleChange(item.id, 'postal_code', e.target.value)}
                    className="w-full border px-2 py-1"
                  />
                </td>
                <td className="border p-2">
                  <input
                    type="email"
                    value={item.email}
                    onChange={(e) => handleChange(item.id, 'email', e.target.value)}
                    className="w-full border px-2 py-1"
                  />
                </td>
                <td className="border p-2">
                  <input
                    type="date"
                    value={item.end_at ? item.end_at.substring(0, 10) : ''}
                    onChange={(e) => handleChange(item.id, 'end_at', e.target.value)}
                    className="w-full border px-2 py-1"
                  />
                </td>
                <td className="border p-2">
                  <select
                    value={item.gender_request}
                    onChange={(e) => handleChange(item.id, 'gender_request', e.target.value)}
                    className="w-full border px-2 py-1"
                  >
                    <option value="">未設定</option>
                    <option value="9b32a1f0-f711-4ab4-92fb-0331f0c86d42">男性希望</option>
                    <option value="42224870-c644-48a5-87e2-7df9c24bca5b">女性希望</option>
                    <option value="554d705b-85ec-4437-9352-4b026e2e904f">男女問わず</option>
                  </select>
                </td>
                <td className="border p-2">
                  <input
                    type="text"
                    value={item.biko}
                    onChange={(e) => handleChange(item.id, 'biko', e.target.value)}
                    className="w-full border px-2 py-1"
                  />
                </td>
                <td className="border p-2">
                  <button
                    onClick={() => handleSave(item)}
                    className="bg-blue-500 text-white px-3 py-1 rounded disabled:opacity-50"
                    disabled={savingId === item.id}
                  >
                    保存
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}