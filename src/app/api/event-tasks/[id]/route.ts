// src/app/api/event-tasks/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import { getUserFromBearer } from "@/lib/auth/getUserFromBearer";
import { isAdminByAuthUserId } from "@/lib/auth/isAdmin";
import type { UpdateEventTaskPayload } from "@/types/eventTasks";

export const dynamic = "force-dynamic";

function bad(message: string, status = 400) {
  return NextResponse.json({ message }, { status });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const { user } = await getUserFromBearer(req);
  if (!user) return bad("Missing token", 401);

  const admin = await isAdminByAuthUserId(supabaseAdmin, user.id);
  if (!admin) return bad("Forbidden", 403);

  const id = params.id;
  const body = (await req.json().catch(() => null)) as UpdateEventTaskPayload | null;
  if (!body) return bad("Invalid JSON");

  // 親 update
  const update: any = {};
  if (typeof body.user_id !== "undefined") update.user_id = body.user_id;
  if (typeof body.orgunitid !== "undefined") update.orgunitid = body.orgunitid;
  if (typeof body.due_date !== "undefined") update.due_date = body.due_date;
  if (typeof body.memo !== "undefined") update.memo = body.memo;
  if (typeof body.status !== "undefined") {
    update.status = body.status;
    update.closed_at = body.status === "done" || body.status === "cancelled" ? new Date().toISOString() : null;
  }

  if (Object.keys(update).length) {
    const { error: upErr } = await supabaseAdmin.from("event_tasks").update(update).eq("id", id);
    if (upErr) return NextResponse.json({ message: upErr.message }, { status: 500 });
  }

  // 子 全入替（来た時だけ）
  if (body.required_docs) {
    const { error: delErr } = await supabaseAdmin.from("event_task_required_docs").delete().eq("event_task_id", id);
    if (delErr) return NextResponse.json({ message: delErr.message }, { status: 500 });

    if (body.required_docs.length) {
      const now = new Date().toISOString();
      const { error: insErr } = await supabaseAdmin.from("event_task_required_docs").insert(
        body.required_docs.map((d) => ({
          event_task_id: id,
          doc_type_id: d.doc_type_id,
          memo: d.memo ?? null,
          status: d.status ?? "pending",
          result_doc_id: d.result_doc_id ?? null,
          checked_at: null,
          checked_by_user_id: null,
          created_at: now,
          updated_at: now,
        }))
      );
      if (insErr) return NextResponse.json({ message: insErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const { user } = await getUserFromBearer(req);
  if (!user) return bad("Missing token", 401);

  const admin = await isAdminByAuthUserId(supabaseAdmin, user.id);
  if (!admin) return bad("Forbidden", 403);

  const url = new URL(req.url);
  const hard = url.searchParams.get("hard") === "1";
  const id = params.id;

  if (hard) {
    const { error } = await supabaseAdmin.from("event_tasks").delete().eq("id", id);
    if (error) return NextResponse.json({ message: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, hard: true });
  }

  const { error } = await supabaseAdmin
    .from("event_tasks")
    .update({ status: "cancelled", closed_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return NextResponse.json({ message: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, hard: false });
}
