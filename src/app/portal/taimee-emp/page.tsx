// =============================
// app/portal/taimee-emp/page.tsx （period_month表示＋列フィルター）
// =============================
'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox' // ✅ 追加

type Status = 'all' | 'in' | 'not'
type BlackFilter = 'all' | 'only' | 'exclude'

interface TaimeeEmployeeWithEntry {
    period_month: string
    taimee_user_id: string
    normalized_phone: string
    entry_id: string | null
    in_entry: boolean | null
    black_list?: boolean | null       // ✅ 追加
    memo?: string | null              // ✅ 追加
    姓?: string | null
    名?: string | null
    住所?: string | null
    性別?: string | null
    電話番号?: string | null
}

export default function TaimeeEmployeesPage() {
    const router = useRouter()
    const [file, setFile] = useState<File | null>(null)
    const [loading, setLoading] = useState(false)
    const [items, setItems] = useState<TaimeeEmployeeWithEntry[]>([])
    const [message, setMessage] = useState<string | null>(null)

    // 既存列フィルター
    const [fPeriod, setFPeriod] = useState('')
    const [fLast, setFLast] = useState('')
    const [fFirst, setFFirst] = useState('')
    const [fPhone, setFPhone] = useState('')

    // ✅ インライン化した在籍フィルター
    const [fEntry, setFEntry] = useState<Status>('all')
    // ✅ 追加：ブラックフィルター / メモ検索
    const [fBlack, setFBlack] = useState<BlackFilter>('all')
    const [fMemo, setFMemo] = useState('')

    async function fetchList() {
        setLoading(true)
        try {
            // API側でのサーバーフィルタを使う場合はクエリに含める
            const params = new URLSearchParams({
                status: fEntry,
                black: fBlack,
                memo: fMemo,
            })
            const r = await fetch(`/api/taimee-emp/list?${params}`, { cache: 'no-store' })
            const j = await r.json()
            if (!j.ok) throw new Error(j.error || 'Failed')
            setItems(j.items as TaimeeEmployeeWithEntry[])
        } catch (e) {
            setMessage(e instanceof Error ? e.message : '読み込みに失敗しました')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { fetchList() }, [fEntry, fBlack, fMemo]) // 在籍/ブラック/メモ変更で再取得

    async function onUpload(e: React.FormEvent) {
        e.preventDefault()
        if (!file) { setMessage('CSVファイルを選択してください'); return }
        setLoading(true); setMessage(null)
        try {
            const fd = new FormData()
            fd.append('period', '')
            fd.append('file', file)
            const r = await fetch('/api/taimee-emp/upload', { method: 'POST', body: fd })
            const j = await r.json()
            if (!j.ok) throw new Error(j.error || 'アップロード失敗')
            setMessage(`取り込み完了：${j.count}件`)
            await fetchList()
        } catch (e) {
            setMessage(e instanceof Error ? e.message : 'アップロードに失敗しました')
        } finally { setLoading(false) }
    }

    const filtered = useMemo(() => {
        const p = fPeriod.trim().toLowerCase()
        const ln = fLast.trim().toLowerCase()
        const fn = fFirst.trim().toLowerCase()
        const ph = fPhone.trim().toLowerCase()
        const memo = fMemo.trim().toLowerCase()

        return items.filter((it) => {
            // 在籍フィルター（インライン）
            if (fEntry === 'in' && !it.in_entry) return false
            if (fEntry === 'not' && it.in_entry) return false

            // ブラックフィルター
            const isBlack = !!it.black_list
            if (fBlack === 'only' && !isBlack) return false
            if (fBlack === 'exclude' && isBlack) return false

            // メモ検索（部分一致）
            if (memo && !String(it.memo ?? '').toLowerCase().includes(memo)) return false

            // 既存列フィルター
            if (p && !String(it.period_month ?? '').slice(0, 7).toLowerCase().includes(p)) return false
            if (ln && !String(it['姓'] ?? '').toLowerCase().includes(ln)) return false
            if (fn && !String(it['名'] ?? '').toLowerCase().includes(fn)) return false
            if (ph && !String(it['電話番号'] ?? '').toLowerCase().includes(ph)) return false
            return true
        })
    }, [items, fEntry, fBlack, fMemo, fPeriod, fLast, fFirst, fPhone])

    return (
        <div className="p-6 space-y-6">
            <h1 className="text-2xl font-bold">タイミー従業員（全期間）アップロード＆一覧</h1>

            {/* アップロードカード（既存） */}
            <Card>
                <CardContent className="p-4">
                    <form onSubmit={onUpload} className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                        <div className="md:col-span-2 space-y-1">
                            <label className="text-sm">CSVファイル</label>
                            <Input type="file" accept=".csv" onChange={(e) => setFile(e.target.files?.[0] || null)} required />
                        </div>
                        <div>
                            <Button type="submit" disabled={loading}>{loading ? '処理中…' : 'アップロード'}</Button>
                        </div>
                    </form>
                    {message && <p className="text-sm text-muted-foreground mt-2">{message}</p>}
                </CardContent>
            </Card>

            {/* 一覧カード */}
            <Card>
                <CardContent className="p-4 space-y-4">
                    <div className="overflow-auto border rounded-xl">
                        <table className="min-w-[1080px] text-sm">
                            <thead className="bg-muted">
                                <tr>
                                    <th className="text-left p-2">period_month</th>
                                    <th className="text-left p-2">姓</th>
                                    <th className="text-left p-2">名</th>
                                    <th className="text-left p-2">電話</th>
                                    <th className="text-left p-2">在籍</th>
                                    <th className="text-left p-2">ブラック</th> {/* ✅ 追加 */}
                                    <th className="text-left p-2">メモ</th>      {/* ✅ 追加 */}
                                    <th className="text-left p-2">操作</th>
                                </tr>
                                {/* フィルター行（在籍セレクトをインライン化、ブラック/メモ追加） */}
                                <tr className="border-t">
                                    <th className="p-2"><Input placeholder="YYYY-MM" value={fPeriod} onChange={(e) => setFPeriod(e.target.value)} /></th>
                                    <th className="p-2"><Input placeholder="姓" value={fLast} onChange={(e) => setFLast(e.target.value)} /></th>
                                    <th className="p-2"><Input placeholder="名" value={fFirst} onChange={(e) => setFFirst(e.target.value)} /></th>
                                    <th className="p-2"><Input placeholder="電話" value={fPhone} onChange={(e) => setFPhone(e.target.value)} /></th>

                                    {/* 在籍（インライン化） */}
                                    <th className="p-2">
                                        <div className="w-[150px]">
                                            <Select value={fEntry} onValueChange={(v: Status) => setFEntry(v)}>
                                                <SelectTrigger><SelectValue placeholder="すべて" /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="all">すべて</SelectItem>
                                                    <SelectItem value="in">Entryあり</SelectItem>
                                                    <SelectItem value="not">Entryなし</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </th>

                                    {/* ブラックフィルター */}
                                    <th className="p-2">
                                        <div className="w-[150px]">
                                            <Select value={fBlack} onValueChange={(v: BlackFilter) => setFBlack(v)}>
                                                <SelectTrigger><SelectValue placeholder="ブラック" /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="all">すべて</SelectItem>
                                                    <SelectItem value="only">ブラックのみ</SelectItem>
                                                    <SelectItem value="exclude">ブラック除外</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </th>

                                    {/* メモ検索 */}
                                    <th className="p-2"><Input placeholder="メモ" value={fMemo} onChange={(e) => setFMemo(e.target.value)} /></th>

                                    <th className="p-2">
                                        <Button variant="outline" size="sm" onClick={() => {
                                            setFPeriod(''); setFLast(''); setFFirst(''); setFPhone('');
                                            setFEntry('all'); setFBlack('all'); setFMemo('');
                                        }}>クリア</Button>
                                    </th>
                                </tr>
                            </thead>

                            <tbody>
                                {filtered.map((it) => {
                                    const inEntry = !!it.in_entry
                                    const entryId = it.entry_id
                                    return (
                                        <tr key={`${it.period_month}-${it.taimee_user_id}`} className="border-t">
                                            <td className="p-2">{String(it.period_month).slice(0, 10)}</td>
                                            <td className="p-2">{it['姓']}</td>
                                            <td className="p-2">{it['名']}</td>
                                            <td className="p-2">{it['電話番号']}</td>
                                            <td className="p-2">
                                                {inEntry
                                                    ? <span className="px-2 py-1 rounded-full bg-green-100 text-green-800 text-xs">Entryあり</span>
                                                    : <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-800 text-xs">Entryなし</span>}
                                            </td>
                                            {/* ✅ ブラック（表示はチェックボックス。ここでは閲覧専用） */}
                                            <td className="p-2">
                                                <Checkbox checked={!!it.black_list} disabled />
                                            </td>
                                            <td className="p-2 whitespace-pre-wrap">{it.memo ?? ''}</td>
                                            <td className="p-2">
                                                {inEntry && entryId
                                                    ? <Button variant="secondary" size="sm" onClick={() => router.push(`/portal/entry-detail/${entryId}`)}>entry-detail へ</Button>
                                                    : <Button variant="outline" size="sm" disabled>entry-detail へ</Button>}
                                            </td>
                                        </tr>
                                    )
                                })}
                                {filtered.length === 0 && (
                                    <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">データがありません</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    <p className="text-xs text-muted-foreground">
                        ※ 在籍判定は form_entries.phone と正規化済み電話番号で突合。ブラックはCSV/DBの `black_list` を尊重します。
                    </p>
                </CardContent>
            </Card>
        </div>
    )
}
