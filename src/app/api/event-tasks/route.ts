// src/app/api/event-tasks/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import { getUserFromBearer } from "@/lib/auth/getUserFromBearer";
//import { isAdminByAuthUserId } from "@/lib/auth/isAdminByAuthUserId";
import type { UpsertEventTaskPayload, EventTaskView } from "@/types/eventTasks";

export const dynamic = "force-dynamic";

function bad(message: string, status = 400) {
    return NextResponse.json({ message }, { status });
}

export async function GET(req: NextRequest) {
    const { user } = await getUserFromBearer(req);
    if (!user) return bad("Missing token", 401);

    //const admin = await isAdminByAuthUserId(supabaseAdmin, user.id);
    //if (!admin) return bad("Forbidden", 403);

    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const template_id = url.searchParams.get("template_id");
    const kaipoke_cs_id = url.searchParams.get("kaipoke_cs_id");
    const due_from = url.searchParams.get("due_from");
    const due_to = url.searchParams.get("due_to");

    let q = supabaseAdmin
        .from("event_tasks")
        .select("*")
        .order("due_date", { ascending: true })
        .limit(2000);

    if (status) q = q.eq("status", status);
    if (template_id) q = q.eq("template_id", template_id);
    if (kaipoke_cs_id) q = q.eq("kaipoke_cs_id", kaipoke_cs_id);
    if (due_from) q = q.gte("due_date", due_from);
    if (due_to) q = q.lte("due_date", due_to);

    const { data: tasks, error: tErr } = await q;
    if (tErr) return NextResponse.json({ message: tErr.message }, { status: 500 });

    const taskIds = (tasks ?? []).map((t) => t.id);
    const templateIds = Array.from(new Set((tasks ?? []).map((t) => t.template_id)));
    const csIds = Array.from(new Set((tasks ?? []).map((t) => t.kaipoke_cs_id)));
    const userIds = Array.from(new Set((tasks ?? []).map((t) => t.user_id).filter(Boolean)));

    const [{ data: reqDocs, error: rdErr }, { data: templates, error: tplErr }, { data: clients, error: cErr }, { data: users, error: uErr }] =
        await Promise.all([
            taskIds.length
                ? supabaseAdmin.from("event_task_required_docs").select("*").in("event_task_id", taskIds)
                : Promise.resolve({ data: [], error: null }),
            templateIds.length
                ? supabaseAdmin.from("event_template").select("id,template_name").in("id", templateIds)
                : Promise.resolve({ data: [], error: null }),
            csIds.length
                ? supabaseAdmin.from("cs_kaipoke_info").select("kaipoke_cs_id,client_name,name").in("kaipoke_cs_id", csIds)
                : Promise.resolve({ data: [], error: null }),
            userIds.length
                ? supabaseAdmin.from("user_entry_united_view_single").select("user_id,last_name_kanji,first_name_kanji").in("user_id", userIds as string[])
                : Promise.resolve({ data: [], error: null }),
        ]);

    if (rdErr) return NextResponse.json({ message: rdErr.message }, { status: 500 });
    if (tplErr) return NextResponse.json({ message: tplErr.message }, { status: 500 });
    if (cErr) return NextResponse.json({ message: cErr.message }, { status: 500 });
    if (uErr) return NextResponse.json({ message: uErr.message }, { status: 500 });

    // doc master 名称（列名は環境差あり得るので最小限で）
    const docTypeIds = Array.from(new Set((reqDocs ?? []).map((d: any) => d.doc_type_id)));
    const { data: docMasters } = docTypeIds.length
        ? await supabaseAdmin.from("user_doc_master").select("*").in("id", docTypeIds)
        : { data: [] as any[] };

    const templateMap = new Map((templates ?? []).map((r: any) => [r.id, r.template_name]));
    const clientMap = new Map((clients ?? []).map((r: any) => [r.kaipoke_cs_id, (r.client_name ?? r.name ?? r.kaipoke_cs_id) as string]));
    const userMap = new Map(
        (users ?? []).map((r: any) => [
            r.user_id,
            `${r.last_name_kanji ?? ""}${r.first_name_kanji ?? ""}`.trim() || r.user_id,
        ])
    );

    // doc master の表示名候補（doc_name / name / title などに寄せる）
    const docNameMap = new Map(
        (docMasters ?? []).map((r: any) => [r.id, (r.doc_name ?? r.name ?? r.title ?? r.id) as string])
    );

    const docsByTask = new Map<string, any[]>();
    for (const d of reqDocs ?? []) {
        const arr = docsByTask.get(d.event_task_id) ?? [];
        arr.push({
            ...d,
            doc_type_name: docNameMap.get(d.doc_type_id) ?? null,
        });
        docsByTask.set(d.event_task_id, arr);
    }

    const result: EventTaskView[] = (tasks ?? []).map((t: any) => ({
        ...t,
        template_name: templateMap.get(t.template_id) ?? null,
        client_name: clientMap.get(t.kaipoke_cs_id) ?? null,
        assigned_user_name: t.user_id ? userMap.get(t.user_id) ?? t.user_id : null,
        required_docs: (docsByTask.get(t.id) ?? []).sort((a, b) => (a.doc_type_name ?? "").localeCompare(b.doc_type_name ?? "")),
    }));

    return NextResponse.json({ tasks: result });
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
            .from("event_template_require_docs")
            .select("doc_type_id,memo,sort_order")
            .eq("template_id", body.template_id)
            .order("sort_order", { ascending: true });

        if (tdErr) return NextResponse.json({ message: tdErr.message }, { status: 500 });

        reqDocsPayload = (tplDocs ?? []).map((d: any) => ({
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