import { NextRequest, NextResponse } from "next/server";

import { requireApiKey } from "@/lib/cm/rpa/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type UpdateBody = {
  entryId?: unknown;
  attachments?: unknown;
};

function isValidDate(value: string | null): value is string {
  return Boolean(value && !Number.isNaN(Date.parse(value)));
}

export async function GET(request: NextRequest) {
  const authError = await requireApiKey(request);
  if (authError) return authError;

  const since = request.nextUrl.searchParams.get("since");
  const until = request.nextUrl.searchParams.get("until");
  if (!isValidDate(since) || !isValidDate(until) || Date.parse(since) > Date.parse(until)) {
    return NextResponse.json(
      { ok: false, error: "since and until must be a valid date range" },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("form_entries")
    .select("id,attachments,last_name_kanji,first_name_kanji")
    .gte("created_at", since)
    .lte("created_at", until);

  if (error) {
    console.error("[rpa/form-entry-attachments] lookup failed", {
      code: error.code ?? "unknown",
    });
    return NextResponse.json(
      { ok: false, error: "form entry lookup failed" },
      { status: 500 }
    );
  }

  console.info("[rpa/form-entry-attachments] lookup completed", {
    count: data?.length ?? 0,
  });
  return NextResponse.json({ ok: true, entries: data ?? [] });
}

export async function PATCH(request: NextRequest) {
  const authError = await requireApiKey(request);
  if (authError) return authError;

  let body: UpdateBody;
  try {
    body = (await request.json()) as UpdateBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "request body must be valid JSON" },
      { status: 400 }
    );
  }

  const entryId = typeof body.entryId === "string" ? body.entryId.trim() : "";
  if (!entryId || !Array.isArray(body.attachments)) {
    return NextResponse.json(
      { ok: false, error: "entryId and attachments are required" },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("form_entries")
    .update({ attachments: body.attachments })
    .eq("id", entryId)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[rpa/form-entry-attachments] update failed", {
      code: error.code ?? "unknown",
    });
    return NextResponse.json(
      { ok: false, error: "form entry update failed" },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json(
      { ok: false, error: "form entry not found" },
      { status: 404 }
    );
  }

  console.info("[rpa/form-entry-attachments] update completed");
  return NextResponse.json({ ok: true });
}
