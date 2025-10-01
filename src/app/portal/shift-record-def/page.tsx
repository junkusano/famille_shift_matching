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
    rules_json?: Record<string, unknown> | null
    _rules_text?: string
}

export type ShiftRecordCategoryS = {
    id: string
    l_id: string
    code: string
    name: string
    sort_order: number
    active: boolean
    rules_json?: Record<string, unknown> | null
    _rules_text?: string
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
    default_value?: unknown
    rules_json?: Record<string, unknown> | null
    meta_json?: Record<string, unknown> | null
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
    _default_text?: string
    _rules_text?: string
    _meta_text?: string
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

type WithOptionsText = ShiftRecordItemDef & {
    _options_text?: string
    _default_text?: string
    _rules_text?: string
    _meta_text?: string
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

// JSON 文字列→オブジェクト。空/未入力は {} を返す。失敗時 alert して throw。
function parseRulesOrEmpty(text?: string) {
    if (!text || !text.trim()) return {};
    try { return JSON.parse(text); }
    catch (e) { alert("rules_json が JSON ではありません"); throw e; }
}


// ====== 大カテゴリ（L）タブ ======
function TabL(): React.ReactElement {
    type RowL = ShiftRecordCategoryL & { _rules_text?: string };
    const [rows, setRows] = useState<RowL[]>([]);
    const [q, setQ] = useState("")
    const initialNewRowL: Omit<RowL, "id"> = {
        code: "",
        name: "",
        sort_order: 1000,
        active: true,
        rules_json: null,
        _rules_text: "{}",
    };
    const [newRow, setNewRow] = useState<Omit<RowL, "id">>(initialNewRowL);
    const fetchRows = async () => {
        const r = await fetch("/api/shift-record-def/category-l");
        if (r.ok) {
            const arr: ShiftRecordCategoryL[] = await r.json();
            setRows(
                arr.map(x => ({
                    ...x,
                    _rules_text: JSON.stringify(x.rules_json ?? {}, null, 2),
                }))
            );
        }
    };

    useEffect(() => { fetchRows() }, [])

    const filtered = useMemo(() => {
        const k = q.trim().toLowerCase()
        return rows.filter((x) => !k || x.code.toLowerCase().includes(k) || x.name.toLowerCase().includes(k))
    }, [rows, q])
    const { setPage, totalPages, pageClamped, start, pageRows } = usePager(filtered)

    const handleEdit = <K extends keyof RowL>(id: RowL["id"], key: K, val: RowL[K]) => {
        setRows(prev => prev.map(r => (r.id === id ? { ...r, [key]: val } : r)));
    };
    // TabL 冒頭で宣言済: type RowL = ShiftRecordCategoryL & { _rules_text?: string };
    const save = async (row: RowL) => {
        const { _rules_text, ...rest } = row;
        let rulesParsed: Record<string, unknown>;
        try { rulesParsed = parseRulesOrEmpty(_rules_text); } catch { return; }

        await fetch(`/api/shift-record-def/category-l/${row.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...rest, rules_json: rulesParsed }),
        });
    }


    /*
    const handleEditRules = (id: string, text: string) => {
        setRows(prev => prev.map(r => r.id === id ? { ...r, _rules_text: text } : r))
    }
        */

    // TabL: 既存行の rules_json テキストを更新
    const handleEditRulesL = (id: string, text: string) => {
        setRows(prev => prev.map(r => (r.id === id ? { ...r, _rules_text: text } : r)));
    };

    // TabL: 新規行の rules_json テキストを更新
    const handleEditNewRulesL = (text: string) => {
        setNewRow(prev => ({ ...prev, _rules_text: text }));
    };

    const del = async (id: string) => {
        const r = await fetch(`/api/shift-record-def/category-l/${id}`, { method: "DELETE" })
        if (r.ok) { await fetchRows(); alert("削除しました") } else {
            alert((await r.json().catch(() => ({ error: "削除に失敗" }))).error || "削除に失敗")
        }
    }
    // TabL の add 内（リセット時も合わせて）
    const add = async () => {
        if (!newRow.code || !newRow.name) { alert("code / name は必須です"); return; }
        let rulesParsed: Record<string, unknown>;
        try { rulesParsed = parseRulesOrEmpty(newRow._rules_text); } catch { return; }

        const { _rules_text, ...rest } = newRow;
        const r = await fetch(`/api/shift-record-def/category-l`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...rest, rules_json: rulesParsed }),
        });
        if (r.ok) {
            setNewRow({ code: "", name: "", sort_order: 1000, active: true, _rules_text: "{}" }); // ← ここポイント
            await fetchRows();
            alert("追加しました");
        } else {
            alert((await r.json().catch(() => ({ error: "追加に失敗" }))).error || "追加に失敗");
        }
    };

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
                            <React.Fragment key={r.id}>
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
                                {/* ★ 2段目：rules_json(JSON) エディタ */}
                                <TableRow className="align-top">
                                    <TableCell className="px-1 py-1" colSpan={5}>
                                        <div className="text-[11px] text-muted-foreground pb-1">rules_json(JSON)</div>
                                        <Textarea
                                            className="h-20"
                                            value={r._rules_text ?? JSON.stringify(r.rules_json ?? {}, null, 2)}
                                            onChange={(e) => handleEditRulesL(r.id, e.target.value)}
                                        />
                                    </TableCell>
                                </TableRow>
                            </React.Fragment>
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
                        {/* ★ 追加行（2段目：rules_json） */}
                        <TableRow className="align-top">
                            <TableCell className="px-1 py-1" colSpan={5}>
                                <div className="text-[11px] text-muted-foreground pb-1">rules_json(JSON)</div>
                                <Textarea
                                    className="h-20"
                                    value={newRow._rules_text ?? "{}"}
                                    onChange={(e) => handleEditNewRulesL(e.target.value)}
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

void TabL

// ====== 小カテゴリ（S）タブ ======
function TabS(): React.ReactElement {
    type RowS = ShiftRecordCategoryS & { _rules_text?: string };

    const [rows, setRows] = useState<RowS[]>([]);

    const initialNewRowS: Omit<RowS, "id"> = {
        l_id: "",
        code: "",
        name: "",
        sort_order: 1000,
        active: true,
        rules_json: null,
        _rules_text: "{}",
    };
    const [newRow, setNewRow] = useState<Omit<RowS, "id">>(initialNewRowS);

    const [cats, setCats] = useState<ShiftRecordCategoryL[]>([])
    const [q, setQ] = useState("")
    const [qL, setQL] = useState<string>("")

    const fetchAll = async () => {
        const [s1, s2] = await Promise.all([
            fetch("/api/shift-record-def/category-s"),
            fetch("/api/shift-record-def/category-l"),
        ]);
        if (s1.ok) {
            const arr: ShiftRecordCategoryS[] = await s1.json()
            setRows(arr.map(x => ({
                ...x,
                _rules_text: JSON.stringify(x.rules_json ?? {}, null, 2),
            })))
        }

        if (s2.ok) setCats(await s2.json());
    };
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

    const handleEdit = <K extends keyof RowS>(id: RowS["id"], key: K, val: RowS[K]) => {
        setRows(prev => prev.map(r => (r.id === id ? { ...r, [key]: val } : r)));
    };

    // 既存行の rules_json テキストを更新
    const handleEditRulesS = (id: string, text: string) => {
        setRows(prev =>
            prev.map(r => (r.id === id ? { ...r, _rules_text: text } : r))
        );
    };

    // 新規行の rules_json テキストを更新
    const handleEditNewRulesS = (text: string) => {
        setNewRow(prev => ({ ...prev, _rules_text: text }));
    };

    // JSON 文字列を安全に parse（失敗時は alert して例外投げ）
    const parseRulesOrEmpty = (text?: string) => {
        if (!text || !text.trim()) return {};
        try {
            return JSON.parse(text);
        } catch (err) {
            alert("rules_json が JSON ではありません");
            throw err;
        }
    };

    // TabS 冒頭で宣言済: type RowS = ShiftRecordCategoryS & { _rules_text?: string };
    const save = async (row: RowS) => {
        const { _rules_text, ...rest } = row;
        let rulesParsed: Record<string, unknown> = {};
        try { rulesParsed = _rules_text ? JSON.parse(_rules_text) : {}; }
        catch { alert("rules_json がJSONではありません"); return; }

        await fetch(`/api/shift-record-def/category-s/${row.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...rest, rules_json: rulesParsed }),
        });
    }

    const del = async (id: string) => {
        const r = await fetch(`/api/shift-record-def/category-s/${id}`, { method: "DELETE" })
        if (r.ok) { await fetchAll(); alert("削除しました") } else {
            alert((await r.json().catch(() => ({ error: "削除に失敗" }))).error || "削除に失敗")
        }
    }
    const add = async () => {
        // 必須チェック
        if (!newRow?.l_id || !newRow?.code || !newRow?.name) {
            alert("l_id / code / name は必須です");
            return;
        }

        // rules_json を parse
        let rulesParsed: Record<string, unknown> = {};
        try {
            rulesParsed = parseRulesOrEmpty(newRow._rules_text);
        } catch {
            return; // parse 失敗時は中断
        }

        // 送信ペイロードを明示的に構築
        const payload = {
            l_id: newRow.l_id,
            code: newRow.code.trim(),
            name: newRow.name.trim(),
            sort_order: newRow.sort_order ?? 1000,
            active: newRow.active ?? true,
            rules_json: rulesParsed,
        };

        // POST
        const resp = await fetch("/api/shift-record-def/category-s", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        if (resp.ok) {
            // フォームを初期化（l_id は保持したい場合は残してOK）
            setNewRow(prev => ({
                ...prev,             // l_id を維持
                code: "",
                name: "",
                sort_order: 1000,
                active: true,
                _rules_text: "{}",
            }));


            await fetchAll();
            alert("追加しました");
        } else {
            let msg = "追加に失敗しました";
            try {
                const j = await resp.json();
                msg = j?.error || msg;
            } catch { }
            alert(msg);
        }
    };

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
                            <React.Fragment key={r.id}>
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
                                {/* ★ 2段目：rules_json */}
                                <TableRow className="align-top">
                                    <TableCell className="px-1 py-1" colSpan={2}>
                                        <div className="text-[11px] text-muted-foreground pb-1">rules_json(JSON)</div>
                                        <Textarea
                                            className="h-20"
                                            value={r._rules_text ?? JSON.stringify(r.rules_json ?? {}, null, 2)}
                                            onChange={(e) => handleEditRulesS(r.id, e.target.value)}
                                        />
                                    </TableCell>

                                </TableRow>
                            </React.Fragment>
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
                        {/* ★ 追加行（2段目） */}
                        <TableRow className="align-top">
                            <TableCell className="px-1 py-1" colSpan={6}>
                                <div className="text-[11px] text-muted-foreground pb-1">rules_json(JSON)</div>
                                <Textarea
                                    className="h-24"
                                    value={newRow._rules_text ?? "{}"}
                                    onChange={(e) => handleEditNewRulesS(e.target.value)}
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
            setRows(arr.map(x => ({
                ...x,
                _options_text: JSON.stringify(x.options ?? {}, null, 2),
                _default_text:
                    x.default_value == null
                        ? ""
                        : (typeof x.default_value === "string"
                            ? x.default_value
                            : JSON.stringify(x.default_value)),
                _rules_text: JSON.stringify(x.rules_json ?? {}, null, 2),
                _meta_text: JSON.stringify(x.meta_json ?? {}, null, 2),
            })))
        }
        if (l.ok) setCatsL(await l.json())
        if (s.ok) setCatsS(await s.json())
    }
    useEffect(() => { fetchAll() }, [])

    // TabDefs 内だけに置く（rows は item 定義の配列）
    const filtered = useMemo(() => {
        const k = q.trim().toLowerCase()

        // S の sort_order を参照するマップ
        const sOrderMap = new Map(catsS.map(s => [s.id, s.sort_order]))
        const sVal = (id?: string | null) =>
            id ? (sOrderMap.get(id) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER

        return rows
            .filter((x) => {
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
            // 並び順：S.sort_order → item.sort_order → code（すべて昇順）
            .sort((a, b) => {
                const sa = sVal(a.s_id)
                const sb = sVal(b.s_id)
                if (sa !== sb) return sa - sb              // S.sort_order 昇順

                const ia = Number(a.sort_order ?? 0)
                const ib = Number(b.sort_order ?? 0)
                if (ia !== ib) return ia - ib              // item.sort_order 昇順

                return a.code.localeCompare(b.code)        // タイブレーク
            })
    }, [rows, q, qL, qS, catsS])

    const { setPage, totalPages, pageClamped, start, pageRows } = usePager(filtered)

    const handleEdit = (id: string, patch: Partial<WithOptionsText>) => {
        setRows((prev) => prev.map((r) => (r.id === id ? ({ ...r, ...patch }) : r)))
    }

    // save() 内：_default_text を default_value に反映
    const save = async (row: WithOptionsText) => {
        const { _options_text, _default_text, _rules_text, _meta_text, ...rest } = row
        let optionsParsed: Record<string, unknown> = {}
        try { optionsParsed = _options_text ? JSON.parse(_options_text) : {} }
        catch { alert("options がJSONではありません"); return }

        let rulesParsed: Record<string, unknown> = {}
        try { rulesParsed = _rules_text ? JSON.parse(_rules_text) : {} }
        catch { alert("rules_json がJSONではありません"); return }

        let metaParsed: Record<string, unknown> = {}
        try { metaParsed = _meta_text ? JSON.parse(_meta_text) : {} }
        catch { alert("meta_json がJSONではありません"); return }

        const payload: ShiftRecordItemDef = {
            ...(rest as ShiftRecordItemDef),
            options: optionsParsed,
            default_value: parseDefaultText(_default_text),
            rules_json: rulesParsed,
            meta_json: metaParsed,
        }

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

        let rulesParsed: Record<string, unknown> = {}
        try { rulesParsed = draft._rules_text ? JSON.parse(draft._rules_text) : {} }
        catch { alert("rules_json がJSONではありません"); return }

        let metaParsed: Record<string, unknown> = {}
        try { metaParsed = draft._meta_text ? JSON.parse(draft._meta_text) : {} }
        catch { alert("meta_json がJSONではありません"); return }


        const payloadAdd: ItemDefCreate & {
            rules_json?: Record<string, unknown>
            meta_json?: Record<string, unknown>
        } = {
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
            rules_json: rulesParsed,
            meta_json: metaParsed,
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
                <div className="sm:col-span-2">
                    <div className="text-[11px] text-muted-foreground">検索（code / label / unit / input_type）</div>
                    <Input className="h-8" value={q} onChange={(e) => setQ(e.target.value)} placeholder="vital_temp / 体温 / ℃ など" />
                </div>
                <div className="sm:justify-self-end">
                    <Button size="sm" variant="secondary" onClick={() => { setQ(""); setQL(""); setQS("") }}>クリア</Button>
                </div>
            </div>

            <div className="overflow-x-auto">
                <Table className="w-full table-fixed">
                    {/* TabDefs 内 Table の colgroup を置き換え */}
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
                        <TableRow>
                            <TableCell colSpan={10}>
                                <details className="group text-xs">
                                    <summary className="cursor-pointer select-none leading-6 hover:opacity-80">
                                        ▼ display の options(JSON) ヘルプ
                                    </summary>

                                    <div className="mt-2 hidden group-open:block">
                                        <div className="border rounded-lg bg-white p-2 max-h-64 overflow-auto">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">

                                                {/* ① テンプレ置換（基本） */}
                                                <section className="border rounded p-2 bg-gray-50">
                                                    <div className="font-medium mb-1">① テンプレ置換（基本）</div>
                                                    <p className="text-[11px] text-muted-foreground mb-1">
                                                        {"{{key}}"} は Shift 情報のフィールド名。未定義/空文字は空として扱われ、display 項目は「—」を表示します。
                                                    </p>
                                                    <pre className="bg-white border rounded p-2 text-[11px] whitespace-pre-wrap break-words">
                                                        {`{ "template": "利用者: {{client_name}}" }`}
                                                    </pre>
                                                </section>

                                                {/* ② 時刻は “分まで” の派生キーを利用 */}
                                                <section className="border rounded p-2 bg-gray-50">
                                                    <div className="font-medium mb-1">② 時刻は “分まで”</div>
                                                    <p className="text-[11px] text-muted-foreground mb-1">
                                                        API が <code>shift_start_time_hm</code> / <code>shift_end_time_hm</code> を返します（<code>HH:MM</code>）。
                                                    </p>
                                                    <pre className="bg-white border rounded p-2 text-[11px] whitespace-pre-wrap break-words">
                                                        {`{ "template": "{{shift_start_date}} {{shift_start_time_hm}} ~ {{shift_end_time_hm}}" }`}
                                                    </pre>
                                                </section>

                                                {/* ③ 参照配列（連結） */}
                                                <section className="border rounded p-2 bg-gray-50">
                                                    <div className="font-medium mb-1">③ 参照配列（連結）</div>
                                                    <p className="text-[11px] text-muted-foreground mb-1">
                                                        <code>ref</code> の順で値を取り出し、スペース区切りで結合します。存在するキーのみ連結。
                                                    </p>
                                                    <pre className="bg-white border rounded p-2 text-[11px] whitespace-pre-wrap break-words">
                                                        {`{ "ref": ["client_name", "service_code"] }`}
                                                    </pre>
                                                </section>

                                                {/* ④ ラベル合成 + unit */}
                                                <section className="border rounded p-2 bg-gray-50">
                                                    <div className="font-medium mb-1">④ ラベル合成 + unit</div>
                                                    <p className="text-[11px] text-muted-foreground mb-1">
                                                        見出し（label）は固定テキスト、値の表示は <code>template/ref</code> で制御。末尾の単位は item 定義の <code>unit</code> で付加できます。
                                                    </p>
                                                    <pre className="bg-white border rounded p-2 text-[11px] whitespace-pre-wrap break-words">
                                                        {`{ "template": "{{client_name}} 様" }`}
                                                    </pre>
                                                </section>

                                                {/* ⑤ よくある落とし穴 */}
                                                <section className="border rounded p-2 bg-gray-50 md:col-span-2">
                                                    <div className="font-medium mb-1">⑤ よくある落とし穴</div>
                                                    <ul className="list-disc pl-5 text-[11px] text-muted-foreground space-y-1">
                                                        <li><code>{`{{client_name}}`}</code> で空なら「—」。供給は <code>ShiftCard → link クエリ</code> か API のフォールバックで安定。</li>
                                                        <li><code>{`{{ }}`}</code> の内側の空白は無視されます（<code>{`{{ client_name }}`}</code> でもOK）。</li>
                                                        <li>未知キーは空文字扱い（= 表示されない）。</li>
                                                        <li>時間の秒を消すには派生キー <code>_hm</code> を使う。</li>
                                                    </ul>
                                                </section>

                                            </div>
                                        </div>
                                    </div>
                                </details>
                            </TableCell>
                        </TableRow>
                        {pageRows.map((r) => (
                            <React.Fragment key={r.id}>
                                {/* 1行目：基本項目 + sort + 操作 */}
                                <TableRow className="border-b">
                                    {/* L */}
                                    <TableCell className="px-1 py-1">
                                        <Select value={r.l_id ?? ""} onValueChange={(v) => handleEdit(r.id, { l_id: v || null })}>
                                            <SelectTrigger><SelectValue placeholder="(null)" /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="">(null)</SelectItem>
                                                {catsL.map((c) => (<SelectItem key={c.id} value={c.id}>{c.name} ({c.code})</SelectItem>))}
                                            </SelectContent>
                                        </Select>
                                    </TableCell>

                                    {/* S */}
                                    <TableCell className="px-1 py-1">
                                        <Select value={r.s_id ?? ""} onValueChange={(v) => handleEdit(r.id, { s_id: v || null })}>
                                            <SelectTrigger><SelectValue placeholder="(null)" /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="">(null)</SelectItem>
                                                {catsS.filter(s => !r.l_id || s.l_id === r.l_id).map((s) => (
                                                    <SelectItem key={s.id} value={s.id}>{nameL(s.l_id)} / {s.name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </TableCell>
                                    <TableCell className="px-1 py-1">
                                        <Input className="h-8" value={r.code} onChange={(e) => handleEdit(r.id, { code: e.target.value })} />
                                    </TableCell>
                                    <TableCell className="px-1 py-1">
                                        <Input className="h-8" value={r.label} onChange={(e) => handleEdit(r.id, { label: e.target.value })} />
                                    </TableCell>
                                    {/* type */}
                                    <TableCell className="px-1 py-1">
                                        <Select value={r.input_type} onValueChange={(v) => handleEdit(r.id, { input_type: v as InputType })}>
                                            <SelectTrigger><SelectValue placeholder="" /></SelectTrigger>
                                            <SelectContent>
                                                {INPUT_TYPES.map(t => (<SelectItem key={t} value={t}>{t}</SelectItem>))}
                                            </SelectContent>
                                        </Select>
                                    </TableCell>
                                    <TableCell className="px-1 py-1">
                                        <Input className="h-8" value={r.unit ?? ""} onChange={(e) => handleEdit(r.id, { unit: e.target.value || null })} />
                                    </TableCell>
                                    {/* req */}
                                    <TableCell className="px-1 py-1">
                                        <Select value={String(r.required ? 1 : 0)} onValueChange={(v) => handleEdit(r.id, { required: v === "1" })}>
                                            <SelectTrigger><SelectValue placeholder="" /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="1">true</SelectItem>
                                                <SelectItem value="0">false</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </TableCell>
                                    {/* active */}
                                    <TableCell className="px-1 py-1">
                                        <Select value={String(r.active ? 1 : 0)} onValueChange={(v) => handleEdit(r.id, { active: v === "1" })}>
                                            <SelectTrigger><SelectValue placeholder="" /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="1">true</SelectItem>
                                                <SelectItem value="0">false</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </TableCell>

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

                                {/* 2行目：options + rules_json + meta_json + default_value */}
                                <TableRow className="border-b align-top">
                                    {/* options */}
                                    <TableCell className="px-1 py-1" colSpan={4}>
                                        <div className="text-[11px] text-muted-foreground pb-1">options(JSON)</div>
                                        <Textarea
                                            className="h-20"
                                            value={r._options_text ?? JSON.stringify(r.options ?? {}, null, 2)}
                                            onChange={(e) => handleEdit(r.id, { _options_text: e.target.value })}
                                        />
                                    </TableCell>

                                    {/* ★ rules_json */}
                                    <TableCell className="px-1 py-1" colSpan={2}>
                                        <div className="text-[11px] text-muted-foreground pb-1">rules_json(JSON)</div>
                                        <Textarea
                                            className="h-20"
                                            value={r._rules_text ?? JSON.stringify(r.rules_json ?? {}, null, 2)}
                                            onChange={(e) => handleEdit(r.id, { _rules_text: e.target.value })}
                                            placeholder={`{\n  "when": { "service_code": { "includes": "身" } },\n  "set": { "active": false }\n}`}
                                        />
                                    </TableCell>

                                    {/* ★ meta_json */}
                                    <TableCell className="px-1 py-1" colSpan={2}>
                                        <div className="text-[11px] text-muted-foreground pb-1">meta_json(JSON)</div>
                                        <Textarea
                                            className="h-20"
                                            value={r._meta_text ?? JSON.stringify(r.meta_json ?? {}, null, 2)}
                                            onChange={(e) => handleEdit(r.id, { _meta_text: e.target.value })}
                                            placeholder={`{\n  "notify": {\n    "enabled": true,\n    "when": { "equals": "1" },\n    "target": "client"\n  }\n}`}
                                        />
                                    </TableCell>

                                    {/* default_value（据え置き） */}
                                    <TableCell className="px-1 py-1" colSpan={2}>
                                        <div className="text-[11px] text-muted-foreground pb-1">default_value</div>
                                        <Input
                                            className="h-8"
                                            value={r._default_text ?? ""}
                                            onChange={(e) => handleEdit(r.id, { _default_text: e.target.value })}
                                            placeholder='"1" / "none" / ["a","b"]'
                                        />
                                        <div className="text-[10px] text-muted-foreground mt-1">
                                            文字列は <code>{`"..."`}</code>、配列は JSON（例: <code>{`["a","b"]`}</code>）。空は未設定。
                                        </div>
                                    </TableCell>
                                </TableRow>

                            </React.Fragment>
                        ))}
                        {/* 追加行 1段目 */}
                        <TableRow className="border-b">
                            {/* L */}
                            <TableCell className="px-1 py-1">
                                <Select value={newRow.l_id ?? ""} onValueChange={(v) => setNewRow({ ...newRow, l_id: v || null })}>
                                    <SelectTrigger><SelectValue placeholder="(null)" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="">(null)</SelectItem>
                                        {catsL.map((c) => (<SelectItem key={c.id} value={c.id}>{c.name} ({c.code})</SelectItem>))}
                                    </SelectContent>
                                </Select>
                            </TableCell>

                            {/* S */}
                            <TableCell className="px-1 py-1">
                                <Select value={newRow.s_id ?? ""} onValueChange={(v) => setNewRow({ ...newRow, s_id: v || null })}>
                                    <SelectTrigger><SelectValue placeholder="(null)" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="">(null)</SelectItem>
                                        {catsS.filter(s => !newRow.l_id || s.l_id === newRow.l_id).map((s) => (
                                            <SelectItem key={s.id} value={s.id}>{nameL(s.l_id)} / {s.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </TableCell>
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
                            {/* type */}
                            <TableCell className="px-1 py-1">
                                <Select value={(newRow.input_type ?? "text") as InputType} onValueChange={(v) => setNewRow({ ...newRow, input_type: v as InputType })}>
                                    <SelectTrigger><SelectValue placeholder="" /></SelectTrigger>
                                    <SelectContent>
                                        {INPUT_TYPES.map(t => (<SelectItem key={t} value={t}>{t}</SelectItem>))}
                                    </SelectContent>
                                </Select>
                            </TableCell>
                            {/* unit（参照ミス修正） */}
                            <TableCell className="px-1 py-1">
                                <Input
                                    className="h-8"
                                    value={newRow.unit ?? ""}
                                    onChange={(e) => setNewRow({ ...newRow, unit: e.target.value || null })}
                                    placeholder="℃ など"
                                />
                            </TableCell>
                            {/* req */}
                            <TableCell className="px-1 py-1">
                                <Select value={String(newRow.required ? 1 : 0)} onValueChange={(v) => setNewRow({ ...newRow, required: v === "1" })}>
                                    <SelectTrigger><SelectValue placeholder="false" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="1">true</SelectItem>
                                        <SelectItem value="0">false</SelectItem>
                                    </SelectContent>
                                </Select>
                            </TableCell>
                            {/* active */}
                            <TableCell className="px-1 py-1">
                                <Select value={String(newRow.active === false ? 0 : 1)} onValueChange={(v) => setNewRow({ ...newRow, active: v === "1" })}>
                                    <SelectTrigger><SelectValue placeholder="true" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="1">true</SelectItem>
                                        <SelectItem value="0">false</SelectItem>
                                    </SelectContent>
                                </Select>
                            </TableCell>
                            <TableCell className="px-1 py-1">
                                <Input className="h-8" type="number" value={newRow.sort_order ?? 1000}
                                    onChange={(e) => setNewRow({ ...newRow, sort_order: Number(e.target.value) })} />
                            </TableCell>
                            <TableCell className="px-1 py-1">
                                <Button size="sm" onClick={add}>追加</Button>
                            </TableCell>
                        </TableRow>

                        {/* 追加行 2段目：options + rules_json + meta_json + default_value */}
                        <TableRow className="border-b align-top">
                            <TableCell className="px-1 py-1" colSpan={4}>
                                <div className="text-[11px] text-muted-foreground pb-1">options(JSON)</div>
                                <Textarea
                                    className="h-20"
                                    value={newRow._options_text ?? "{}"}
                                    onChange={(e) => setNewRow({ ...newRow, _options_text: e.target.value })}
                                />
                            </TableCell>
                            <TableCell className="px-1 py-1" colSpan={2}>
                                <div className="text-[11px] text-muted-foreground pb-1">rules_json(JSON)</div>
                                <Textarea
                                    className="h-20"
                                    value={newRow._rules_text ?? "{}"}
                                    onChange={(e) => setNewRow({ ...newRow, _rules_text: e.target.value })}
                                />
                            </TableCell>
                            <TableCell className="px-1 py-1" colSpan={2}>
                                <div className="text-[11px] text-muted-foreground pb-1">meta_json(JSON)</div>
                                <Textarea
                                    className="h-20"
                                    value={newRow._meta_text ?? "{}"}
                                    onChange={(e) => setNewRow({ ...newRow, _meta_text: e.target.value })}
                                />
                            </TableCell>
                            <TableCell className="px-1 py-1" colSpan={2}>
                                <div className="text-[11px] text-muted-foreground pb-1">default_value</div>
                                <Input
                                    className="h-8"
                                    value={newRow._default_text ?? ""}
                                    onChange={(e) => setNewRow({ ...newRow, _default_text: e.target.value })}
                                    placeholder='"1" / "none" / ["a","b"]'
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

// 文字列→default_value 変換（"1"→数値, ["a","b"]→配列, それ以外は文字列）
function parseDefaultText(s?: string): unknown {
    const t = (s ?? "").trim()
    if (!t) return null
    if (t.startsWith("[") || t.startsWith("{")) {
        try { return JSON.parse(t) } catch { return t }
    }
    if (/^-?\\d+(?:\\.\\d+)?$/.test(t)) return Number(t)
    if (t === "true" || t === "false") return t === "true"
    return t
}