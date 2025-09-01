//portal/shift-record-def

"use client"

import * as React from "react"
import { useEffect, useMemo, useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"

// ===== 型 =====
export type ShiftRecordCategoryL = {
    id: string
    code: string
    name: string
    sort_order: number
    active: boolean
}

export type ShiftRecordCategoryS = {
    id: string
    l_id: string
    code: string
    name: string
    sort_order: number
    active: boolean
}

export type ShiftRecordItemDef = {
    id: string
    l_id: string | null
    s_id: string | null
    code: string
    label: string
    input_type: "checkbox" | "select" | "number" | "text" | "textarea" | "image" | "display"
    unit: string | null
    required: boolean
    sort_order: number
    active: boolean
    options: Record<string, unknown>
}

const PAGE_SIZE = 50

// 作成用・編集中ドラフト型（POST/フォーム用）
type ItemDefDraft = {
    l_id: string | null
    s_id: string | null
    code: string
    label: string
    input_type: ShiftRecordItemDef["input_type"]
    unit: string | null
    sort_order: number
    required?: boolean
    active?: boolean
    _options_text?: string
}

type ItemDefCreate = {
    l_id: string | null
    s_id: string | null
    code: string
    label: string
    input_type: ShiftRecordItemDef["input_type"]
    unit: string | null
    sort_order: number
    required: boolean
    active: boolean
    options: Record<string, unknown>
}

const INPUT_TYPES = ["checkbox", "select", "number", "text", "textarea", "image", "display"] as const
export type InputType = typeof INPUT_TYPES[number]

export default function ShiftRecordDefPage(): React.ReactElement {
    return (
        <div className="w-full overflow-x-hidden px-2 md:px-4 py-3 md:py-4 space-y-3 md:space-y-4 text-sm">
            <h2 className="text-base md:text-lg font-bold">訪問記録 定義管理</h2>
            <Tabs defaultValue="l" className="w-full">
                <TabsList className="grid grid-cols-3 w-full sm:w-[520px]">
                    <TabsTrigger value="l">大カテゴリ（L）</TabsTrigger>
                    <TabsTrigger value="s">小カテゴリ（S）</TabsTrigger>
                    <TabsTrigger value="defs">項目定義</TabsTrigger>
                </TabsList>
                <TabsContent value="l"><TabL /></TabsContent>
                <TabsContent value="s"><TabS /></TabsContent>
                <TabsContent value="defs"><TabDefs /></TabsContent>
            </Tabs>
        </div>
    )
}

// ===== 共通ユーティリティ =====
function usePager<T>(rows: T[], pageSize = PAGE_SIZE) {
    const [page, setPage] = useState(1)
    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
    const pageClamped = Math.min(page, totalPages)
    const start = (pageClamped - 1) * pageSize
    const pageRows = rows.slice(start, start + pageSize)
    useEffect(() => setPage(1), [rows.length])
    return { setPage, totalPages, pageClamped, start, pageRows }
}

function SaveDelButtons({ onSave, onDelete }: { onSave: () => void; onDelete: () => void }): React.ReactElement {
    return (
        <div className="flex gap-1">
            <Button size="sm" onClick={onSave}>保存</Button>
            <Button size="sm" variant="destructive" onClick={onDelete}>×</Button>
        </div>
    )
}


function PagerFoot({
    count, pageClamped, totalPages, start, onPrev, onNext,
}: {
    count: number; pageClamped: number; totalPages: number; start: number; onPrev: () => void; onNext: () => void
}): React.ReactElement {
    return (
        <div className="flex items-center justify-between pt-2">
            <div className="text-xs text-muted-foreground">
                {count} 件中 {count === 0 ? 0 : start + 1}–{Math.min(start + PAGE_SIZE, count)} を表示
            </div>
            <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" disabled={pageClamped <= 1} onClick={onPrev}>前へ</Button>
                <div className="text-xs">{pageClamped} / {totalPages}</div>
                <Button size="sm" variant="outline" disabled={pageClamped >= totalPages} onClick={onNext}>次へ</Button>
            </div>
        </div>
    )
}

// ====== 大カテゴリ（L）タブ ======
function TabL(): React.ReactElement {
    const [rows, setRows] = useState<ShiftRecordCategoryL[]>([])
    const [q, setQ] = useState("")
    const [newRow, setNewRow] = useState<Omit<ShiftRecordCategoryL, "id">>({ code: "", name: "", sort_order: 1000, active: true })

    const fetchRows = async () => {
        const r = await fetch("/api/shift-record-def/category-l")
        if (r.ok) setRows(await r.json())
    }
    useEffect(() => { fetchRows() }, [])

    const filtered = useMemo(() => {
        const k = q.trim().toLowerCase()
        return rows.filter((x) => !k || x.code.toLowerCase().includes(k) || x.name.toLowerCase().includes(k))
    }, [rows, q])
    const { setPage, totalPages, pageClamped, start, pageRows } = usePager(filtered)

    const handleEdit = <K extends keyof ShiftRecordCategoryL>(id: string, key: K, val: ShiftRecordCategoryL[K]) => {
        setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [key]: val } as ShiftRecordCategoryL : r)))
    }
    const save = async (row: ShiftRecordCategoryL) => {
        const r = await fetch(`/api/shift-record-def/category-l/${row.id}`, {
            method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(row)
        })
        if (r.ok) { await fetchRows(); alert("保存しました") } else {
            alert((await r.json().catch(() => ({ error: "保存に失敗" }))).error || "保存に失敗")
        }
    }
    const del = async (id: string) => {
        const r = await fetch(`/api/shift-record-def/category-l/${id}`, { method: "DELETE" })
        if (r.ok) { await fetchRows(); alert("削除しました") } else {
            alert((await r.json().catch(() => ({ error: "削除に失敗" }))).error || "削除に失敗")
        }
    }
    const add = async () => {
        if (!newRow.code || !newRow.name) { alert("code / name は必須です"); return }
        const r = await fetch(`/api/shift-record-def/category-l`, {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newRow)
        })
        if (r.ok) {
            setNewRow({ code: "", name: "", sort_order: 1000, active: true })
            await fetchRows()
            alert("追加しました")
        } else {
            alert((await r.json().catch(() => ({ error: "追加に失敗" }))).error || "追加に失敗")
        }
    }

    return (
        <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
                <div>
                    <div className="text-[11px] text-muted-foreground">検索（code / name）</div>
                    <Input className="h-8" value={q} onChange={(e) => setQ(e.target.value)} placeholder="physical など" />
                </div>
                <div className="sm:justify-self-end">
                    <Button size="sm" variant="secondary" onClick={() => setQ("")}>クリア</Button>
                </div>
            </div>

            <div className="overflow-x-auto">
                <Table className="w-full table-fixed">
                    <colgroup>
                        <col style={{ width: "20%" }} />
                        <col style={{ width: "40%" }} />
                        <col style={{ width: "15%" }} />
                        <col style={{ width: "10%" }} />
                        <col style={{ width: "15%" }} />
                    </colgroup>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="px-1 py-1">code</TableHead>
                            <TableHead className="px-1 py-1">name</TableHead>
                            <TableHead className="px-1 py-1">sort</TableHead>
                            <TableHead className="px-1 py-1">active</TableHead>
                            <TableHead className="px-1 py-1">操作</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {pageRows.map((r) => (
                            <TableRow key={r.id}>
                                <TableCell className="px-1 py-1"><Input className="h-8" value={r.code} onChange={(e) => handleEdit(r.id, "code", e.target.value)} /></TableCell>
                                <TableCell className="px-1 py-1"><Input className="h-8" value={r.name} onChange={(e) => handleEdit(r.id, "name", e.target.value)} /></TableCell>
                                <TableCell className="px-1 py-1"><Input className="h-8" type="number" value={r.sort_order} onChange={(e) => handleEdit(r.id, "sort_order", Number(e.target.value))} /></TableCell>
                                <TableCell className="px-1 py-1">
                                    <Select value={String(r.active ? 1 : 0)} onValueChange={(v) => handleEdit(r.id, "active", v === "1")}>
                                        <SelectTrigger><SelectValue placeholder="" /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="1">true</SelectItem>
                                            <SelectItem value="0">false</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </TableCell>
                                <TableCell className="px-1 py-1"><SaveDelButtons onSave={() => save(r)} onDelete={() => del(r.id)} /></TableCell>
                            </TableRow>
                        ))}

                        {/* 追加行 */}
                        <TableRow>
                            <TableCell className="px-1 py-1"><Input className="h-8" value={newRow.code} onChange={(e) => setNewRow({ ...newRow, code: e.target.value })} placeholder="beforehand" /></TableCell>
                            <TableCell className="px-1 py-1"><Input className="h-8" value={newRow.name} onChange={(e) => setNewRow({ ...newRow, name: e.target.value })} placeholder="事前" /></TableCell>
                            <TableCell className="px-1 py-1"><Input className="h-8" type="number" value={newRow.sort_order} onChange={(e) => setNewRow({ ...newRow, sort_order: Number(e.target.value) })} /></TableCell>
                            <TableCell className="px-1 py-1">
                                <Select value={String(newRow.active ? 1 : 0)} onValueChange={(v) => setNewRow({ ...newRow, active: v === "1" })}>
                                    <SelectTrigger><SelectValue placeholder="true" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="1">true</SelectItem>
                                        <SelectItem value="0">false</SelectItem>
                                    </SelectContent>
                                </Select>
                            </TableCell>
                            <TableCell className="px-1 py-1"><Button size="sm" onClick={add}>追加</Button></TableCell>
                        </TableRow>
                    </TableBody>
                </Table>
            </div>

            <PagerFoot
                count={filtered.length}
                pageClamped={pageClamped}
                totalPages={totalPages}
                start={start}
                onPrev={() => setPage(p => Math.max(1, p - 1))}
                onNext={() => setPage(p => Math.min(totalPages, p + 1))}
            />
        </div>
    )
}

void TabL

// ====== 小カテゴリ（S）タブ ======
function TabS(): React.ReactElement {
    const [rows, setRows] = useState<ShiftRecordCategoryS[]>([])
    const [cats, setCats] = useState<ShiftRecordCategoryL[]>([])
    const [q, setQ] = useState("")
    const [qL, setQL] = useState<string>("")
    const [newRow, setNewRow] = useState<Omit<ShiftRecordCategoryS, "id">>({
        l_id: "", code: "", name: "", sort_order: 1000, active: true
    })

    const fetchAll = async () => {
        const [s1, s2] = await Promise.all([
            fetch("/api/shift-record-def/category-s"),
            fetch("/api/shift-record-def/category-l"),
        ])
        if (s1.ok) setRows(await s1.json())
        if (s2.ok) setCats(await s2.json())
    }
    useEffect(() => { fetchAll() }, [])

    const filtered = useMemo(() => {
        const k = q.trim().toLowerCase()
        return rows.filter((x) => {
            if (qL && x.l_id !== qL) return false
            if (!k) return true
            return x.code.toLowerCase().includes(k) || x.name.toLowerCase().includes(k)
        })
    }, [rows, q, qL])
    const { setPage, totalPages, pageClamped, start, pageRows } = usePager(filtered)

    const handleEdit = <K extends keyof ShiftRecordCategoryS>(id: string, key: K, val: ShiftRecordCategoryS[K]) => {
        setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [key]: val } as ShiftRecordCategoryS : r)))
    }

    const save = async (row: ShiftRecordCategoryS) => {
        const r = await fetch(`/api/shift-record-def/category-s/${row.id}`, {
            method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(row)
        })
        if (r.ok) { await fetchAll(); alert("保存しました") } else {
            alert((await r.json().catch(() => ({ error: "保存に失敗" }))).error || "保存に失敗")
        }
    }
    const del = async (id: string) => {
        const r = await fetch(`/api/shift-record-def/category-s/${id}`, { method: "DELETE" })
        if (r.ok) { await fetchAll(); alert("削除しました") } else {
            alert((await r.json().catch(() => ({ error: "削除に失敗" }))).error || "削除に失敗")
        }
    }
    const add = async () => {
        if (!newRow.l_id || !newRow.code || !newRow.name) { alert("l_id / code / name は必須です"); return }
        const r = await fetch(`/api/shift-record-def/category-s`, {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newRow)
        })
        if (r.ok) {
            setNewRow({ l_id: "", code: "", name: "", sort_order: 1000, active: true })
            await fetchAll()
            alert("追加しました")
        } else {
            alert((await r.json().catch(() => ({ error: "追加に失敗" }))).error || "追加に失敗")
        }
    }

    return (
        <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
                <div>
                    <div className="text-[11px] text-muted-foreground">大カテゴリ</div>
                    <Select value={qL} onValueChange={(v) => setQL(v)}>
                        <SelectTrigger><SelectValue placeholder="すべて" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="">すべて</SelectItem>
                            {cats.map((c) => (<SelectItem key={c.id} value={c.id}>{c.name} ({c.code})</SelectItem>))}
                        </SelectContent>
                    </Select>
                </div>
                <div>
                    <div className="text-[11px] text-muted-foreground">検索（code / name）</div>
                    <Input className="h-8" value={q} onChange={(e) => setQ(e.target.value)} placeholder="meal など" />
                </div>
                <div className="sm:justify-self-end col-span-2 sm:col-span-1">
                    <Button size="sm" variant="secondary" onClick={() => { setQ(""); setQL("") }}>クリア</Button>
                </div>
            </div>

            <div className="overflow-x-auto">
                <Table className="w-full table-fixed">
                    <colgroup>
                        <col style={{ width: "24%" }} />
                        <col style={{ width: "24%" }} />
                        <col style={{ width: "14%" }} />
                        <col style={{ width: "14%" }} />
                        <col style={{ width: "10%" }} />
                        <col style={{ width: "14%" }} />
                    </colgroup>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="px-1 py-1">L（id）</TableHead>
                            <TableHead className="px-1 py-1">code</TableHead>
                            <TableHead className="px-1 py-1">name</TableHead>
                            <TableHead className="px-1 py-1">sort</TableHead>
                            <TableHead className="px-1 py-1">active</TableHead>
                            <TableHead className="px-1 py-1">操作</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {pageRows.map((r) => (
                            <TableRow key={r.id}>
                                <TableCell className="px-1 py-1">
                                    <Select value={r.l_id} onValueChange={(v) => handleEdit(r.id, "l_id", v)}>
                                        <SelectTrigger><SelectValue placeholder="" /></SelectTrigger>
                                        <SelectContent>
                                            {cats.map((c) => (<SelectItem key={c.id} value={c.id}>{c.name} ({c.code})</SelectItem>))}
                                        </SelectContent>
                                    </Select>
                                </TableCell>
                                <TableCell className="px-1 py-1"><Input className="h-8" value={r.code} onChange={(e) => handleEdit(r.id, "code", e.target.value)} /></TableCell>
                                <TableCell className="px-1 py-1"><Input className="h-8" value={r.name} onChange={(e) => handleEdit(r.id, "name", e.target.value)} /></TableCell>
                                <TableCell className="px-1 py-1"><Input className="h-8" type="number" value={r.sort_order} onChange={(e) => handleEdit(r.id, "sort_order", Number(e.target.value))} /></TableCell>
                                <TableCell className="px-1 py-1">
                                    <Select value={String(r.active ? 1 : 0)} onValueChange={(v) => handleEdit(r.id, "active", v === "1")}>
                                        <SelectTrigger><SelectValue placeholder="" /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="1">true</SelectItem>
                                            <SelectItem value="0">false</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </TableCell>
                                <TableCell className="px-1 py-1"><SaveDelButtons onSave={() => save(r)} onDelete={() => del(r.id)} /></TableCell>
                            </TableRow>
                        ))}

                        {/* 追加行 */}
                        <TableRow>
                            <TableCell className="px-1 py-1">
                                <Select value={newRow.l_id} onValueChange={(v) => setNewRow({ ...newRow, l_id: v })}>
                                    <SelectTrigger><SelectValue placeholder="選択" /></SelectTrigger>
                                    <SelectContent>
                                        {cats.map((c) => (<SelectItem key={c.id} value={c.id}>{c.name} ({c.code})</SelectItem>))}
                                    </SelectContent>
                                </Select>
                            </TableCell>
                            <TableCell className="px-1 py-1"><Input className="h-8" value={newRow.code} onChange={(e) => setNewRow({ ...newRow, code: e.target.value })} placeholder="excretion" /></TableCell>
                            <TableCell className="px-1 py-1"><Input className="h-8" value={newRow.name} onChange={(e) => setNewRow({ ...newRow, name: e.target.value })} placeholder="排泄" /></TableCell>
                            <TableCell className="px-1 py-1"><Input className="h-8" type="number" value={newRow.sort_order} onChange={(e) => setNewRow({ ...newRow, sort_order: Number(e.target.value) })} /></TableCell>
                            <TableCell className="px-1 py-1">
                                <Select value={String(newRow.active ? 1 : 0)} onValueChange={(v) => setNewRow({ ...newRow, active: v === "1" })}>
                                    <SelectTrigger><SelectValue placeholder="true" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="1">true</SelectItem>
                                        <SelectItem value="0">false</SelectItem>
                                    </SelectContent>
                                </Select>
                            </TableCell>
                            <TableCell className="px-1 py-1"><Button size="sm" onClick={add}>追加</Button></TableCell>
                        </TableRow>
                    </TableBody>
                </Table>
            </div>

            <PagerFoot
                count={filtered.length}
                pageClamped={pageClamped}
                totalPages={totalPages}
                start={start}
                onPrev={() => setPage(p => Math.max(1, p - 1))}
                onNext={() => setPage(p => Math.min(totalPages, p + 1))}
            />
        </div>
    )
}
void TabS

// ====== 項目定義タブ ======
/*
const INPUT_TYPES = ["checkbox", "select", "number", "text", "textarea", "image", "display"] as const
type InputType = typeof INPUT_TYPES[number]
*/

function TabDefs(): React.ReactElement {
    const [rows, setRows] = useState<WithOptionsText[]>([])
    const [catsL, setCatsL] = useState<ShiftRecordCategoryL[]>([])
    const [catsS, setCatsS] = useState<ShiftRecordCategoryS[]>([])

    const [q, setQ] = useState("")
    const [qL, setQL] = useState<string>("")
    const [qS, setQS] = useState<string>("")

    const emptyNew: Omit<WithOptionsText, "id" | "required" | "active" | "options"> & { required?: boolean; active?: boolean; options?: Record<string, unknown> } = {
        l_id: "", s_id: "", code: "", label: "", input_type: "text", unit: "", sort_order: 1000,
    }
    const [newRow, setNewRow] = useState<ItemDefDraft>(emptyNew as ItemDefDraft)

    const fetchAll = async () => {
        const [d, l, s] = await Promise.all([
            fetch("/api/shift-record-def/item-defs"),
            fetch("/api/shift-record-def/category-l"),
            fetch("/api/shift-record-def/category-s"),
        ])
        if (d.ok) {
            const arr: ShiftRecordItemDef[] = await d.json()
            // 表示用テキストを初期値でセット
            setRows(arr.map(x => ({ ...x, _options_text: JSON.stringify(x.options ?? {}, null, 2) })))
        }
        if (l.ok) setCatsL(await l.json())
        if (s.ok) setCatsS(await s.json())
    }
    useEffect(() => { fetchAll() }, [])

    const filtered = useMemo(() => {
        const k = q.trim().toLowerCase()
        return rows.filter((x) => {
            if (qL && x.l_id !== qL) return false
            if (qS && x.s_id !== qS) return false
            if (!k) return true
            return (
                x.code.toLowerCase().includes(k) ||
                x.label.toLowerCase().includes(k) ||
                (x.unit ?? "").toLowerCase().includes(k) ||
                x.input_type.toLowerCase().includes(k)
            )
        })
    }, [rows, q, qL, qS])
    const { setPage, totalPages, pageClamped, start, pageRows } = usePager(filtered)

    const handleEdit = (id: string, patch: Partial<WithOptionsText>) => {
        setRows((prev) => prev.map((r) => (r.id === id ? ({ ...r, ...patch }) : r)))
    }

    type WithOptionsText = ShiftRecordItemDef & { _options_text?: string }

    const save = async (row: WithOptionsText) => {
        const { _options_text, ...rest } = row
        let optionsParsed: Record<string, unknown> = {}
        try { optionsParsed = _options_text ? JSON.parse(_options_text) : {} }
        catch { alert("options がJSONではありません"); return }

        const payload: ShiftRecordItemDef = { ...(rest as ShiftRecordItemDef), options: optionsParsed }

        const r = await fetch(`/api/shift-record-def/item-defs/${row.id}`, {
            method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
        })
        if (r.ok) { await fetchAll(); alert("保存しました") } else {
            alert((await r.json().catch(() => ({ error: "保存に失敗" }))).error || "保存に失敗")
        }
    }

    const del = async (id: string) => {
        const r = await fetch(`/api/shift-record-def/item-defs/${id}`, { method: "DELETE" })
        if (r.ok) { await fetchAll(); alert("削除しました") } else {
            alert((await r.json().catch(() => ({ error: "削除に失敗" }))).error || "削除に失敗")
        }
    }
    const add = async () => {
        const draft = newRow
        if (!draft.code || !draft.label || !draft.input_type) { alert("code / label / input_type は必須です"); return }
        if (!draft.l_id && !draft.s_id) { alert("l_id か s_id を指定してください"); return }
        let optionsParsed: Record<string, unknown> = {}
        try { optionsParsed = draft._options_text ? JSON.parse(draft._options_text) : {} } catch { alert("options がJSONではありません"); return }

        const payloadAdd: ItemDefCreate = {
            l_id: draft.l_id ?? null,
            s_id: draft.s_id ?? null,
            code: draft.code,
            label: draft.label,
            input_type: draft.input_type,
            unit: draft.unit ?? null,
            sort_order: Number(draft.sort_order ?? 1000),
            required: Boolean(draft.required),
            active: draft.active !== false,
            options: optionsParsed,
        }

        const r = await fetch(`/api/shift-record-def/item-defs`, {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payloadAdd)
        })
        if (r.ok) {
            setNewRow({ ...emptyNew } as ItemDefDraft)
            await fetchAll()
            alert("追加しました")
        } else {
            alert((await r.json().catch(() => ({ error: "追加に失敗" }))).error || "追加に失敗")
        }
    }


    const nameL = (id?: string | null) => catsL.find((x) => x.id === id)?.name || "—"

    return (
        <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-6 gap-2 items-end">
                <div>
                    <div className="text-[11px] text-muted-foreground">大カテゴリ</div>
                    <Select value={qL} onValueChange={(v) => setQL(v)}>
                        <SelectTrigger><SelectValue placeholder="すべて" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="">すべて</SelectItem>
                            {catsL.map((c) => (<SelectItem key={c.id} value={c.id}>{c.name} ({c.code})</SelectItem>))}
                        </SelectContent>
                    </Select>
                </div>
                <div>
                    <div className="text-[11px] text-muted-foreground">小カテゴリ</div>
                    <Select value={qS} onValueChange={(v) => setQS(v)}>
                        <SelectTrigger><SelectValue placeholder="すべて" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="">すべて</SelectItem>
                            {catsS.filter(s => !qL || s.l_id === qL).map((s) => (
                                <SelectItem key={s.id} value={s.id}>{nameL(s.l_id)} / {s.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="sm:col-span-3">
                    <div className="text-[11px] text-muted-foreground">検索（code / label / unit / input_type）</div>
                    <Input className="h-8" value={q} onChange={(e) => setQ(e.target.value)} placeholder="vital_temp / 体温 / ℃ など" />
                </div>
                <div className="sm:justify-self-end">
                    <Button size="sm" variant="secondary" onClick={() => { setQ(""); setQL(""); setQS("") }}>クリア</Button>
                </div>
            </div>

            <div className="overflow-x-auto">
                <Table className="w-full table-fixed">
                  // TabDefs 内 Table の colgroup を置き換え
                    <colgroup>
                        <col style={{ width: "12%" }} /> {/* L */}
                        <col style={{ width: "12%" }} /> {/* S */}
                        <col style={{ width: "10%" }} /> {/* code（縮小） */}
                        <col style={{ width: "14%" }} /> {/* label（やや縮小） */}
                        <col style={{ width: "10%" }} /> {/* type */}
                        <col style={{ width: "6%" }} /> {/* unit（縮小） */}
                        <col style={{ width: "6%" }} /> {/* req（縮小） */}
                        <col style={{ width: "6%" }} /> {/* active（縮小） */}
                        <col style={{ width: "8%" }} /> {/* sort（分離） */}
                        <col style={{ width: "6%" }} /> {/* 操作（分離） */}
                    </colgroup>

                    <TableHeader>
                        <TableRow className="border-b">
                            <TableHead className="px-1 py-1">L</TableHead>
                            <TableHead className="px-1 py-1">S</TableHead>
                            <TableHead className="px-1 py-1">code</TableHead>
                            <TableHead className="px-1 py-1">label</TableHead>
                            <TableHead className="px-1 py-1">type</TableHead>
                            <TableHead className="px-1 py-1">unit</TableHead>
                            <TableHead className="px-1 py-1">req</TableHead>
                            <TableHead className="px-1 py-1">active</TableHead>
                            <TableHead className="px-1 py-1">sort</TableHead>
                            <TableHead className="px-1 py-1">操作</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {pageRows.map((r) => (
                            <React.Fragment key={r.id}>
                                {/* 1行目：基本項目 + sort + 操作 */}
                                <TableRow className="border-b">
                                    <TableCell className="px-1 py-1">...L 選択...</TableCell>
                                    <TableCell className="px-1 py-1">...S 選択...</TableCell>
                                    <TableCell className="px-1 py-1">
                                        <Input className="h-8" value={r.code} onChange={(e) => handleEdit(r.id, { code: e.target.value })} />
                                    </TableCell>
                                    <TableCell className="px-1 py-1">
                                        <Input className="h-8" value={r.label} onChange={(e) => handleEdit(r.id, { label: e.target.value })} />
                                    </TableCell>
                                    <TableCell className="px-1 py-1">...type Select...</TableCell>
                                    <TableCell className="px-1 py-1">
                                        <Input className="h-8" value={r.unit ?? ""} onChange={(e) => handleEdit(r.id, { unit: e.target.value || null })} />
                                    </TableCell>
                                    <TableCell className="px-1 py-1">...req Select...</TableCell>
                                    <TableCell className="px-1 py-1">...active Select...</TableCell>

                                    {/* sort 列（分離） */}
                                    <TableCell className="px-1 py-1">
                                        <Input className="h-8" type="number" value={r.sort_order}
                                            onChange={(e) => handleEdit(r.id, { sort_order: Number(e.target.value) })} />
                                    </TableCell>

                                    {/* 操作 列（分離） */}
                                    <TableCell className="px-1 py-1">
                                        <SaveDelButtons onSave={() => save(r)} onDelete={() => del(r.id)} />
                                    </TableCell>
                                </TableRow>

                                {/* 2行目：options(JSON) を横長で */}
                                <TableRow className="border-b">
                                    <TableCell className="px-1 py-1" colSpan={10}>
                                        <div className="text-[11px] text-muted-foreground pb-1">options(JSON)</div>
                                        <Textarea
                                            className="h-20"
                                            value={r._options_text ?? JSON.stringify(r.options ?? {}, null, 2)}
                                            onChange={(e) => handleEdit(r.id, { _options_text: e.target.value })}
                                        />
                                    </TableCell>
                                </TableRow>
                            </React.Fragment>
                        ))}
                        {/* 追加行 1段目 */}
                        <TableRow className="border-b">
                            <TableCell className="px-1 py-1">...L 選択...</TableCell>
                            <TableCell className="px-1 py-1">...S 選択...</TableCell>
                            <TableCell className="px-1 py-1"> <Input
                                className="h-8"
                                value={newRow.code ?? ""}
                                onChange={(e) => setNewRow({ ...newRow, code: e.target.value })}
                                placeholder="vital_temp"
                            /></TableCell>
                            <TableCell className="px-1 py-1"><Input
                                className="h-8"
                                value={newRow.label ?? ""}
                                onChange={(e) => setNewRow({ ...newRow, label: e.target.value })}
                            /></TableCell>
                            <TableCell className="px-1 py-1">...type Select...</TableCell>
                            <TableCell className="px-1 py-1"><Input
                                className="h-8"
                                value={newRow.label ?? ""}
                                onChange={(e) => setNewRow({ ...newRow, unit: e.target.value })}
                            /></TableCell>
                            <TableCell className="px-1 py-1">...req Select...</TableCell>
                            <TableCell className="px-1 py-1">...active Select...</TableCell>
                            <TableCell className="px-1 py-1">
                                <Input className="h-8" type="number" value={newRow.sort_order ?? 1000}
                                    onChange={(e) => setNewRow({ ...newRow, sort_order: Number(e.target.value) })} />
                            </TableCell>
                            <TableCell className="px-1 py-1">
                                <Button size="sm" onClick={add}>追加</Button>
                            </TableCell>
                        </TableRow>

                        {/* 追加行 2段目：options(JSON) */}
                        <TableRow className="border-b">
                            <TableCell className="px-1 py-1" colSpan={10}>
                                <div className="text-[11px] text-muted-foreground pb-1">options(JSON)</div>
                                <Textarea
                                    className="h-20"
                                    value={newRow._options_text ?? "{}"}
                                    onChange={(e) => setNewRow({ ...newRow, _options_text: e.target.value })}
                                />
                            </TableCell>
                        </TableRow>

                    </TableBody>
                </Table>
            </div>

            <PagerFoot
                count={filtered.length}
                pageClamped={pageClamped}
                totalPages={totalPages}
                start={start}
                onPrev={() => setPage(p => Math.max(1, p - 1))}
                onNext={() => setPage(p => Math.min(totalPages, p + 1))}
            />
        </div>
    )
}

void TabDefs