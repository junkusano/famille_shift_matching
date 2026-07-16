// src/app/portal/event-tasks/page.tsx
"use client";

import {
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Select, SelectItem } from "@/components/ui/select";
import { supabase } from "@/lib/supabaseClient";
import type {
    EventTaskMetaResponse,
    EventTaskStatus,
    EventTaskView,
    RequiredDocStatus,
    UpdateEventTaskPayload,
} from "@/types/eventTasks";

type ApiTasksResponse = {
    tasks: EventTaskView[];
    pagination: Pagination;
};

type ApiErrorBody = { message?: string };

type Pagination = {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
};

function errMsg(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
}

async function fetchWithAuth(
    input: RequestInfo,
    init: RequestInit = {}
) {
    const { data, error: sessionError } =
        await supabase.auth.getSession();

    if (sessionError) {
        throw new Error(
            `ログイン情報の取得に失敗しました: ${sessionError.message}`
        );
    }

    const token = data.session?.access_token;

    if (!token) {
        throw new Error(
            "ログイン情報を確認できませんでした。再ログインしてください。"
        );
    }

    const res = await fetch(input, {
        ...init,
        cache: "no-store",
        headers: {
            ...(init.headers ?? {}),
            ...(init.body
                ? { "Content-Type": "application/json" }
                : {}),
            Authorization: `Bearer ${token}`,
        },
        credentials: "same-origin",
    });

    if (res.status === 401) {
        throw new Error(
            "ログインが切れました。再ログインしてください。"
        );
    }

    if (res.status === 403) {
        throw new Error(
            "このページを利用する権限がありません。"
        );
    }

    if (!res.ok) {
        const contentType =
            res.headers.get("content-type") ?? "";

        let message =
            `API error: ${res.status} ${res.statusText}`;

        if (contentType.includes("application/json")) {
            const body = (await res.json().catch(() => null)) as
                | ApiErrorBody
                | null;

            if (body?.message) {
                message = body.message;
            }
        } else {
            const text = await res.text().catch(() => "");

            if (text.trim()) {
                message = `${message}\n${text}`;
            }
        }

        throw new Error(message);
    }

    return res;
}

const TASK_STATUS: { value: EventTaskStatus; label: string }[] = [
    { value: "open", label: "open" },
    { value: "in_progress", label: "in_progress" },
    { value: "done", label: "done" },
    { value: "cancelled", label: "cancelled" },
    { value: "muted", label: "muted" },
];

const DOC_STATUS: { value: RequiredDocStatus; label: string }[] = [
    { value: "pending", label: "pending" },
    { value: "ok", label: "ok" },
    { value: "ng", label: "ng" },
    { value: "skipped", label: "skipped" },
];

function todayYmd() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
}

function addDaysYmd(baseYmd: string, deltaDays: number) {
    const [y, m, d] = baseYmd.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + deltaDays);
    const yyyy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    const dd = String(dt.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
}

export default function EventTasksPage() {
    const [meta, setMeta] = useState<EventTaskMetaResponse | null>(null);
    const [tasks, setTasks] = useState<EventTaskView[]>([]);

const [page, setPage] = useState(1);

const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: 50,
    total: 0,
    totalPages: 1,
});

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // filters
    const [statusFilter, setStatusFilter] = useState<string>("");
    const [dueFilter, setDueFilter] = useState<string>("");
    const [clientFilter, setClientFilter] = useState<string>("");
    const [userFilter, setUserFilter] = useState<string>("");
    const [sortColumn, setSortColumn] = useState<
    | "due_date"
    | "status"
    | "created_at"
    | "client"
    | "user"
>("due_date");

    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

    // create draft
    const [templateId, setTemplateId] = useState("");
    const [clientId, setClientId] = useState("");
    const [userId, setUserId] = useState<string>("");
    const [dueDate, setDueDate] = useState(todayYmd());
    const [memo, setMemo] = useState("");

    // edit
    const [editId, setEditId] = useState<string>("");
    const detailRef = useRef<HTMLDivElement | null>(null);
    const editTask = useMemo(() => tasks.find((t) => t.id === editId) ?? null, [tasks, editId]);
    const [addDocTypeId, setAddDocTypeId] = useState<string>("");
    const [addDocMemo, setAddDocMemo] = useState<string>("");

    function handleSort(
    column:
        | "due_date"
        | "status"
        | "created_at"
        | "client"
        | "user"
) {
        if (sortColumn === column) {
            setSortOrder((current) =>
                current === "asc" ? "desc" : "asc"
            );
        } else {
            setSortColumn(column);
            setSortOrder("asc");
        }

    setPage(1);
    }

    async function reload() {
    setLoading(true);
    setError(null);

    try {
        if (!meta) {
            const m = await fetchWithAuth(
                "/api/event-tasks/meta",
                { method: "GET" }
            ).then(
                (r) =>
                    r.json() as Promise<EventTaskMetaResponse>
            );

            setMeta(m);
        }

        const qs = new URLSearchParams();

    qs.set("page", String(page));
    qs.set("pageSize", "50");
    qs.set("sort", sortColumn);
    qs.set("order", sortOrder);

    if (statusFilter) {
        qs.set("status", statusFilter);
    }

        if (dueFilter) {
            qs.set("due", dueFilter);
        }

        if (clientFilter) {
    qs.set("client_id", clientFilter);
}

if (userFilter) {
    qs.set("user_id", userFilter);
}

        const res = await fetchWithAuth(
            `/api/event-tasks?${qs.toString()}`,
            { method: "GET" }
        );

        const j = (await res.json()) as ApiTasksResponse;

        setTasks(j.tasks ?? []);
        setPagination(j.pagination);
    } catch (e: unknown) {
        setError(errMsg(e));
    } finally {
        setLoading(false);
    }
}

    useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
    statusFilter,
    dueFilter,
    clientFilter,
    userFilter,
    sortColumn,
    sortOrder,
    page,
]);

    // template を選んだら due_date 初期値を offset 反映
    useEffect(() => {
        if (!meta) return;
        const tpl = meta.templates.find((t) => t.id === templateId);
        if (!tpl) return;

        const base = todayYmd();
        const offset = Number(tpl.due_offset_days ?? 0);
        setDueDate(addDaysYmd(base, offset));
    }, [templateId, meta]);

    async function onCreate() {
        setError(null);
        try {
            if (!templateId) throw new Error("テンプレートを選択してください");
            if (!clientId) throw new Error("利用者を選択してください");
            if (!dueDate) throw new Error("期日を入力してください");

            await fetchWithAuth("/api/event-tasks", {
                method: "POST",
                body: JSON.stringify({
                    template_id: templateId,
                    kaipoke_cs_id: clientId,
                    user_id: userId || null,
                    due_date: dueDate,
                    memo: memo || null,
                    status: "open",
                    // required_docs 未指定 → API側でテンプレからコピー
                }),
            });

            // reset
            setMemo("");
            setEditId("");
            await reload();
            alert("作成しました");
        } catch (e: unknown) {
            const m = errMsg(e);
            setError(m);
            alert(m);
        }
    }

    async function onUpdateTask(patch: UpdateEventTaskPayload) {
        if (!editTask) return;
        setError(null);
        try {
            await fetchWithAuth(`/api/event-tasks/${editTask.id}`, {
                method: "PUT",
                body: JSON.stringify(patch),
            });
            await reload();
            alert("更新しました");
        } catch (e: unknown) {
            const m = errMsg(e);
            setError(m);
            alert(m);
        }
    }
    async function onUpdateTaskStatusFromList(
    taskId: string,
    status: "open" | "done"
) {
    setError(null);

    try {
        await fetchWithAuth(`/api/event-tasks/${taskId}`, {
            method: "PUT",
            body: JSON.stringify({
                status,
            }),
        });

        await reload();
    } catch (e: unknown) {
        const message = errMsg(e);
        setError(message);
        alert(message);
    }
}

    async function onDeleteTask(hard = false) {
        if (!editTask) return;
        const ok = confirm(hard ? "タスク削除します。よろしいですか？" : "キャンセル（cancelled）にします。よろしいですか？");
        if (!ok) return;

        setError(null);
        try {
            await fetchWithAuth(`/api/event-tasks/${editTask.id}${hard ? "?hard=1" : ""}`, {
                method: "DELETE",
            });
            setEditId("");
            await reload();
            alert("削除しました");
        } catch (e: unknown) {
            const m = errMsg(e);
            setError(m);
            alert(m);
        }
    }

 //const canUse = meta?.admin ?? false;
const canUse = true;

const displayTasks = useMemo(() => {
    const list = [...tasks];

    // 利用者・担当だけ画面側でソート

    return list;
}, [tasks, sortColumn, sortOrder]);

if (sortColumn === "client") {
    displayTasks.sort((a, b) => {
        const av = a.client_name ?? "";
        const bv = b.client_name ?? "";

        return sortOrder === "asc"
            ? av.localeCompare(bv, "ja")
            : bv.localeCompare(av, "ja");
    });
}

if (sortColumn === "user") {
    displayTasks.sort((a, b) => {
        const av = a.assigned_user_name ?? "";
        const bv = b.assigned_user_name ?? "";

        return sortOrder === "asc"
            ? av.localeCompare(bv, "ja")
            : bv.localeCompare(av, "ja");
    });
}

return (
        <div className="p-6 space-y-6">
<div className="space-y-4">
    {/* タイトル行 */}
    <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">
            イベントタスク管理
        </h1>

        <Button
            variant="outline"
            onClick={reload}
            disabled={loading}
        >
            再読み込み
        </Button>
    </div>

    {/* 絞り込み行 */}
    <div className="rounded-lg border bg-white p-4">
        <div className="mb-3 text-sm font-semibold">
            絞り込み
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div className="space-y-1">
                <label className="text-sm font-medium">
                    期日
                </label>

                <Select
                    value={dueFilter}
                    onValueChange={(value) => {
                        setDueFilter(value);
                        setPage(1);
                    }}
                    placeholder="期日を選択"
                    disabled={loading}
                >
                    <SelectItem value="">すべて</SelectItem>
                    <SelectItem value="overdue">
                        期限切れ
                    </SelectItem>
                    <SelectItem value="today">
                        今日
                    </SelectItem>
                    <SelectItem value="week">
                        今週
                    </SelectItem>
                    <SelectItem value="month">
                        今月
                    </SelectItem>
                </Select>
            </div>

            <div className="space-y-1">
                <label className="text-sm font-medium">
                    ステータス
                </label>

                <Select
    value={statusFilter}
    onValueChange={(value) => {
        setStatusFilter(value);
        setPage(1);
    }}
    placeholder="ステータスを選択"
    disabled={loading}
>
    <SelectItem value="">すべて</SelectItem>

    <SelectItem value="open">
        open
    </SelectItem>

    <SelectItem value="done">
        done
    </SelectItem>
</Select>
            </div>
                        <div className="space-y-1">
                <label className="text-sm font-medium">
                    利用者
                </label>

                <Select
                    value={clientFilter}
                    onValueChange={(value) => {
                        setClientFilter(value);
                        setPage(1);
                    }}
                    placeholder="利用者を選択"
                    disabled={loading}
                >
                    <SelectItem value="">すべて</SelectItem>

                    {(meta?.clients ?? []).map((client) => (
                        <SelectItem
                            key={client.kaipoke_cs_id}
                            value={client.kaipoke_cs_id}
                        >
                            {client.name ?? client.kaipoke_cs_id}
                        </SelectItem>
                    ))}
                </Select>
            </div>
            <div className="space-y-1">
    <label className="text-sm font-medium">
        担当
    </label>

    <Select
        value={userFilter}
        onValueChange={(value) => {
            setUserFilter(value);
            setPage(1);
        }}
        placeholder="担当を選択"
        disabled={loading}
    >
        <SelectItem value="">
            すべて
        </SelectItem>

        {Array.from(
            new Map(
                (tasks ?? [])
                    .filter((t) => t.assigned_user_name)
                    .map((t) => [
                        t.user_id ??
                            t.assigned_user_name!,
                        {
                            id:
                                t.user_id ??
                                t.assigned_user_name!,
                            name:
                                t.assigned_user_name!,
                        },
                    ])
            ).values()
        ).map((user) => (
            <SelectItem
                key={user.id}
                value={user.id}
            >
                {user.name}
            </SelectItem>
        ))}
    </Select>
</div>
        </div>
     </div>
</div>

{error && (
    <div className="text-sm text-red-600">
        {error}
    </div>
)}

            {/* 新規作成 */}
            <Card>
                <CardHeader>
                    <CardTitle>新規作成</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        <div className="md:col-span-2">
                            <Select
                                value={templateId}
                                onValueChange={setTemplateId}
                                placeholder="テンプレート選択"
                                disabled={!canUse || loading}
                            >
                                {(meta?.templates ?? [])
                                    .filter((t) => t.is_active)
                                    .map((t) => (
                                        <SelectItem key={t.id} value={t.id}>
                                            {!t.is_active ? `（inactive）${t.template_name}` : t.template_name}
                                        </SelectItem>
                                    ))}
                            </Select>
                        </div>

                        <div className="md:col-span-2">
                            <div className="md:col-span-2">
                                <Select
                                    value={clientId}
                                    onValueChange={setClientId}
                                    placeholder="利用者選択"
                                    disabled={!canUse || loading}
                                >
                                    {(meta?.clients ?? []).map((c) => (
                                        <SelectItem key={c.kaipoke_cs_id} value={c.kaipoke_cs_id}>
                                            {c.name}（{c.kaipoke_cs_id}）
                                        </SelectItem>
                                    ))}
                                </Select>
                            </div>

                        </div>

                        <div className="md:col-span-2">
                            <Select
                                value={userId}
                                onValueChange={setUserId}
                                placeholder="担当者（任意）"
                                disabled={!canUse || loading}
                            >
                                <SelectItem value="">(未指定)</SelectItem>
                                {(meta?.users ?? []).map((u) => (
                                    <SelectItem key={u.user_id} value={u.user_id}>
                                        {u.name}（{u.user_id}）
                                    </SelectItem>
                                ))}
                            </Select>
                        </div>

                        <div className="md:col-span-1">
                            <Input
                                type="date"
                                value={dueDate}
                                onChange={(e) => setDueDate(e.target.value)}
                                disabled={!canUse || loading}
                            />
                        </div>

                        <div className="md:col-span-4">
                            <Textarea
                                value={memo}
                                onChange={(e) => setMemo(e.target.value)}
                                placeholder="メモ（任意）"
                                disabled={!canUse || loading}
                            />
                        </div>
                    </div>

                    <div className="flex gap-2">
                        <Button onClick={onCreate} disabled={!canUse || loading}>
                            作成（テンプレから必要書類をコピー）
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* 一覧 */}
            <Card>
                <CardHeader>
                    <CardTitle>一覧（タスクをクリックすると詳細編集できます）</CardTitle>
                </CardHeader>
                <CardContent>

                    <Table>
                        <TableHeader>
    <TableRow>
        <TableHead>
            <button
                type="button"
                onClick={() => handleSort("due_date")}
                className="inline-flex items-center gap-1 font-medium hover:underline"
            >
                期日

                {sortColumn === "due_date" && (
                    <span aria-hidden="true">
                        {sortOrder === "asc" ? "▲" : "▼"}
                    </span>
                )}
            </button>
        </TableHead>

        <TableHead className="w-[150px]"> ステータス</TableHead>
        <TableHead>テンプレ</TableHead>
        <TableHead>
    <button
        type="button"
        onClick={() => handleSort("client")}
        className="inline-flex items-center gap-1 font-medium hover:underline"
    >
        利用者

        {sortColumn === "client" && (
            <span>
                {sortOrder === "asc" ? "▲" : "▼"}
            </span>
        )}
    </button>
</TableHead>
        <TableHead>
    <button
        type="button"
        onClick={() => handleSort("user")}
        className="inline-flex items-center gap-1 font-medium hover:underline"
    >
        担当

        {sortColumn === "user" && (
            <span>
                {sortOrder === "asc" ? "▲" : "▼"}
            </span>
        )}
    </button>
</TableHead>
        <TableHead className="min-w-[260px]">
            メモ
        </TableHead>

        <TableHead className="text-right">
            必要書類
        </TableHead>
    </TableRow>
</TableHeader>
<TableBody>
    {tasks.length === 0 ? (
        <TableRow>
            <TableCell
                colSpan={7}
                className="text-sm text-muted-foreground"
            >
                データがありません
            </TableCell>
        </TableRow>
    ) : (
        displayTasks.map((t) => {
            const statusBackground =
    t.status === "done"
        ? "bg-green-100 hover:bg-green-200"
        : t.status === "open"
            ? "bg-red-100 hover:bg-red-200"
            : "hover:bg-muted/50";

            return (
                <TableRow
                    key={t.id}
                    className={`
                        cursor-pointer
                        ${statusBackground}
                        ${
                            editId === t.id
                                ? "ring-2 ring-inset ring-blue-500"
                                : ""
                        }
                    `}
                    onClick={() => {
                        setEditId(t.id);

                        setTimeout(() => {
                            detailRef.current?.scrollIntoView({
                                behavior: "smooth",
                                block: "start",
                            });
                        }, 0);
                    }}
                >
                    <TableCell className="whitespace-nowrap">
                        {t.due_date}
                    </TableCell>

<TableCell
    className="w-[150px]"
    onClick={(event) => {
        event.stopPropagation();
    }}
>
    <button
        type="button"
        disabled={loading}
        onClick={() => {
            const nextStatus =
                t.status === "done" ? "open" : "done";

            void onUpdateTaskStatusFromList(
                t.id,
                nextStatus
            );
        }}
        className={`
            inline-flex
            min-w-[96px]
            items-center
            justify-center
            rounded-md
            px-3
            py-2
            text-sm
            font-semibold
            transition
            disabled:cursor-not-allowed
            disabled:opacity-50
            ${
                t.status === "done"
    ? "bg-green-600 text-white hover:bg-green-700"
    : "bg-red-600 text-white hover:bg-red-700"
            }
        `}
    >
        {t.status === "done" ? "done" : "open"}
    </button>
</TableCell>

                    <TableCell>
                        {t.template_name ?? t.template_id}
                    </TableCell>

                    <TableCell>
                        {t.client_name ?? t.kaipoke_cs_id}
                    </TableCell>

                    <TableCell>
                        {t.assigned_user_name ??
                            t.user_id ??
                            "-"}
                    </TableCell>

                    <TableCell className="min-w-[260px]">
                        <div
                            className="
                                max-h-20
                                min-w-[240px]
                                max-w-[360px]
                                overflow-y-auto
                                whitespace-pre-wrap
                                break-words
                                rounded-md
                                border
                                bg-white/70
                                p-2
                                text-sm
                            "
                            onClick={(event) => {
                                event.stopPropagation();
                            }}
                        >
                            {t.memo?.trim() || "-"}
                        </div>
                    </TableCell>

                     <TableCell className="text-right">
                        {t.required_docs?.length ?? 0}
                    </TableCell>
                </TableRow>
            );
        })
    )}
</TableBody>
</Table>

<div className="mt-4 flex items-center justify-center gap-4">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() =>
                                setPage((current) =>
                                    Math.max(1, current - 1)
                                )
                            }
                            disabled={loading || page <= 1}
                        >
                            前へ
                        </Button>

                        <div className="text-sm">
                            {pagination.page} / {pagination.totalPages}ページ
                            （全{pagination.total}件）
                        </div>

                        <Button
                            type="button"
                            variant="outline"
                            onClick={() =>
                                setPage((current) =>
                                    Math.min(
                                        pagination.totalPages,
                                        current + 1
                                    )
                                )
                            }
                            disabled={
                                loading ||
                                page >= pagination.totalPages
                            }
                        >
                            次へ
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* 詳細/編集 */}
            {editTask && (
    <div ref={detailRef}>
        <Card>
                    <CardHeader>
                        <CardTitle>詳細 / 編集</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                            <div className="md:col-span-2">
                                <div className="text-sm text-muted-foreground">テンプレ</div>
                                <div className="font-medium">{editTask.template_name ?? editTask.template_id}</div>
                            </div>
                            <div className="md:col-span-2">
                                <div className="text-sm text-muted-foreground">利用者</div>
                                <div className="font-medium">{editTask.client_name ?? editTask.kaipoke_cs_id}</div>
                            </div>

                            <div className="md:col-span-1">
                                <div className="text-sm text-muted-foreground">status</div>
                                <Select
                                    value={editTask.status}
                                    onValueChange={(v) => onUpdateTask({ status: v as EventTaskStatus })}
                                    disabled={!canUse || loading}
                                >
                                    {TASK_STATUS.map((s) => (
                                        <SelectItem key={s.value} value={s.value}>
                                            {s.label}
                                        </SelectItem>
                                    ))}
                                </Select>
                            </div>

                            <div className="md:col-span-1">
                                <div className="text-sm text-muted-foreground">期日</div>
                                <Input
                                    type="date"
                                    value={editTask.due_date}
                                    onChange={(e) => onUpdateTask({ due_date: e.target.value })}
                                    disabled={!canUse || loading}
                                />
                            </div>

                            <div className="md:col-span-2">
                                <div className="text-sm text-muted-foreground">担当者</div>
                                <Select
                                    value={editTask.user_id ?? ""}
                                    onValueChange={(v) => onUpdateTask({ user_id: v || null })}
                                    disabled={!canUse || loading}
                                >
                                    <SelectItem value="">(未指定)</SelectItem>
                                    {(meta?.users ?? []).map((u) => (
                                        <SelectItem key={u.user_id} value={u.user_id}>
                                            {u.name}（{u.user_id}）
                                        </SelectItem>
                                    ))}
                                </Select>
                            </div>

                            <div className="md:col-span-4">
                                <div className="text-sm text-muted-foreground">メモ</div>
                                <Textarea
                                    defaultValue={editTask.memo ?? ""}
                                    onBlur={(e) => onUpdateTask({ memo: e.target.value || null })}
                                    disabled={!canUse || loading}
                                />
                            </div>
                        </div>

                        <div className="flex gap-2">
                            <Button variant="outline" onClick={() => onDeleteTask(false)} disabled={!canUse || loading}>
                                キャンセル（cancelled）
                            </Button>
                            <Button variant="destructive" onClick={() => onDeleteTask(true)} disabled={!canUse || loading}>
                                タスク削除（hard）
                            </Button>
                        </div>

                        <div className="border-t pt-4">
                            <div className="font-medium mb-2">必要書類</div>
                            <div className="flex flex-col md:flex-row gap-2 mb-3">
                                <div className="md:w-[360px]">
                                    <Select
                                        value={addDocTypeId}
                                        onValueChange={setAddDocTypeId}
                                        placeholder="追加する書類を選択"
                                        disabled={!canUse || loading}
                                    >
                                        {(meta?.doc_types ?? []).map((d) => (
                                            <SelectItem key={d.id} value={d.id}>
                                                {d.name}
                                            </SelectItem>
                                        ))}
                                    </Select>
                                </div>

                                <div className="flex-1">
                                    <Input
                                        value={addDocMemo}
                                        onChange={(e) => setAddDocMemo(e.target.value)}
                                        placeholder="memo（任意）"
                                        disabled={!canUse || loading}
                                    />
                                </div>

                                <Button
                                    variant="outline"
                                    disabled={!canUse || loading || !addDocTypeId}
                                    onClick={() => {
                                        if (!editTask) return;

                                        const exists = (editTask.required_docs ?? []).some((x) => x.doc_type_id === addDocTypeId);
                                        if (exists) {
                                            alert("その書類は既に追加されています");
                                            return;
                                        }

                                        const next = [
                                            ...(editTask.required_docs ?? []),
                                            {
                                                id: `new-${addDocTypeId}`,
                                                event_task_id: editTask.id,
                                                doc_type_id: addDocTypeId,
                                                doc_type_name: (meta?.doc_types ?? []).find((x) => x.id === addDocTypeId)?.name ?? null,
                                                memo: addDocMemo || null,
                                                status: "pending" as const,
                                                result_doc_id: null,
                                                checked_at: null,
                                                checked_by_user_id: null,
                                                created_at: "",
                                                updated_at: "",
                                            },
                                        ];

                                        onUpdateTask({
                                            required_docs: next.map((x) => ({
                                                doc_type_id: x.doc_type_id,
                                                memo: x.memo,
                                                status: x.status,
                                                result_doc_id: x.result_doc_id,
                                            })),
                                        });

                                        setAddDocTypeId("");
                                        setAddDocMemo("");
                                    }}
                                >
                                    追加
                                </Button>
                            </div>

                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>書類</TableHead>
                                        <TableHead>status</TableHead>
                                        <TableHead>memo</TableHead>
                                        <TableHead className="text-right">操作</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {(editTask.required_docs ?? []).map((d) => (
                                        <TableRow key={d.id}>
                                            <TableCell>{d.doc_type_name ?? "（名称未設定）"}</TableCell>
                                            <TableCell className="w-[180px]">
                                                <Select
                                                    value={d.status}
                                                    onValueChange={(v) => {
                                                        const next = (editTask.required_docs ?? []).map((x) =>
                                                            x.id === d.id ? { ...x, status: v as RequiredDocStatus } : x
                                                        );
                                                        onUpdateTask({
                                                            required_docs: next.map((x) => ({
                                                                doc_type_id: x.doc_type_id,
                                                                memo: x.memo,
                                                                status: x.status,
                                                                result_doc_id: x.result_doc_id,
                                                            })),
                                                        });
                                                    }}
                                                    disabled={!canUse || loading}
                                                >
                                                    {DOC_STATUS.map((s) => (
                                                        <SelectItem key={s.value} value={s.value}>
                                                            {s.label}
                                                        </SelectItem>
                                                    ))}
                                                </Select>
                                            </TableCell>
                                            <TableCell>
                                                <Input
                                                    defaultValue={d.memo ?? ""}
                                                    onBlur={(e) => {
                                                        const next = (editTask.required_docs ?? []).map((x) =>
                                                            x.id === d.id ? { ...x, memo: e.target.value || null } : x
                                                        );
                                                        onUpdateTask({
                                                            required_docs: next.map((x) => ({
                                                                doc_type_id: x.doc_type_id,
                                                                memo: x.memo,
                                                                status: x.status,
                                                                result_doc_id: x.result_doc_id,
                                                            })),
                                                        });
                                                    }}
                                                    disabled={!canUse || loading}
                                                />
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    disabled={!canUse || loading}
                                                    onClick={() => {
                                                        if (!editTask) return;
                                                        const ok = confirm("この書類を削除します。よろしいですか？");
                                                        if (!ok) return;

                                                        const next = (editTask.required_docs ?? []).filter((x) => x.doc_type_id !== d.doc_type_id);

                                                        onUpdateTask({
                                                            required_docs: next.map((x) => ({
                                                                doc_type_id: x.doc_type_id,
                                                                memo: x.memo,
                                                                status: x.status,
                                                                result_doc_id: x.result_doc_id,
                                                            })),
                                                        });
                                                    }}
                                                >
                                                    削除
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {!editTask.required_docs?.length && (
                                        <TableRow>
                                            <TableCell colSpan={4} className="text-sm text-muted-foreground">
                                                必要書類がありません
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>

                            <div className="text-xs text-muted-foreground mt-2">
                                ※ 自動判定（cs_docs などからOK/NG判定）は後続実装でOK。今は手動で status を更新します。
                            </div>
                        </div>
                         </CardContent>
            </Card>
        </div>
    )}

    </div>

);
}