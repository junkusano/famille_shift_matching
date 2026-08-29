// src/app/api/plan-services/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import { getUserFromBearer } from "@/lib/auth/getUserFromBearer";

export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

type Ctx = {
  params: Promise<{ id: string }>;
};

export async function PUT(req: NextRequest, { params }: Ctx) {
  try {
    await getUserFromBearer(req);

    const { id } = await params;
    const body = await req.json();

    const weekday = normalizeWeekday(body.weekday);
    const startTime = normalizeTimeOrNull(body.start_time);
    const endTime = normalizeTimeOrNull(body.end_time);
    const durationMinutes = calculateDurationMinutes(startTime, endTime);
    const monthlyOccurrenceFactor = normalizeNumber(body.monthly_occurrence_factor);
    const monthlyMinutes =
      normalizeNumber(body.monthly_minutes) ??
      (durationMinutes !== null && monthlyOccurrenceFactor !== null
        ? Math.round(durationMinutes * monthlyOccurrenceFactor)
        : null);
    const monthlyHours =
      normalizeNumber(body.monthly_hours) ??
      (monthlyMinutes !== null ? Math.round((monthlyMinutes / 60) * 100) / 100 : null);

    const patch = {
      weekday,
      weekday_jp: weekday === null ? null : WEEKDAY_JP[weekday],
      start_time: startTime,
      end_time: endTime,
      duration_minutes: durationMinutes,
      service_title: nullableString(body.service_title),
      service_detail: nullableString(body.service_detail),
      procedure_notes: nullableString(body.procedure_notes),
      observation_points: nullableString(body.observation_points),
      family_action: nullableString(body.family_action),
      schedule_note: nullableString(body.schedule_note),
      display_order: normalizeNumber(body.display_order),
      service_no: normalizeNumber(body.service_no),
      monthly_occurrence_factor: monthlyOccurrenceFactor,
      monthly_minutes: monthlyMinutes,
      monthly_hours: monthlyHours,
    };

    const { data, error } = await supabaseAdmin
      .from("plan_services")
      .update(patch)
      .eq("plan_service_id", id)
      .select("*")
      .single();

    if (error) throw error;

    return json({ ok: true, data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[api/plan-services/[id]][PUT] error", msg);
    return json({ ok: false, error: msg }, 500);
  }
}

function nullableString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s : null;
}

function normalizeNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const WEEKDAY_JP = ["日", "月", "火", "水", "木", "金", "土"];

function normalizeWeekday(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const weekday = Number(value);
  return Number.isInteger(weekday) && weekday >= 0 && weekday <= 6 ? weekday : null;
}

function normalizeTimeOrNull(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const match = value.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
}

function calculateDurationMinutes(startTime: string | null, endTime: string | null) {
  if (!startTime || !endTime) return null;
  const [startHour, startMinute] = startTime.split(":").map(Number);
  const [endHour, endMinute] = endTime.split(":").map(Number);
  const duration = endHour * 60 + endMinute - (startHour * 60 + startMinute);
  return duration >= 0 ? duration : null;
}
