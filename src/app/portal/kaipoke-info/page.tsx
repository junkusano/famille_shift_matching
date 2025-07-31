'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { format } from 'date-fns'
//import { v4 as uuidv4 } from 'uuid'
import toast from 'react-hot-toast'

type KaipokeInfo = {
  id: string
  name: string
  kaipoke_cs_id: string
  service_kind: string
  postal_code: string
  email: string
  end_at: string | null
  gender_request: string
  biko: string
}

export default function KaipokeInfoPage() {
  const [items, setItems] = useState<KaipokeInfo[]>([])

  useEffect(() => {
    const fetchData = async () => {
      const { data, error } = await supabase
        .from('cs_kaipoke_info')
        .select('*')
        .order('name', { ascending: true })
      if (error) {
        console.error('Fetch error:', error)
      } else {
        setItems(data || [])
      }
    }
    fetchData()
  }, [])

  const handleChange = (id: string, field: keyof KaipokeInfo, value: string) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    )
  }

  const handleSave = async (item: KaipokeInfo) => {
    const { error } = await supabase
      .from('cs_kaipoke_info')
      .update({
        name: item.name,
        kaipoke_cs_id: item.kaipoke_cs_id,
        service_kind: item.service_kind,
        postal_code: item.postal_code,
        email: item.email,
        end_at: item.end_at ? new Date(item.end_at).toISOString() : null,
        gender_request: item.gender_request,
        biko: item.biko,
      })
      .eq('id', item.id)

    if (error) {
      toast.error('保存に失敗しました')
      console.error('Save error:', error)
    } else {
      toast.success('保存しました')
    }
  }

  return (
    <div className="p-4">
      <table className="table-auto w-full border">
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
          {items.map((item) => (
            <tr key={item.id} className="border-t">
              <td className="border p-2">
                <input
                  type="text"
                  value={item.name || ''}
                  onChange={(e) => handleChange(item.id, 'name', e.target.value)}
                  className="w-full border px-2 py-1"
                />
              </td>
              <td className="border p-2">
                <input
                  type="text"
                  value={item.kaipoke_cs_id || ''}
                  onChange={(e) => handleChange(item.id, 'kaipoke_cs_id', e.target.value)}
                  className="w-full border px-2 py-1"
                />
              </td>
              <td className="border p-2">
                <input
                  type="text"
                  value={item.service_kind || ''}
                  onChange={(e) => handleChange(item.id, 'service_kind', e.target.value)}
                  className="w-full border px-2 py-1"
                />
              </td>
              <td className="border p-2">
                <input
                  type="text"
                  value={item.postal_code || ''}
                  onChange={(e) => handleChange(item.id, 'postal_code', e.target.value)}
                  className="w-full border px-2 py-1"
                />
              </td>
              <td className="border p-2">
                <input
                  type="email"
                  value={item.email || ''}
                  onChange={(e) => handleChange(item.id, 'email', e.target.value)}
                  className="w-full border px-2 py-1"
                />
              </td>
              <td className="border p-2">
                <input
                  type="date"
                  value={item.end_at ? format(new Date(item.end_at), 'yyyy-MM-dd') : ''}
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
                  value={item.biko || ''}
                  onChange={(e) => handleChange(item.id, 'biko', e.target.value)}
                  className="w-full border px-2 py-1"
                />
              </td>
              <td className="border p-2 text-center">
                <button
                  onClick={() => handleSave(item)}
                  className="bg-blue-500 text-white px-3 py-1 rounded"
                >
                  保存
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
