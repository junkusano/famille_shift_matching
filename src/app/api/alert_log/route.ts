// app/api/alert_log/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import {
  AlertStatus,
  CreateInput,
  Result,
  ok,
  err,
  isAlertRow,
  isErr,
} from "@/types/alert_log";

function parseRole(s: string | null): "admin" | "manager" | "member" {
  if (s === "admin" || s === "manager" || s === "member") return s;
  return "member";
}
function toBoolean(s: string | null, fallback = false): boolean {
  if (s === null) return fallback;
  const v = s.trim().toLowerCase();
  return v === "1" || v === "true";
}

// ================= GET =================
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const role = parseRole(url.searchParams.get("role"));
    const includeDone = toBoolean(url.searchParams.get("includeDone"), false);

    const { data, error } = await supabaseAdmin
      .from("alert_log")
      .select("*")
      .order("severity", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const rows = (data ?? []).filter(isAlertRow);

    const filtered = rows
      .filter((r) => r.visible_roles.length === 0 || r.visible_roles.includes(role))
      .filter((r) => (includeDone ? true : r.status !== "done"));

    return NextResponse.json(filtered);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// ================= POST =================

function sanitizeCreateBody(body: unknown): Result<CreateInput> {
  if (typeof body !== "object" || body === null) return err("invalid body");
  const b = body as Record<string, unknown>;

  const message = typeof b.message === "string" && b.message.trim() ? b.message : null;
  if (!message) return err("message is required");

  const sev = typeof b.severity === "number" ? b.severity : 2;
  const severity = Math.min(3, Math.max(1, sev));

  const roles =
    Array.isArray(b.visible_roles) ? b.visible_roles.filter((v) => typeof v === "string") : ["manager", "member"];

  const status = ((): AlertStatus => {
    const s = typeof b.status === "string" ? b.status : "open";
    return ["open", "in_progress", "done", "muted", "cancelled"].includes(s) ? (s as AlertStatus) : "open";
  })();

  const status_source = typeof b.status_source === "string" ? b.status_source : "manual";

  const pickNullable = (k: string) =>
    typeof b[k] === "string" && (b[k] as string).trim() ? (b[k] as string) : null;

  return ok({
    message,
    severity,
    visible_roles: roles,
    status,
    status_source,
    kaipoke_cs_id: pickNullable("kaipoke_cs_id"),
    user_id: pickNullable("user_id"),
    shift_id: pickNullable("shift_id"),
    rpa_request_id: pickNullable("rpa_request_id"),
    created_by: pickNullable("auth_user_id"),
    assigned_to: pickNullable("assigned_to"),
  });
}

export async function POST(req: Request) {
  try {
    const parsed = sanitizeCreateBody(await req.json());
    if (isErr(parsed)) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const { error } = await supabaseAdmin.from("alert_log").insert(parsed.value);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
