// ================================
// 1) src/app/api/shift-record-items/route.ts（重複排除＋型エラー解消 版）
// ================================
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import type { PostgrestError } from "@supabase/supabase-js";
import { z } from "zod";
import { randomUUID } from "node:crypto";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";


// 入力検証
const RowSchema = z.object({
record_id: z.string().uuid(),
item_def_id: z.string().uuid(),
value: z.unknown().optional(),
note: z.string().optional(),
});
const BodySchema = z.array(RowSchema).min(1);


type RowInput = z.infer<typeof RowSchema>;


type RowInsert = {
record_id: string;
item_def_id: string;
value_text: string | null;
note: string | null;
};


function toText(v: unknown): string | null {
if (v === null || typeof v === "undefined") return null;
if (typeof v === "string") return v;
try { return JSON.stringify(v); } catch { return String(v); }
}


function fmtPgErr(e: unknown): { message: string; code?: string; details?: unknown; hint?: unknown } {
const pe = e as Partial<PostgrestError> | undefined;
if (pe?.message) return { message: pe.message, code: pe.code, details: pe.details, hint: pe.hint };
return { message: e instanceof Error ? e.message : String(e) };
}


// 同一 (record_id,item_def_id) を最後の値でまとめる
function dedupe(rows: RowInput[]): RowInsert[] {
const map = new Map<string, RowInsert>();
for (const r of rows) {
const key = `${r.record_id}:${r.item_def_id}`;
map.set(key, {
record_id: r.record_id,
item_def_id: r.item_def_id,
value_text: toText(r.value),
note: r.note ?? null,
});
}
return [...map.values()];
}


// チャンク分割（大量投入時の安全策）
function chunk<T>(arr: T[], size: number): T[][] {
const out: T[][] = [];
for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
return out;
}


export async function POST(req: Request) {
const rid = randomUUID();


let bodyUnknown: unknown;
try {
bodyUnknown = await req.json();
} catch {
return NextResponse.json({ error: "invalid json", rid }, { status: 400 });
}


const parsed = BodySchema.safeParse(bodyUnknown);
if (!parsed.success) {
return NextResponse.json({ error: "validation failed", rid, issues: parsed.error.issues }, { status: 400 });
}


// ① 重複排除
const deduped = dedupe(parsed.data);
// ② 500件ずつ
const batches = chunk(deduped, 500);


try {
const sb = supabaseAdmin;
let upserted = 0;


for (const batch of batches) {
const { error } = await sb
.from("shift_record_items")
.upsert(batch, { onConflict: "record_id,item_def_id" });


if (error) {
const pe = fmtPgErr(error);
console.error("[/api/shift-record-items][POST] upsert error", rid, pe);
return NextResponse.json({ error: pe.message, code: pe.code, rid }, { status: 500 });
}
upserted += batch.length; // ← 型エラー回避：count を使わず自前加算
}


return NextResponse.json({ ok: true, upserted }, { headers: { "x-debug-rid": rid } });
} catch (e: unknown) {
const pe = fmtPgErr(e);
console.error("[/api/shift-record-items][POST] exception", rid, pe);
return NextResponse.json({ error: pe.message, rid }, { status: 500 });
}
}