// /src/app/api/roster/weekly/templates/bulk_upsert/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import type { ShiftWeeklyTemplateUpsert } from "@/types/shift-weekly-template";

/**
 * 上書き（例：月→火）＝旧レコード削除 → 新規採番でINSERT（自然キーでupsert）
 * ID維持が必要な場合は UPDATE/INSERT 分離版を使うこと。
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { rows?: ShiftWeeklyTemplateUpsert[] };

    if (!body?.rows || !Array.isArray(body.rows) || body.rows.length === 0) {
      return NextResponse.json({ error: "empty payload" }, { status: 400 });
    }

    const rows: ShiftWeeklyTemplateUpsert[] = body.rows;

    // 1) 既存ID（上書き対象の旧レコード）を削除
    const idsToDelete = rows
      .map((r) => r.template_id)
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));

    if (idsToDelete.length > 0) {
      const { error: delErr } = await supabaseAdmin
        .from("shift_weekly_template")
        .delete()
        .in("template_id", idsToDelete);

      if (delErr) {
        return NextResponse.json(
          { error: `delete failed: ${delErr.message}` },
          { status: 500 }
        );
      }
    }

    // 2) 新レコードとして投入（PKはDB採番）
    // 分割代入で template_id を除去。_omit を void 参照して unused を回避
    const upsertRows: Omit<ShiftWeeklyTemplateUpsert, "template_id">[] = rows.map(
      (r) => {
        const { template_id: _omit, ...rest } = r;
        void _omit; // mark as used to satisfy no-unused-vars
        return rest;
      }
    );

    const { error: upsertErr } = await supabaseAdmin
      .from("shift_weekly_template")
      .upsert(upsertRows, {
        onConflict: "kaipoke_cs_id, weekday, start_time, required_staff_count",
        ignoreDuplicates: false,
      });

    if (upsertErr) {
      return NextResponse.json({ error: upsertErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
