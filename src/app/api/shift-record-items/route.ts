// ================================
// 2) src/app/api/shift-record-items/route.ts（重複排除＋型エラー解消／valid exports）
// ================================
import { NextResponse as NextResponse2 } from "next/server";
import { supabaseAdmin as supabaseAdmin2 } from "@/lib/supabase/service";
import type { PostgrestError as PostgrestError2 } from "@supabase/supabase-js";
import { z as z2 } from "zod";
import { randomUUID as randomUUID2 } from "node:crypto";

export const runtime2 = "nodejs";
export const dynamic2 = "force-dynamic";

const RowSchema2 = z2.object({
  record_id: z2.string().uuid(),
  item_def_id: z2.string().uuid(),
  value: z2.unknown().optional(),
  note: z2.string().optional(),
});
const BodySchema2 = z2.array(RowSchema2).min(1);

type RowInput2 = z2.infer<typeof RowSchema2>;

type RowInsert2 = {
  record_id: string;
  item_def_id: string;
  value_text: string | null;
  note: string | null;
};

function toText2(v: unknown): string | null {
  if (v === null || typeof v === "undefined") return null;
  if (typeof v === "string") return v;
  try { return JSON.stringify(v); } catch { return String(v); }
}

function fmtPgErr2(e: unknown): { message: string; code?: string; details?: unknown; hint?: unknown } {
  const pe = e as Partial<PostgrestError2> | undefined;
  if (pe?.message) return { message: pe.message, code: pe.code, details: pe.details, hint: pe.hint };
  return { message: e instanceof Error ? e.message : String(e) };
}

function dedupe2(rows: RowInput2[]): RowInsert2[] {
  const map = new Map<string, RowInsert2>();
  for (const r of rows) {
    const key = `${r.record_id}:${r.item_def_id}`;
    map.set(key, {
      record_id: r.record_id,
      item_def_id: r.item_def_id,
      value_text: toText2(r.value),
      note: r.note ?? null,
    });
  }
  return [...map.values()];
}

function chunk2<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function POST(req: Request) {
  const rid = randomUUID2();

  let bodyUnknown: unknown;
  try {
    bodyUnknown = await req.json();
  } catch {
    return NextResponse2.json({ error: "invalid json", rid }, { status: 400 });
  }

  const parsed = BodySchema2.safeParse(bodyUnknown);
  if (!parsed.success) {
    return NextResponse2.json({ error: "validation failed", rid, issues: parsed.error.issues }, { status: 400 });
  }

  const deduped = dedupe2(parsed.data);
  const batches = chunk2(deduped, 500);

  try {
    const sb = supabaseAdmin2;
    let upserted = 0;

    for (const batch of batches) {
      const { error } = await sb
        .from("shift_record_items")
        .upsert(batch, { onConflict: "record_id,item_def_id" });

      if (error) {
        const pe = fmtPgErr2(error);
        console.error("[/api/shift-record-items][POST] upsert error", rid, pe);
        return NextResponse2.json({ error: pe.message, code: pe.code, rid }, { status: 500 });
      }
      upserted += batch.length;
    }

    return NextResponse2.json({ ok: true, upserted }, { headers: { "x-debug-rid": rid } });
  } catch (e: unknown) {
    const pe = fmtPgErr2(e);
    console.error("[/api/shift-record-items][POST] exception", rid, pe);
    return NextResponse2.json({ error: pe.message, rid }, { status: 500 });
  }
}
