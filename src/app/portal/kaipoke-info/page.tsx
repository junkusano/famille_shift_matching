import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { v4 as uuidv4 } from 'uuid'
import toast from 'react-hot-toast'

interface KaipokeInfo {
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
  const [data, setData] = useState<KaipokeInfo[]>([])

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    const { data, error } = await supabase
      .from('cs_kaipoke_info')
      .select('*')
      .order('name', { ascending: true })

    if (error) {
      toast.error('データ取得に失敗しました')
    } else {
      setData(data || [])
    }
  }

  const handleChange = (id: string, field: keyof KaipokeInfo, value: string) => {
    setData((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    )
  }

  const handleUpdate = async (item: KaipokeInfo) => {
    const { error } = await supabase
      .from('cs_kaipoke_info')
      .update(item)
      .eq('id', item.id)

    if (error) {
      toast.error('更新に失敗しました')
    } else {
      toast.success('更新しました')
      fetchData()
    }
  }

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">カイポケ情報一覧</h1>
      <table className="w-full border">
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
          {data.map((item) => (
            <tr key={item.id}>
              <td className="border p-2">
                <input
                  value={item.name || ''}
                  onChange={(e) => handleChange(item.id, 'name', e.target.value)}
                  className="w-full border px-2 py-1"
                />
              </td>
              <td className="border p-2">
                <input
                  value={item.kaipoke_cs_id || ''}
                  onChange={(e) => handleChange(item.id, 'kaipoke_cs_id', e.target.value)}
                  className="w-full border px-2 py-1"
                />
              </td>
              <td className="border p-2">
                <input
                  value={item.service_kind || ''}
                  onChange={(e) => handleChange(item.id, 'service_kind', e.target.value)}
                  className="w-full border px-2 py-1"
                />
              </td>
              <td className="border p-2">
                <input
                  value={item.postal_code || ''}
                  onChange={(e) => handleChange(item.id, 'postal_code', e.target.value)}
                  className="w-full border px-2 py-1"
                />
              </td>
              <td className="border p-2">
                <input
                  value={item.email || ''}
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
                  value={item.gender_request || ''}
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
                  value={item.biko || ''}
                  onChange={(e) => handleChange(item.id, 'biko', e.target.value)}
                  className="w-full border px-2 py-1"
                />
              </td>
              <td className="border p-2">
                <button
                  onClick={() => handleUpdate(item)}
                  className="bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600"
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
