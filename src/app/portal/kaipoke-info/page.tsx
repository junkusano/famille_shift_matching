//portal/kaipoke-info
"use client"

import { useEffect, useMemo, useRef, useState, Fragment } from "react"
import { supabase } from "@/lib/supabaseClient"
import toast from "react-hot-toast"
import Link from "next/link"

/** -----------------------------
 * 型定義
 * ----------------------------- */
type KaipokeInfo = {
  id: string
  name: string
  kaipoke_cs_id: string
  service_kind: string
  postal_code: string
  email: string
  care_consultant?: string | null
  gender_request: string
  biko: string
  standard_route: string
  commuting_flg: boolean
  standard_trans_ways: string
  standard_purpose: string
  time_adjustability_id?: string | null
  is_active: boolean
}

type TimeAdjustRow = { id: string; label: string }

type FaxOption = { id: string; office_name: string }

type Filters = {
  id: string
  name: string
  kaipoke_cs_id: string
  service_kind: string
  postal_code: string
  email: string
  gender_request: string
  time_adjustability_id: string
  commuting_flg: "all" | "true" | "false"
}

const defaultFilters: Filters = {
  id: "",
  name: "",
  kaipoke_cs_id: "",
  service_kind: "",
  postal_code: "",
  email: "",
  gender_request: "",
  time_adjustability_id: "",
  commuting_flg: "all",
}

const PAGE_SIZE = 50

export default function KaipokeInfoPage() {
  const [items, setItems] = useState<KaipokeInfo[]>([])
  const [timeAdjustOptions, setTimeAdjustOptions] = useState<TimeAdjustRow[]>([])
  const [faxOptions, setFaxOptions] = useState<FaxOption[]>([])
  const [filters, setFilters] = useState<Filters>(defaultFilters)
  const [page, setPage] = useState(1)
  const listTopRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const fetchData = async () => {
      const { data, error } = await supabase
        .from("cs_kaipoke_info")
        .select("*")
        .order("name", { ascending: true })
      if (error) {
        console.error("Fetch error:", error)
      } else {
        setItems((data || []) as KaipokeInfo[])
      }
    }

    const loadTimeAdjust = async () => {
      const { data, error } = await supabase
        .from("cs_kaipoke_time_adjustability")
        .select("id,label")
        .eq("is_active", true)
        .order("sort_order")
      if (!error && data) setTimeAdjustOptions(data as TimeAdjustRow[])
    }

    const loadFaxOptions = async () => {
      const { data, error } = await supabase
        .from("fax")
        .select("id, office_name")
        .order("office_name")
      if (!error && data) setFaxOptions(data as FaxOption[])
    }

    fetchData()
    loadTimeAdjust()
    loadFaxOptions()
  }, [])

  const handleChange = (
    id: string,
    field: keyof KaipokeInfo,
    value: string | boolean | null
  ) => {
    setItems(prev =>
      prev.map(item =>
        item.id === id
          ? { ...item, [field]: value as KaipokeInfo[typeof field] }
          : item
      )
    )
  }

  const saveIsActive = async (id: string, next: boolean) => {
    // 楽観的反映：先にUIを更新
    setItems(prev => prev.map(i => i.id === id ? { ...i, is_active: next } : i))

    const { error } = await supabase
      .from("cs_kaipoke_info")
      .update({ is_active: next })
      .eq("id", id)

    if (error) {
      // 失敗したら元に戻す
      setItems(prev => prev.map(i => i.id === id ? { ...i, is_active: !next } : i))
      toast.error("有効状態の保存に失敗しました")
      console.error("saveIsActive error:", error)
    } else {
      toast.success(next ? "有効化しました" : "無効化しました")
    }
  }

  const handleSave = async (item: KaipokeInfo) => {
    const { error } = await supabase
      .from("cs_kaipoke_info")
      .update({
        name: item.name,
        kaipoke_cs_id: item.kaipoke_cs_id,
        service_kind: item.service_kind,
        postal_code: item.postal_code,
        care_consultant: item.care_consultant || null,
        gender_request: item.gender_request,
        biko: item.biko,
        standard_route: item.standard_route,
        commuting_flg: item.commuting_flg,
        standard_trans_ways: item.standard_trans_ways,
        standard_purpose: item.standard_purpose,
        time_adjustability_id: item.time_adjustability_id || null,
        is_active: item.is_active,
      })
      .eq("id", item.id) // ★ ID基準で更新

    if (error) {
      toast.error("保存に失敗しました")
      console.error("Save error:", error)
      window.alert("保存に失敗しました。内容を確認してください。")
    } else {
      toast.success("保存しました")
      window.alert("保存が完了しました。")
    }
  }

  /** -----------------------------
   * フィルター適用
   * ----------------------------- */
  const filteredItems = useMemo(() => {
    const norm = (v?: string | null) => (v ?? "").toLowerCase()

    const arr = items.filter(item => {
      if (filters.id && !norm(item.id).includes(norm(filters.id))) return false
      if (filters.name && !norm(item.name).includes(norm(filters.name))) return false
      if (
        filters.kaipoke_cs_id &&
        !norm(item.kaipoke_cs_id).includes(norm(filters.kaipoke_cs_id))
      )
        return false
      if (
        filters.service_kind &&
        !norm(item.service_kind).includes(norm(filters.service_kind))
      )
        return false
      if (
        filters.postal_code &&
        !norm(item.postal_code).includes(norm(filters.postal_code))
      )
        return false
      if (filters.email && !norm(item.email).includes(norm(filters.email)))
        return false
      if (
        filters.gender_request &&
        (item.gender_request ?? "") !== filters.gender_request
      )
        return false
      if (
        filters.time_adjustability_id &&
        (item.time_adjustability_id ?? "") !== filters.time_adjustability_id
      )
        return false
      if (filters.commuting_flg !== "all") {
        const want = filters.commuting_flg === "true"
        if (Boolean(item.commuting_flg) !== want) return false
      }
      return true
    })

    // ★ 有効(true)を上、無効(false)を下に寄せる
    return arr.sort((a, b) => Number(b.is_active) - Number(a.is_active) || norm(a.name).localeCompare(norm(b.name)))
  }, [items, filters])

  // フィルター変更時は1ページ目へ
  useEffect(() => {
    setPage(1)
  }, [filters])

  // ページ境界を自動補正
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE))
  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [totalPages, page])

  const startIndex = (page - 1) * PAGE_SIZE
  const endIndex = Math.min(startIndex + PAGE_SIZE, filteredItems.length)
  const pageItems = useMemo(
    () => filteredItems.slice(startIndex, endIndex),
    [filteredItems, startIndex, endIndex]
  )

  const onReset = () => setFilters(defaultFilters)

  const scrollToTop = () => {
    setTimeout(() => {
      listTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    }, 0)
  }

  const Pager = () => (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <button
        onClick={() => { setPage(1); scrollToTop() }}
        disabled={page === 1}
        className="px-2 py-1 border rounded disabled:opacity-50"
      >最初</button>
      <button
        onClick={() => { setPage(p => Math.max(1, p - 1)); scrollToTop() }}
        disabled={page === 1}
        className="px-2 py-1 border rounded disabled:opacity-50"
      >前へ</button>
      <span className="px-2">{page} / {totalPages}</span>
      <button
        onClick={() => { setPage(p => Math.min(totalPages, p + 1)); scrollToTop() }}
        disabled={page === totalPages}
        className="px-2 py-1 border rounded disabled:opacity-50"
      >次へ</button>
      <button
        onClick={() => { setPage(totalPages); scrollToTop() }}
        disabled={page === totalPages}
        className="px-2 py-1 border rounded disabled:opacity-50"
      >最後</button>
      <div className="ml-auto text-gray-600">
        表示: {filteredItems.length ? startIndex + 1 : 0}-{endIndex} / {filteredItems.length}
      </div>
    </div>
  )

  return (
    <div className="p-4 overflow-x-auto">
      {/* === フィルターバー === */}
      <div className="mb-3 sticky top-0 z-20 bg-white/90 backdrop-blur border rounded-xl p-3 shadow-sm">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
          <input
            placeholder="IDで絞り込み"
            value={filters.id}
            onChange={e => setFilters({ ...filters, id: e.target.value })}
            className="border px-2 py-1 rounded"
          />
          <input
            placeholder="利用者様名"
            value={filters.name}
            onChange={e => setFilters({ ...filters, name: e.target.value })}
            className="border px-2 py-1 rounded"
          />
          <input
            placeholder="カイポケ内部ID"
            value={filters.kaipoke_cs_id}
            onChange={e => setFilters({ ...filters, kaipoke_cs_id: e.target.value })}
            className="border px-2 py-1 rounded"
          />
          <input
            placeholder="サービス種別"
            value={filters.service_kind}
            onChange={e => setFilters({ ...filters, service_kind: e.target.value })}
            className="border px-2 py-1 rounded"
          />
          <input
            placeholder="郵便番号"
            value={filters.postal_code}
            onChange={e => setFilters({ ...filters, postal_code: e.target.value })}
            className="border px-2 py-1 rounded"
          />
          <input
            placeholder="メール"
            value={filters.email}
            onChange={e => setFilters({ ...filters, email: e.target.value })}
            className="border px-2 py-1 rounded"
          />
          <select
            value={filters.gender_request}
            onChange={e => setFilters({ ...filters, gender_request: e.target.value })}
            className="border px-2 py-1 rounded"
          >
            <option value="">性別希望（すべて）</option>
            <option value="9b32a1f0-f711-4ab4-92fb-0331f0c86d42">男性希望</option>
            <option value="42224870-c644-48a5-87e2-7df9c24bca5b">女性希望</option>
            <option value="554d705b-85ec-4437-9352-4b026e2e904f">男女問わず</option>
          </select>
          <select
            value={filters.time_adjustability_id}
            onChange={e =>
              setFilters({ ...filters, time_adjustability_id: e.target.value })
            }
            className="border px-2 py-1 rounded"
          >
            <option value="">時間変更可否（すべて）</option>
            {timeAdjustOptions.map(opt => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
          <select
            value={filters.commuting_flg}
            onChange={e =>
              setFilters({ ...filters, commuting_flg: e.target.value as Filters["commuting_flg"] })
            }
            className="border px-2 py-1 rounded"
          >
            <option value="all">通所・通学（すべて）</option>
            <option value="true">あり</option>
            <option value="false">なし</option>
          </select>
        </div>
        <div className="mt-2 flex flex-col gap-2">
          <div className="flex gap-2">
            <button
              onClick={onReset}
              className="px-3 py-1 rounded border bg-gray-50 hover:bg-gray-100"
            >
              リセット
            </button>
            <button
              onClick={scrollToTop}
              className="px-3 py-1 rounded border bg-blue-50 hover:bg-blue-100"
            >
              先頭へスクロール
            </button>
          </div>
          <Pager />
        </div>
      </div>

      {/* === 一覧 === */}
      <div ref={listTopRef} className="max-h-[600px] overflow-y-auto">
        <table className="table-auto w-full border">
          {/* 列幅 */}
          <colgroup>
            <col className="w-[14rem] md:w-[18rem]" />
            <col className="w-[10rem] md:w-[12rem]" />
            <col className="w-[10rem] md:w-[12rem]" />
            <col className="w-[7rem] md:w-[8rem]" />
            <col className="w-[14rem] md:w-[16rem]" />
            <col className="w-[9rem]" />
            <col className="w-[12rem]" />
            <col className="w-[8rem]" />
            <col className="w-[7.5rem] md:w-[8.5rem]" />
          </colgroup>

          <thead className="sticky top-0 bg-white z-10 shadow">
            <tr className="bg-gray-100 text-left">
              <th className="border p-2">利用者様名</th>
              <th className="border p-2">カイポケ内部ID</th>
              <th className="border p-2">サービス種別</th>
              <th className="border p-2">郵便番号</th>
              <th className="border p-2">ケアマネ/相談支援</th>
              <th className="border p-2">性別希望</th>
              <th className="border p-2">時間変更可否</th>
              <th className="border p-2">通所・通学</th>
              <th className="border p-2">操作</th>
            </tr>
            <tr className="bg-gray-50 text-left text-sm">
              <th className="border p-1" colSpan={2}>備考</th>
              <th className="border p-1" colSpan={2}>ルート</th>
              <th className="border p-1" colSpan={2}>手段</th>
              <th className="border p-1" colSpan={2}>目的</th>
              <th className="border p-1">&nbsp;</th>
            </tr>
          </thead>

          <tbody className="border-separate border-spacing-y-4">
            {pageItems.map(item => (
              <Fragment key={item.id}>
                <tr
                  id={`row-${item.id}`}
                  className={
                    "bg-white shadow-md border border-gray-400 rounded-md align-top " +
                    (!item.is_active ? "opacity-60 grayscale" : "")
                  }
                >
                  <td className="border p-2">
                    <div className="text-[11px] text-gray-500 mb-1">ID: {item.id}</div>
                    <label className="text-sm">利用者様名：</label>
                    <input
                      type="text"
                      value={item.name || ""}
                      onChange={e => handleChange(item.id, "name", e.target.value)}
                      className="w-full border px-2 py-1"
                    />
                  </td>
                  <td className="border p-2">
                    <label className="text-sm">カイポケ内部ID：</label>
                    <input
                      type="text"
                      value={item.kaipoke_cs_id || ""}
                      onChange={e => handleChange(item.id, "kaipoke_cs_id", e.target.value)}
                      className="w-full border px-2 py-1"
                    />
                  </td>
                  <td className="border p-2">
                    <label className="text-sm">サービス種別：</label>
                    <input
                      type="text"
                      value={item.service_kind || ""}
                      onChange={e => handleChange(item.id, "service_kind", e.target.value)}
                      className="w-full border px-2 py-1"
                    />
                  </td>
                  <td className="border p-2">
                    <label className="text-sm">郵便番号：</label>
                    <input
                      type="text"
                      value={item.postal_code || ""}
                      onChange={e => handleChange(item.id, "postal_code", e.target.value)}
                      className="w-full border px-2 py-1"
                    />
                  </td>
                  <td className="border p-2">
                    <label className="text-sm">ケアマネ（相談支援）：</label>
                    <select
                      value={item.care_consultant || ""}
                      onChange={e => handleChange(item.id, "care_consultant", e.target.value || null)}
                      className="w-full border px-2 py-1"
                    >
                      <option value="">（未選択）</option>
                      {faxOptions.map(opt => (
                        <option key={opt.id} value={opt.id}>
                          {opt.office_name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="border p-2">
                    <label className="text-sm">性別希望：</label>
                    <select
                      value={item.gender_request || ""}
                      onChange={e => handleChange(item.id, "gender_request", e.target.value)}
                      className="w-full border px-2 py-1"
                    >
                      <option value="">未設定</option>
                      <option value="9b32a1f0-f711-4ab4-92fb-0331f0c86d42">男性希望</option>
                      <option value="42224870-c644-48a5-87e2-7df9c24bca5b">女性希望</option>
                      <option value="554d705b-85ec-4437-9352-4b026e2e904f">男女問わず</option>
                    </select>
                  </td>

                  {/* 時間変更可否（マスタ） */}
                  <td className="border p-2">
                    <label className="text-sm">時間変更可否：</label>
                    <select
                      value={item.time_adjustability_id || ""}
                      onChange={e => handleChange(item.id, "time_adjustability_id", e.target.value || null)}
                      className="w-full border px-2 py-1"
                    >
                      <option value="">（選択）</option>
                      {timeAdjustOptions.map(opt => (
                        <option key={opt.id} value={opt.id}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </td>

                  <td className="border p-2 text-center">
                    <label className="text-sm">通所・通学：</label>
                    <input
                      type="checkbox"
                      checked={!!item.commuting_flg}
                      onChange={e => handleChange(item.id, "commuting_flg", e.target.checked)}
                    />
                  </td>

                  {/* 操作列 */}
                  <td className="border p-2 text-center align-top" rowSpan={2}>
                    <div className="flex flex-col items-stretch gap-2">
                      <button
                        onClick={() => handleSave(item)}
                        className="bg-blue-600 text-white px-3 py-1 rounded"
                      >
                        保存
                      </button>
                      <Link
                        href={`/portal/kaipoke-info-detail/${item.id}`}
                        className="bg-green-600 text-white px-3 py-1 rounded text-center"
                      >
                        詳細
                      </Link>
                      <a
                        href={`#row-${item.id}`}
                        className="text-xs text-blue-600 underline"
                      >
                        このIDへリンク
                      </a>
                      {/* ★ 追加：切り替え時に即保存 */}
                      <label className="text-xs flex items-center gap-2 justify-center">
                        <input
                          type="checkbox"
                          checked={item.is_active ?? true}
                          onChange={e => saveIsActive(item.id, e.target.checked)}  // ←即保存
                        />
                        有効
                      </label>
                    </div>
                  </td>
                </tr>

                <tr className="bg-gray-50">
                  <td colSpan={8} className="border p-2">
                    <div className="grid grid-cols-4 gap-3 md:gap-4">
                      <div>
                        <label className="text-sm">備考：</label>
                        <textarea
                          value={item.biko || ""}
                          onChange={e => handleChange(item.id, "biko", e.target.value)}
                          className="w-full border px-2 py-1 h-16"
                        />
                      </div>
                      <div>
                        <label className="text-sm">ルート（初期値）：</label>
                        <textarea
                          value={item.standard_route || ""}
                          onChange={e => handleChange(item.id, "standard_route", e.target.value)}
                          className="w-full border px-2 py-1 h-16"
                        />
                      </div>
                      <div>
                        <label className="text-sm">手段（初期値）：</label>
                        <textarea
                          value={item.standard_trans_ways || ""}
                          onChange={e => handleChange(item.id, "standard_trans_ways", e.target.value)}
                          className="w-full border px-2 py-1 h-16"
                        />
                      </div>
                      <div>
                        <label className="text-sm">目的（初期値）：</label>
                        <textarea
                          value={item.standard_purpose || ""}
                          onChange={e => handleChange(item.id, "standard_purpose", e.target.value)}
                          className="w-full border px-2 py-1 h-16"
                        />
                      </div>
                    </div>
                  </td>
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>

        {/* 下部にもページャー */}
        <div className="mt-3">
          <Pager />
        </div>
      </div>
    </div>
  )
}
