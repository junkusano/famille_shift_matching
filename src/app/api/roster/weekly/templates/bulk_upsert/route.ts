// /src/app/api/roster/weekly/templates/bulk_upsert/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import type { ShiftWeeklyTemplateUpsert } from "@/types/shift-weekly-template";

/**
 * 上書き（例：月→火）時の重複を避けるための方針A+削除：
 *  1) 受け取った行のうち template_id が付いている既存行を先に削除（または非アクティブ化）
 *  2) template_id を除去して upsert（実質 INSERT、PKはDB採番）
 *
 * ※ ID維持が必要なら、このAPIではなく「UPDATE/INSERT分離」版を使ってください。
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { rows?: ShiftWeeklyTemplateUpsert[] };

    if (!body?.rows || !Array.isArray(body.rows) || body.rows.length === 0) {
      return NextResponse.json({ error: "empty payload" }, { status: 400 });
    }

    // 型利用（静的チェック用）。runtimeは軽い整形のみ行う
    const rows: ShiftWeeklyTemplateUpsert[] = body.rows;

    // 1) 既存ID（上書き対象の旧レコード）を収集
    const idsToDelete = rows
      .map((r) => r.template_id)
      .filter((v): v is number => Number.isFinite(v as number));

    // 2) 旧レコードを削除（履歴を残したい場合は下の delete() を update({ active:false }) に変更）
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

    // 3) 新レコードとして投入（PKはDBに採番させる）
    //    - template_id は渡さない
    //    - onConflict は自然キー（kaipoke_cs_id, weekday, start_time, required_staff_count）
    //      ※通常は「完全新規行」になる想定だが、同一キーが既に存在した場合は UPDATE される
    const upsertRows = rows.map(({ template_id, ...rest }) => rest);
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
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "unexpected error" },
      { status: 500 }
    );
  }
}
