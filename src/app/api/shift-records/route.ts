// ================================
// 2) src/app/api/shift-records/route.ts（Create-on-Read 200統一 版）
// ================================
import { NextResponse as NextResponse2 } from "next/server";
import { supabaseAdmin as supabaseAdmin2 } from "@/lib/supabase/service";
import type { PostgrestError as PostgrestError2 } from "@supabase/supabase-js";
import { z as z2 } from "zod";
import { randomUUID as randomUUID2 } from "node:crypto";


export const runtime2 = "nodejs";
export const dynamic2 = "force-dynamic";


type DbStatus2 = "draft" | "submitted" | "approved" | "archived" | (string & {});
export type ApiStatus2 = "入力中" | "完了" | (string & {});
const toApiStatus2 = (s: DbStatus2): ApiStatus2 => (s === "approved" ? "完了" : "入力中");
const toDbStatus2 = (s: unknown): DbStatus2 => (s === "完了" ? "approved" : "draft");


type ShiftRecordRow2 = { id: string; status: DbStatus2; updated_at: string | null };


const ShiftIdSchema2 = z2.union([z2.number().finite(), z2.string().regex(/^-?\d+$/)]);
const PostBodySchema2 = z2.object({ shift_id: ShiftIdSchema2, status: z2.union([z2.literal("入力中"), z2.literal("完了")]).optional() });


function pgErr2(e: unknown): { message: string; code?: string } {
const pe = e as Partial<PostgrestError2> | undefined;
return { message: pe?.message ?? (e instanceof Error ? e.message : String(e)), code: pe?.code };
}


export async function GET(req: Request) {
const id = randomUUID2();
const url = new URL(req.url);
const qsShift = url.searchParams.get("shift_id");


const parsed = ShiftIdSchema2.safeParse(qsShift ?? undefined);
if (!parsed.success) {
return NextResponse2.json({ error: "invalid shift_id (must be bigint number)", rid: id }, { status: 400 });
}
const shiftIdNum = typeof parsed.data === "number" ? Math.trunc(parsed.data) : Math.trunc(Number(parsed.data));


try {
const sb = supabaseAdmin2;
const { data, error } = await sb
.from("shift_records")
.select("id,status,updated_at")
.eq("shift_id", shiftIdNum)
.order("updated_at", { ascending: false, nullsFirst: false })
.limit(1)
.maybeSingle<ShiftRecordRow2>();


if (error) {
const pe = pgErr2(error);
return NextResponse2.json({ error: pe.message, code: pe.code, rid: id }, { status: 500, headers: { "x-debug-rid": id } });
}


if (data) {
const out = { id: data.id, status: toApiStatus2(data.status), updated_at: data.updated_at };
return NextResponse2.json(out, { headers: { "x-debug-rid": id } });
}


// 未存在 → その場で作成（201ではなく 200 に統一）
const { data: created, error: insErr } = await sb
.from("shift_records")
.insert({ shift_id: shiftIdNum, status: "draft" as DbStatus2 })
.select("id,status,updated_at")
.single<ShiftRecordRow2>();


if (insErr) {
const pe = pgErr2(insErr);
return NextResponse2.json({ error: pe.message, code: pe.code, rid: id }, { status: 500, headers: { "x-debug-rid": id } });
}


const out = { id: created.id, status: toApiStatus2(created.status), updated_at: created.updated_at };
return NextResponse2.json(out, { headers: { "x-debug-rid": id } }); // 200 に統一
} catch (e: unknown) {
const pe = pgErr2(e);
return NextResponse2.json({ error: pe.message, rid: id }, { status: 500, headers: { "x-debug-rid": id } });
}
}


export async function POST(req: Request) {
const id = randomUUID2();


let bodyUnknown: unknown;
try {
bodyUnknown = await req.json();
} catch {
return NextResponse2.json({ error: "invalid json", rid: id }, { status: 400 });
}


const parsed = PostBodySchema2.safeParse(bodyUnknown);
if (!parsed.success) {
return NextResponse2.json({ error: "validation failed", rid: id, issues: parsed.error.issues }, { status: 400 });
}


const shiftIdNum = typeof parsed.data.shift_id === "number" ? Math.trunc(parsed.data.shift_id) : Math.trunc(Number(parsed.data.shift_id));
const statusDb: DbStatus2 = parsed.data.status ? toDbStatus2(parsed.data.status) : "draft";


try {
const sb = supabaseAdmin2;
const { data, error } = await sb
.from("shift_records")
.insert({ shift_id: shiftIdNum, status: statusDb })
.select("id,status,updated_at")
.single<ShiftRecordRow2>();


if (error) {
const pe = pgErr2(error);
return NextResponse2.json({ error: pe.message, code: pe.code, rid: id }, { status: 500, headers: { "x-debug-rid": id } });
}


const out = { id: data.id, status: toApiStatus2(data.status), updated_at: data.updated_at };
return NextResponse2.json(out, { status: 201, headers: { "x-debug-rid": id } });
} catch (e: unknown) {
const pe = pgErr2(e);
return NextResponse2.json({ error: pe.message, rid: id }, { status: 500, headers: { "x-debug-rid": id } });
}
}