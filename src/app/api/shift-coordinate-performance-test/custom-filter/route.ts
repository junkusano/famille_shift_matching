import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getUserFromBearer } from "@/lib/auth/getUserFromBearer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type FilterPayload = {
  dateFilterType: "date" | "weekday";
  filterDate: string[];
  filterWeekday: string[];
  filterService: string[];
  filterPostal: string[];
  filterName: string[];
  filterGender: string[];
};

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isFilterPayload(value: unknown): value is FilterPayload {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return (
    (candidate.dateFilterType === "date" || candidate.dateFilterType === "weekday") &&
    isStringArray(candidate.filterDate) &&
    isStringArray(candidate.filterWeekday) &&
    isStringArray(candidate.filterService) &&
    isStringArray(candidate.filterPostal) &&
    isStringArray(candidate.filterName) &&
    isStringArray(candidate.filterGender)
  );
}

function getSupabaseClient(token: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("Supabase environment variables are not configured");
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

export async function PATCH(req: NextRequest) {
  try {
    const { user, token } = await getUserFromBearer(req);
    if (!user?.id || !token) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const body = (await req.json()) as Record<string, unknown>;
    const update: { shift_coordinate_custom_filter?: FilterPayload; use_shift_coordinate_custom_filter?: boolean } = {};
    if (body.customFilter !== undefined) {
      if (!isFilterPayload(body.customFilter)) {
        return NextResponse.json({ ok: false, error: "Invalid custom filter" }, { status: 400 });
      }
      update.shift_coordinate_custom_filter = body.customFilter;
    }
    if (body.useCustomFilter !== undefined) {
      if (typeof body.useCustomFilter !== "boolean") {
        return NextResponse.json({ ok: false, error: "Invalid custom filter toggle" }, { status: 400 });
      }
      update.use_shift_coordinate_custom_filter = body.useCustomFilter;
    }
    if (Object.keys(update).length === 0) return NextResponse.json({ ok: false, error: "No update requested" }, { status: 400 });

    const { error } = await getSupabaseClient(token).from("users").update(update).eq("auth_user_id", user.id);
    if (error) {
      console.error("[shift-coordinate-performance-test][custom-filter] update failed", error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[shift-coordinate-performance-test][custom-filter] unexpected error", error);
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}
