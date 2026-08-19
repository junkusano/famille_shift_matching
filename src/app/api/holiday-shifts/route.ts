import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import { notifyShiftChange } from "@/lib/lineworks/shiftChangeNotify";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status });
async function actor(req: NextRequest) {
  const token = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return null;
  const { data: auth } = await supabaseAdmin.auth.getUser(token);
  if (!auth.user) return null;
  const { data: me } = await supabaseAdmin.from("users").select("system_role").eq("auth_user_id", auth.user.id).maybeSingle();
  const role = String(me?.system_role ?? "").toLowerCase();
  return ["admin", "manager"].includes(role) ? { authId: auth.user.id, role } : null;
}

export async function GET(req: NextRequest) {
  const me = await actor(req); if (!me) return json({ error: "管理権限が必要です" }, 403);
  const { data: holidays, error } = await supabaseAdmin.from("holiday_master").select("*").order("holiday_date");
  if (error) return json({ error: error.message }, 500);
  const { data: templates } = await supabaseAdmin.from("shift_weekly_template").select("*").eq("holiday_off", true).eq("active", true);
  const { data: actions } = await supabaseAdmin.from("holiday_shift_action").select("*").order("holiday_date");
  const { data: shifts } = await supabaseAdmin.from("shift").select("shift_id,kaipoke_cs_id,shift_start_date,shift_start_time,shift_end_time,service_code,required_staff_count");
  const { data: clients } = await supabaseAdmin.from("cs_kaipoke_info").select("kaipoke_cs_id,name");
  const names = new Map((clients ?? []).map((c) => [c.kaipoke_cs_id, c.name]));
  const rows = (actions ?? []).map((a) => ({ ...a, client_name: names.get(a.client_id) ?? a.client_id, shift: (shifts ?? []).find((s) => s.shift_id === a.shift_id), weekly_shift: (templates ?? []).find((t) => t.template_id === a.weekly_shift_id) }));
  const summaries = (holidays ?? []).map((h) => { const rs = rows.filter((r) => r.holiday_date === h.holiday_date); return { ...h, counts: { pending: rs.filter(r => r.status === "pending").length, deleted: rs.filter(r => r.status === "deleted").length, keep: rs.filter(r => r.status === "keep").length, changed: rs.filter(r => r.status === "changed").length } }; });
  return json({ holidays: summaries, rows });
}

export async function POST(req: NextRequest) {
  const me = await actor(req); if (!me) return json({ error: "管理権限が必要です" }, 403);
  const body = await req.json() as { type?: "master" | "action"; holiday_date?: string; holiday_name?: string; is_active?: boolean; id?: number; status?: string; action_note?: string; shift_id?: number; weekly_shift_id?: number; client_id?: string };
  if (body.type === "master") {
    if (!body.holiday_date || !body.holiday_name) return json({ error: "祝日日付と名称は必須です" }, 400);
    const { data, error } = await supabaseAdmin.from("holiday_master").upsert({ id: body.id, holiday_date: body.holiday_date, holiday_name: body.holiday_name, is_active: body.is_active ?? true, updated_at: new Date().toISOString() }, { onConflict: "holiday_date" }).select().single();
    return error ? json({ error: error.message }, 400) : json({ ok: true, holiday: data });
  }
  const allowed = new Set(["deleted", "keep", "changed"]);
  if (!body.holiday_date || !body.weekly_shift_id || !body.client_id || !body.status || !allowed.has(body.status)) return json({ error: "不正な対応内容です" }, 400);
  let shiftId = body.shift_id ?? null;
  if (body.status === "deleted" && !shiftId) return json({ error: "削除対象シフトがありません" }, 400);
  if (body.status === "deleted") {
    const { data: before } = await supabaseAdmin.from("shift").select("shift_id,kaipoke_cs_id,shift_start_date,shift_start_time,shift_end_time,staff_01_user_id").eq("shift_id", shiftId).maybeSingle();
    const { error } = await supabaseAdmin.rpc("shifts_delete_with_context", { p_shift_ids: [shiftId], p_actor_user_id: me.authId, p_request_path: "/portal/roster/holiday-shifts" });
    if (error) return json({ error: error.message }, 400);
    if (before) await notifyShiftChange({ action: "DELETE", requestPath: "/portal/roster/holiday-shifts", actorUserIdText: me.authId, shift: before, deleteChangedCols: before });
  }
  const { data, error } = await supabaseAdmin.from("holiday_shift_action").upsert({ holiday_date: body.holiday_date, weekly_shift_id: body.weekly_shift_id, shift_id: shiftId, client_id: body.client_id, status: body.status, action_note: body.action_note ?? null, processed_by: me.authId, processed_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: "holiday_date,weekly_shift_id,shift_id" }).select().single();
  if (error) return json({ error: error.message }, 500);
  if (shiftId) await supabaseAdmin.from("alert_log").update({ status: "done", completed_by: me.authId, updated_at: new Date().toISOString() }).eq("shift_id", String(shiftId)).eq("status", "open");
  return json({ ok: true, action: data });
}
