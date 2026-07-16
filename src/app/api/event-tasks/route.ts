// src/app/api/event-tasks/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import { getUserFromBearer } from "@/lib/auth/getUserFromBearer";

import type {
    UpsertEventTaskPayload,
} from "@/types/eventTasks";

export const dynamic = "force-dynamic";

function bad(message: string, status = 400) {
    return NextResponse.json({ message }, { status });
}
type RequiredDocRow = {
    event_task_id: string;
    doc_type_id: string;
    completed: boolean | null;
    [key: string]: unknown;
};

type EventTaskRequiredDocView = RequiredDocRow & {
    doc_type_name: string | null;
};

function chunkArray<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];

    for (let i = 0; i < items.length; i += size) {
        chunks.push(items.slice(i, i + size));
    }

    return chunks;
}

export async function GET(req: NextRequest) {
    const { user } = await getUserFromBearer(req);

    if (!user) {
        return bad("Missing token", 401);
    }

    const { searchParams } = new URL(req.url);

const page = Math.max(
    1,
    Number(searchParams.get("page") ?? "1")
);

const pageSize = Math.min(
    100,
    Math.max(
        1,
        Number(searchParams.get("pageSize") ?? "50")
    )
);
const dueFilter = searchParams.get("due");
const clientFilter = searchParams.get("client_id");

const from = (page - 1) * pageSize;
const to = from + pageSize - 1;

    //const admin = await isAdminByAuthUserId(supabaseAdmin, user.id);
    //if (!admin) return bad("Forbidden", 403);

    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const template_id = url.searchParams.get("template_id");
    const kaipoke_cs_id = url.searchParams.get("kaipoke_cs_id");
    const due_from = url.searchParams.get("due_from");
    const due_to = url.searchParams.get("due_to");
    const sort = searchParams.get("sort") ?? "due_date";
    const order = searchParams.get("order") === "desc" ? "desc" : "asc";

    const allowedSortColumns = [
        "due_date",
        "status",
        "created_at",
    ] as const;

    const sortColumn = allowedSortColumns.includes(
        sort as (typeof allowedSortColumns)[number]
    )
        ? sort
        : "due_date";

    let q = supabaseAdmin
    .from("event_tasks")
    .select("*", { count: "exact" })
    .order(sortColumn, { ascending: order === "asc" })
    .range(from, to);

    if (status) q = q.eq("status", status);

    if (clientFilter) {
    q = q.eq("kaipoke_cs_id", clientFilter);
}

    const today = new Date();

const todayStr = today.toISOString().slice(0, 10);

if (dueFilter === "overdue") {
    q = q.lt("due_date", todayStr);
}

if (dueFilter === "today") {
    q = q.eq("due_date", todayStr);
}

if (dueFilter === "week") {
    const end = new Date(today);
    end.setDate(today.getDate() + 6);

    q = q
        .gte("due_date", todayStr)
        .lte("due_date", end.toISOString().slice(0, 10));
}

if (dueFilter === "month") {
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    q = q
        .gte("due_date", todayStr)
        .lte("due_date", end.toISOString().slice(0, 10));
}
    if (template_id) q = q.eq("template_id", template_id);
    if (kaipoke_cs_id) q = q.eq("kaipoke_cs_id", kaipoke_cs_id);
    if (due_from) q = q.gte("due_date", due_from);
    if (due_to) q = q.lte("due_date", due_to);

   const {
    data: tasks,
    error: tErr,
    count,
} = await q;

if (tErr) {
    console.error("[event-tasks][GET] tasks error", {
        message: tErr.message,
        details: tErr.details,
        hint: tErr.hint,
        code: tErr.code,
    });

    return NextResponse.json(
        {
            message: `タスクの取得に失敗しました: ${tErr.message}`,
            details: tErr.details,
            hint: tErr.hint,
            code: tErr.code,
        },
        { status: 500 }
    );
}

    const taskIds = Array.from(
    new Set(
        (tasks ?? [])
            .map((t) => t.id)
            .filter(
                (id): id is string =>
                    typeof id === "string" &&
                    id.trim().length > 0
            )
    )
);

const templateIds = Array.from(
    new Set(
        (tasks ?? [])
            .map((t) => t.template_id)
            .filter(
                (id): id is string =>
                    typeof id === "string" &&
                    id.trim().length > 0
            )
    )
);

const csIds = Array.from(
    new Set(
        (tasks ?? [])
            .map((t) => t.kaipoke_cs_id)
            .filter(
                (id): id is string =>
                    typeof id === "string" &&
                    id.trim().length > 0
            )
    )
);

const userIds = Array.from(
    new Set(
        (tasks ?? [])
            .map((t) => t.user_id)
            .filter(
                (id): id is string =>
                    typeof id === "string" &&
                    id.trim().length > 0
            )
    )
);

const templates: {
    id: string;
    template_name: string | null;
}[] = [];

const clients: {
    kaipoke_cs_id: string;
    name: string | null;
}[] = [];

const users: {
    user_id: string;
    last_name_kanji: string | null;
    first_name_kanji: string | null;
}[] = [];

const reqDocsRows: RequiredDocRow[] = [];

// 必要書類を100件ずつ取得
for (const ids of chunkArray(taskIds, 100)) {
    const { data, error } = await supabaseAdmin
        .from("event_task_required_docs")
        .select("*")
        .in("event_task_id", ids);

    if (error) {
        console.error("[event-tasks][GET] required docs error", {
            message: error.message,
            details: error.details,
            hint: error.hint,
            code: error.code,
            idCount: ids.length,
        });

        return NextResponse.json(
            {
                stage: "event_task_required_docs",
                message: `必要書類の取得に失敗しました: ${error.message}`,
                details: error.details,
                hint: error.hint,
                code: error.code,
            },
            { status: 500 }
        );
    }

    reqDocsRows.push(...((data ?? []) as RequiredDocRow[]));
}

// テンプレートを100件ずつ取得
for (const ids of chunkArray(templateIds, 100)) {
    const { data, error } = await supabaseAdmin
        .from("event_template")
        .select("id,template_name")
        .in("id", ids);

    if (error) {
        return NextResponse.json(
            {
                message: `テンプレートの取得に失敗しました: ${error.message}`,
                details: error.details,
                hint: error.hint,
                code: error.code,
            },
            { status: 500 }
        );
    }

    templates.push(...(data ?? []));
}

// 利用者を100件ずつ取得
for (const ids of chunkArray(csIds, 100)) {
    const { data, error } = await supabaseAdmin
        .from("cs_kaipoke_info")
        .select("kaipoke_cs_id,name")
        .in("kaipoke_cs_id", ids);

    if (error) {
        return NextResponse.json(
            {
                message: `利用者情報の取得に失敗しました: ${error.message}`,
                details: error.details,
                hint: error.hint,
                code: error.code,
            },
            { status: 500 }
        );
    }

    clients.push(...(data ?? []));
}

// 担当者を100件ずつ取得
for (const ids of chunkArray(userIds as string[], 100)) {
    const { data, error } = await supabaseAdmin
        .from("user_entry_united_view_single")
        .select("user_id,last_name_kanji,first_name_kanji")
        .in("user_id", ids);

    if (error) {
        return NextResponse.json(
            {
                message: `担当者情報の取得に失敗しました: ${error.message}`,
                details: error.details,
                hint: error.hint,
                code: error.code,
            },
            { status: 500 }
        );
    }

    users.push(...(data ?? []));
}
    // doc master 名称（user_doc_master は label が表示名）
    const docTypeIds = Array.from(new Set(reqDocsRows.map((d) => d.doc_type_id)));

    const { data: docMasters, error: dmErr } = docTypeIds.length
    ? await supabaseAdmin
        .from("user_doc_master")
        .select("id,label")
        .in("id", docTypeIds)
    : { data: [], error: null };

if (dmErr) {
    console.error("[event-tasks] user_doc_master error", dmErr);

    return NextResponse.json(
        {
            stage: "user_doc_master",
            message: dmErr.message,
            details: dmErr.details,
            hint: dmErr.hint,
            code: dmErr.code,
        },
        { status: 500 }
    );
}


    const docNameMap = new Map<string, string>(
        (docMasters ?? [])
            .filter((r) => typeof r.id === "string")
            .map((r) => [r.id as string, (r.label ?? r.id) as string])
    );

    // template / client / user 表示名Map
    const templateMap = new Map<string, string>(
        (templates ?? [])
            .filter((r) => typeof r.id === "string")
            .map((r) => [r.id as string, (r.template_name ?? r.id) as string])
    );

    const clientMap = new Map<string, string>(
        (clients ?? [])
            .filter((r) => typeof r.kaipoke_cs_id === "string")
            .map((r) => [r.kaipoke_cs_id as string, ((r as { name?: string | null }).name ?? r.kaipoke_cs_id) as string])
    );

    const userMap = new Map<string, string>(
        (users ?? [])
            .filter((r) => typeof r.user_id === "string")
            .map((r) => [
                r.user_id as string,
                `${(r as { last_name_kanji?: string | null }).last_name_kanji ?? ""}${(r as { first_name_kanji?: string | null }).first_name_kanji ?? ""}`.trim() ||
                (r.user_id as string),
            ])
    );


    const docsByTask = new Map<string, EventTaskRequiredDocView[]>();
    for (const d of reqDocsRows) {
        const arr = docsByTask.get(d.event_task_id) ?? [];
        arr.push({
            ...d,
            doc_type_name: docNameMap.get(d.doc_type_id) ?? null,
        });
        docsByTask.set(d.event_task_id, arr);
    }

    const result = (tasks ?? []).map((t) => ({
        ...t,
        template_name: templateMap.get(t.template_id) ?? null,
        client_name: clientMap.get(t.kaipoke_cs_id) ?? null,
        assigned_user_name: t.user_id ? userMap.get(t.user_id) ?? t.user_id : null,
        required_docs: (docsByTask.get(t.id) ?? []).sort((a, b) => (a.doc_type_name ?? "").localeCompare(b.doc_type_name ?? "")),
    }));

    return NextResponse.json({
    tasks: result,
    pagination: {
        page,
        pageSize,
        total: count ?? 0,
        totalPages: Math.max(
            1,
            Math.ceil((count ?? 0) / pageSize)
        ),
    },
});
}

export async function POST(req: NextRequest) {
    const { user } = await getUserFromBearer(req);
    if (!user) return bad("Missing token", 401);

    //const admin = await isAdminByAuthUserId(supabaseAdmin, user.id);
    //if (!admin) return bad("Forbidden", 403);

    const body = (await req.json().catch(() => null)) as UpsertEventTaskPayload | null;
    if (!body) return bad("Invalid JSON");
    if (!body.template_id) return bad("template_id is required");
    if (!body.kaipoke_cs_id) return bad("kaipoke_cs_id is required");
    if (!body.due_date) return bad("due_date is required");

    // 1) 親 insert
    const { data: inserted, error: insErr } = await supabaseAdmin
        .from("event_tasks")
        .insert({
            template_id: body.template_id,
            kaipoke_cs_id: body.kaipoke_cs_id,
            user_id: body.user_id ?? null,
            orgunitid: body.orgunitid ?? null,
            due_date: body.due_date,
            memo: body.memo ?? null,
            status: body.status ?? "open",
        })
        .select("*")
        .single();

    if (insErr) return NextResponse.json({ message: insErr.message }, { status: 500 });

    // 2) required_docs（未指定ならテンプレからコピー）
    let reqDocsPayload = body.required_docs ?? null;

    if (!reqDocsPayload) {
        const { data: tplDocs, error: tdErr } = await supabaseAdmin
            .from("event_template_required_docs")
            .select("doc_type_id,memo,sort_order")
            .eq("template_id", body.template_id)
            .order("sort_order", { ascending: true });

        if (tdErr) return NextResponse.json({ message: tdErr.message }, { status: 500 });

        reqDocsPayload = (tplDocs ?? []).map((d) => ({
            doc_type_id: d.doc_type_id as string,
            memo: d.memo ?? null,
            status: "pending" as const,
            result_doc_id: null,
        }));
    }

    if (reqDocsPayload.length) {
        const { error: rdInsErr } = await supabaseAdmin.from("event_task_required_docs").insert(
            reqDocsPayload.map((d) => ({
                event_task_id: inserted.id,
                doc_type_id: d.doc_type_id,
                memo: d.memo ?? null,
                status: d.status ?? "pending",
                result_doc_id: d.result_doc_id ?? null,
                checked_at: null,
                checked_by_user_id: null,
            }))
        );
        if (rdInsErr) return NextResponse.json({ message: rdInsErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, id: inserted.id });
}