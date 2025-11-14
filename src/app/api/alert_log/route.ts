// src/app/api/alert_log/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";

type AlertStatus = "open" | "in_progress" | "done" | "muted" | "cancelled";

type CreateInput = {
  message: string;
  visible_roles?: string[];
  severity?: number;
  status?: AlertStatus;
  status_source?: string;
  kaipoke_cs_id?: string | null;
  user_id?: string | null;
  shift_id?: string | null;
  rpa_request_id?: string | null;
};

// ------- GET: アクティブなアラート一覧を返す（roleは見ない） -------
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("alert_log")
    .select("*")
    .in("status", ["open", "in_progress"])
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    console.error("[alert_log][GET] error", error);
    return NextResponse.json(
      { error: "Failed to fetch alerts" },
      { status: 500 }
    );
  }

  // AlertBar は配列を期待しているのでそのまま返す
  return NextResponse.json(data ?? []);
}

// ------- POST: 新規アラート作成 -------
// クライアント / バックエンドどちらからでも使える想定
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as CreateInput;

    if (!body.message || typeof body.message !== "string") {
      return NextResponse.json(
        { error: "message is required" },
        { status: 400 }
      );
    }

    const insert: Record<string, unknown> = {
      message: body.message,
      visible_roles: body.visible_roles ?? ["admin", "manager", "staff"],
      severity: body.severity ?? 2,
      status: body.status ?? "open",
      status_source: body.status_source ?? "manual",
      kaipoke_cs_id: body.kaipoke_cs_id ?? null,
      user_id: body.user_id ?? null,
      shift_id: body.shift_id ?? null,
      rpa_request_id: body.rpa_request_id ?? null,
    };

    const { data, error } = await supabaseAdmin
      .from("alert_log")
      .insert(insert)
      .select("*")
      .single();

    if (error) {
      console.error("[alert_log][POST] error", error);
      return NextResponse.json(
        { error: "Failed to create alert" },
        { status: 500 }
      );
    }

    return NextResponse.json(data, { status: 201 });
  } catch (e) {
    console.error("[alert_log][POST] exception", e);
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }
}
