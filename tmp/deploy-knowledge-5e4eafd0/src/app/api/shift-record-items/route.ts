// =============================================
// 1) src/app/api/shift-record-items/route.ts
//    - GET 追加: 保存済みの項目を取得（record_id or shift_id）
//    - POST: 重複排除して upsert（既存）
//    - any 不使用（zod + PostgrestError）
// =============================================
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import type { PostgrestError } from "@supabase/supabase-js";
import { z } from "zod";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ----------------- 共通ユーティリティ -----------------
function fmtPgErr(e: unknown): { message: string; code?: string; details?: unknown; hint?: unknown } {
    const pe = e as Partial<PostgrestError> | undefined;
    if (pe?.message) return { message: pe.message, code: pe.code, details: pe.details, hint: pe.hint };
    return { message: e instanceof Error ? e.message : String(e) };
}

function toText(v: unknown): string | null {
    if (v === null || typeof v === "undefined") return null;
    if (typeof v === "string") return v;
    try { return JSON.stringify(v); } catch { return String(v); }
}

// ----------------- スキーマ -----------------
const RowSchema = z.object({
    record_id: z.string().uuid(),
    item_def_id: z.string().uuid(),
    value: z.unknown().optional(),
    note: z.string().optional(),
});
const BodySchema = z.array(RowSchema).min(1);

// GET クエリ: record_id か shift_id のどちらか必須
const GetQuerySchema = z.object({
    record_id: z.string().uuid().optional(),
    shift_id: z.union([z.number().finite(), z.string().regex(/^\d+$/)]).optional(),
}).refine((o) => !!o.record_id || !!o.shift_id, {
    message: "either record_id or shift_id is required",
});

// ----------------- 型 -----------------
type RowInput = z.infer<typeof RowSchema>;

type RowInsert = {
    record_id: string;
    item_def_id: string;
    value_text: string | null;
    note: string | null;
};

type ItemRow = { item_def_id: string; value_text: string | null; note: string | null; updated_at: string | null };

// ----------------- ヘルパ -----------------
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

function chunk<T>(arr: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}

// ----------------- GET: 項目取得 -----------------
export async function GET(req: Request) {
    const rid = randomUUID();
    const url = new URL(req.url);
    const qs = Object.fromEntries(url.searchParams.entries());

    console.info("[/api/shift-record-items][GET] start", rid, qs); // ★追加

    const parsed = GetQuerySchema.safeParse({
        record_id: qs.record_id,
        shift_id: (qs.shift_id ?? undefined) as unknown,
    });
    if (!parsed.success) {
        return NextResponse.json({ error: "invalid query", rid, issues: parsed.error.issues }, { status: 400 });
    }

    try {
        const sb = supabaseAdmin;

        // record_id を確定
        let recordId: string | null = null;
        if (parsed.data.record_id) {
            recordId = parsed.data.record_id;
        } else if (parsed.data.shift_id) {
            const shiftNum = typeof parsed.data.shift_id === "number" ? Math.trunc(parsed.data.shift_id) : Math.trunc(Number(parsed.data.shift_id));
            const { data: rec, error: recErr } = await sb
                .from("shift_records")
                .select("id")
                .eq("shift_id", shiftNum)
                .order("updated_at", { ascending: false, nullsFirst: false })
                .limit(1)
                .maybeSingle<{ id: string }>();
            if (recErr) {
                const pe = fmtPgErr(recErr);
                return NextResponse.json({ error: pe.message, code: pe.code, rid }, { status: 500 });
            }
            if (!rec) {
                return NextResponse.json({ error: "record not found", rid }, { status: 404 });
            }
            recordId = rec.id;
        }

        // 取得
        const { data, error } = await sb
            .from("shift_record_items")
            .select("item_def_id,value_text,note,updated_at")
            .eq("record_id", recordId as string)
            .order("item_def_id", { ascending: true })
            .returns<ItemRow[]>();

        if (error) {
            const pe = fmtPgErr(error);
            console.error("[/api/shift-record-items][GET] error", rid, pe); // ★追加
            return NextResponse.json({ error: pe.message, code: pe.code, rid }, { status: 500 });
        }

        console.info("[/api/shift-record-items][GET] ok", rid, {
            record_id: recordId, count: data?.length ?? 0
        });

        const by_item_def_id = Object.fromEntries(
            (data ?? []).map((r) => [r.item_def_id, { value_text: r.value_text, note: r.note, updated_at: r.updated_at }])
        );

        return NextResponse.json({ record_id: recordId, items: data ?? [], by_item_def_id }, { headers: { "x-debug-rid": rid } });
    } catch (e) {
        const pe = fmtPgErr(e);
        return NextResponse.json({ error: pe.message, rid }, { status: 500 });
    }
}

// ----------------- POST: upsert（重複排除＋バッチ） -----------------
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

    const deduped = dedupe(parsed.data);
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
            upserted += batch.length;
        }
        return NextResponse.json({ ok: true, upserted }, { headers: { "x-debug-rid": rid } });
    } catch (e) {
        const pe = fmtPgErr(e);
        console.error("[/api/shift-record-items][POST] exception", rid, pe);
        return NextResponse.json({ error: pe.message, rid }, { status: 500 });
    }
}


// =============================================
// 2) （任意）ShiftRecord.tsx の読み込み部サンプル（差分の目安）
//    - レコード取得後に /api/shift-record-items?record_id=... を叩いて状態に反映
// =============================================
/*
useEffect(() => {
  let aborted = false;
  async function boot() {
    // 1) レコードを取得（存在しなければ作成も）
    const res = await fetch(`/api/shift-records?shift_id=${encodeURIComponent(shiftId)}`);
    if (!res.ok) return; // エラーハンドリングは省略
    const rec = await res.json(); // { id, status, updated_at }
    setRid(rec.id);

    // 2) 項目を取得
    const r2 = await fetch(`/api/shift-record-items?record_id=${rec.id}`);
    if (!r2.ok) return;
    const j2 = await r2.json(); // { items: [...], by_item_def_id: {...} }
    if (aborted) return;

    // 3) フォーム状態に反映（例: items配列→自前の state 形へ）
    const initValues = Object.fromEntries(
      (j2.items as Array<{ item_def_id: string; value_text: string | null }> ).map((x) => [x.item_def_id, x.value_text])
    );
    setValues(initValues);
  }
  boot();
  return () => { aborted = true; };
}, [shiftId]);
*/
