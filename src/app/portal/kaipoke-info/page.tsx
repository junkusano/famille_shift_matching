//portal/kaipoke-info/
'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import toast from 'react-hot-toast'
import Link from 'next/link'   // ← 追加

type KaipokeInfo = {
  id: string
  name: string
  kaipoke_cs_id: string
  service_kind: string
  postal_code: string
  email: string
  gender_request: string
  biko: string
  standard_route: string
  commuting_flg: boolean
  standard_trans_ways: string
  standard_purpose: string
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

  const handleChange = (id: string, field: keyof KaipokeInfo, value: string | boolean) => {
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
        gender_request: item.gender_request,
        biko: item.biko,
        standard_route: item.standard_route,
        commuting_flg: item.commuting_flg,
        standard_trans_ways: item.standard_trans_ways,
        standard_purpose: item.standard_purpose,
      })
      .eq('id', item.id)

    if (error) {
      toast.error('保存に失敗しました')
      console.error('Save error:', error)
      window.alert('保存に失敗しました。内容を確認してください。')
    } else {
      toast.success('保存しました')
      window.alert('保存が完了しました。')
    }
  }

  return (
    <div className="p-4 overflow-x-auto">
      <div className="max-h-[600px] overflow-y-auto">
        <table className="table-auto w-full border">
          <thead className="sticky top-0 bg-white z-10 shadow">
            <tr className="bg-gray-100 text-left">
              <th className="border p-2">利用者様名</th>
              <th className="border p-2">カイポケ内部ID</th>
              <th className="border p-2">サービス種別</th>
              <th className="border p-2">郵便番号</th>
              <th className="border p-2">メール</th>
              <th className="border p-2">性別希望</th>
              <th className="border p-2">通所・通勤</th>
              <th className="border p-2">操作</th>
            </tr>
            <tr className="bg-gray-50 text-left text-sm">
              <th className="border p-1" colSpan={2}>備考</th>
              <th className="border p-1" colSpan={2}>ルート</th>
              <th className="border p-1" colSpan={2}>手段</th>
              <th className="border p-1" colSpan={2}>目的</th>
            </tr>
          </thead>
          <tbody className="border-separate border-spacing-y-4">
            {items.map((item) => (
              <>
                <tr
                  key={item.id}
                  className="bg-white shadow-md border border-gray-400 rounded-md"
                >
                  <td className="border p-2">
                    <label className="text-sm">利用者様名：</label>
                    <input
                      type="text"
                      value={item.name || ''}
                      onChange={(e) => handleChange(item.id, 'name', e.target.value)}
                      className="w-full border px-2 py-1"
                    />
                  </td>
                  <td className="border p-2">
                    <label className="text-sm">カイポケ内部ID</label>
                    <input
                      type="text"
                      value={item.kaipoke_cs_id || ''}
                      onChange={(e) => handleChange(item.id, 'kaipoke_cs_id', e.target.value)}
                      className="w-full border px-2 py-1"
                    />
                  </td>
                  <td className="border p-2">
                    <label className="text-sm">サービス種別：</label>
                    <input
                      type="text"
                      value={item.service_kind || ''}
                      onChange={(e) => handleChange(item.id, 'service_kind', e.target.value)}
                      className="w-full border px-2 py-1"
                    />
                  </td>
                  <td className="border p-2">
                    <label className="text-sm">郵便番号：</label>
                    <input
                      type="text"
                      value={item.postal_code || ''}
                      onChange={(e) => handleChange(item.id, 'postal_code', e.target.value)}
                      className="w-full border px-2 py-1"
                    />
                  </td>
                  <td className="border p-2">
                    <label className="text-sm">email:</label>
                    <input
                      type="email"
                      value={item.email || ''}
                      onChange={(e) => handleChange(item.id, 'email', e.target.value)}
                      className="w-full border px-2 py-1"
                    />
                  </td>
                  <td className="border p-2">
                    <label className="text-sm">性別希望：</label>
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
                  <td className="border p-2 text-center">
                    <label className="text-sm">通所・通学：</label>
                    <input
                      type="checkbox"
                      checked={item.commuting_flg}
                      onChange={(e) => handleChange(item.id, 'commuting_flg', e.target.checked)}
                    />
                  </td>
                  <td className="border p-2 text-center align-top" rowSpan={2}>
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={() => handleSave(item)}
                        className="bg-blue-500 text-white px-3 py-1 rounded"
                      >
                        保存
                      </button>

                      <Link
                        href={`/portal/kaipoke-info-detail/${item.id}`}
                        className="bg-green-500 text-white px-3 py-1 rounded text-center"
                      >
                        詳細
                      </Link>
                    </div>
                  </td>
                </tr>
                <tr key={item.id + '-bottom'} className="bg-gray-50">
                  <td colSpan={8} className="border p-2">
                    <div className="grid grid-cols-4 gap-4">
                      <div>
                        <label className="text-sm">備考：</label>
                        <textarea
                          value={item.biko || ''}
                          onChange={(e) => handleChange(item.id, 'biko', e.target.value)}
                          className="w-full border px-2 py-1 h-16"
                        />
                      </div>
                      <div>
                        <label className="text-sm">ルート（初期値）：</label>
                        <textarea
                          value={item.standard_route || ''}
                          onChange={(e) => handleChange(item.id, 'standard_route', e.target.value)}
                          className="w-full border px-2 py-1 h-16"
                        />
                      </div>
                      <div>
                        <label className="text-sm">手段（初期値）：</label>
                        <textarea
                          value={item.standard_trans_ways || ''}
                          onChange={(e) => handleChange(item.id, 'standard_trans_ways', e.target.value)}
                          className="w-full border px-2 py-1 h-16"
                        />
                      </div>
                      <div>
                        <label className="text-sm">目的（初期値）：</label>
                        <textarea
                          value={item.standard_purpose || ''}
                          onChange={(e) => handleChange(item.id, 'standard_purpose', e.target.value)}
                          className="w-full border px-2 py-1 h-16"
                        />
                      </div>
                    </div>
                  </td>
                </tr>
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
