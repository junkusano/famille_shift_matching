import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";

type RequestBody = { action: "preview" | "apply"; startAt: string; fromUserId: string; toUserId: string };
type ShiftRow = { shift_id: number; shift_start_date: string | null; shift_start_time: string | null; kaipoke_cs_id: string | null; staff_01_user_id: string | null; staff_02_user_id: string | null; staff_03_user_id: string | null };

function bearerToken(request: Request) {
  return request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;
}

async function actorFrom(request: Request) {
  const token = bearerToken(request);
  if (!token) return { error: "ログインしてください", status: 401 } as const;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return { error: "ログインしてください", status: 401 } as const;
  const { data: staff } = await supabaseAdmin.from("users").select("system_role").eq("auth_user_id", data.user.id).maybeSingle();
  if (!staff || !["manager", "admin"].includes((staff.system_role ?? "").toLowerCase())) return { error: "この操作を実行する権限がありません", status: 403 } as const;
  return { userId: data.user.id } as const;
}

function validBody(value: unknown): RequestBody | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const action = v.action;
  const startAt = typeof v.startAt === "string" ? v.startAt.trim() : "";
  const fromUserId = typeof v.fromUserId === "string" ? v.fromUserId.trim() : "";
  const toUserId = typeof v.toUserId === "string" ? v.toUserId.trim() : "";
  if ((action !== "preview" && action !== "apply") || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(startAt) || !fromUserId || !toUserId || fromUserId === toUserId) return null;
  return { action, startAt, fromUserId, toUserId };
}

export async function GET(request: Request) {
  const actor = await actorFrom(request);
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  const { data, error } = await supabaseAdmin.from("user_entry_united_view_single").select("user_id,last_name_kanji,first_name_kanji,status").not("user_id", "is", null).order("last_name_kanji");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ staff: (data ?? []).map((row) => ({ userId: row.user_id as string, label: `${row.last_name_kanji ?? ""}${row.first_name_kanji ?? ""}`.trim() || (row.user_id as string), status: row.status })) });
}

export async function POST(request: Request) {
  const actor = await actorFrom(request);
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  const body = validBody(await request.json().catch(() => null));
  if (!body) return NextResponse.json({ error: "入力内容が不正です" }, { status: 400 });
  // datetime-local is intentionally treated as the operational local time;
  // do not convert it through UTC before comparing the date/time columns.
  const [startDate, rawStartTime] = body.startAt.split("T");
  const startTime = rawStartTime.length === 5 ? `${rawStartTime}:00` : rawStartTime;
  const or = [`staff_01_user_id.eq.${body.fromUserId}`, `staff_02_user_id.eq.${body.fromUserId}`, `staff_03_user_id.eq.${body.fromUserId}`].join(",");
  const { data, error } = await supabaseAdmin.from("shift").select("shift_id,shift_start_date,shift_start_time,kaipoke_cs_id,staff_01_user_id,staff_02_user_id,staff_03_user_id").or(or).or(`shift_start_date.gt.${startDate},and(shift_start_date.eq.${startDate},shift_start_time.gte.${startTime})`).order("shift_start_date").order("shift_start_time");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const shifts = (data ?? []) as ShiftRow[];
  if (body.action === "preview") {
    const { count: weeklyCount, error: weeklyError } = await supabaseAdmin
      .from("shift_weekly_template")
      .select("template_id", { count: "exact", head: true })
      .eq("active", true)
      .or(or)
      .or(`effective_to.is.null,effective_to.gte.${startDate}`);
    if (weeklyError) return NextResponse.json({ error: weeklyError.message }, { status: 500 });
    const clientIds = [...new Set(shifts.map((shift) => shift.kaipoke_cs_id).filter((id): id is string => Boolean(id)))];
    const { data: clients } = clientIds.length
      ? await supabaseAdmin.from("cs_kaipoke_info").select("kaipoke_cs_id,name").in("kaipoke_cs_id", clientIds)
      : { data: [] as Array<{ kaipoke_cs_id: string; name: string | null }> };
    const clientNames = new Map((clients ?? []).map((client) => [client.kaipoke_cs_id, client.name]));
    return NextResponse.json({ count: shifts.length, weeklyCount: weeklyCount ?? 0, shifts: shifts.map((shift) => ({ ...shift, clientName: clientNames.get(shift.kaipoke_cs_id ?? "") ?? null })) });
  }
  const { data: result, error: rpcError } = await supabaseAdmin.rpc("batch_reassign_departed_staff_shifts", { p_actor_auth_id: actor.userId, p_start_at: body.startAt, p_from_user_id: body.fromUserId, p_to_user_id: body.toUserId });
  if (rpcError) return NextResponse.json({ error: rpcError.message }, { status: 500 });
  const summary = Array.isArray(result) ? result[0] : result;
  return NextResponse.json({ ok: true, summary });
}
