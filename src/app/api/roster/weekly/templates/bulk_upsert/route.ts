// /src/app/api/roster/weekly/templates/bulk_upsert/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import type { ShiftWeeklyTemplateUpsert } from "@/types/shift-weekly-template";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { rows?: ShiftWeeklyTemplateUpsert[] };

    if (!body?.rows || !Array.isArray(body.rows) || body.rows.length === 0) {
      return NextResponse.json({ error: "empty payload" }, { status: 400 });
    }

    const rows: ShiftWeeklyTemplateUpsert[] = body.rows;

    // 1) 既存ID（上書き対象の旧レコード）を収集
    const idsToDelete = rows
      .map((r) => r.template_id)
      .filter((v): v is number => Number.isFinite(v as number));

    // 2) 旧レコードを削除（履歴に残す場合は update({ active:false }) へ）
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

    // 3) 新レコードとして投入（PKはDBに採番）
    //    template_id を除外（ここだけ unused になるため抑制）
    /* eslint-disable-next-line @typescript-eslint/no-unused-vars */
    const upsertRows: Omit<ShiftWeeklyTemplateUpsert, "template_id">[] = rows.map(
      ({ template_id, ...rest }) => rest
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