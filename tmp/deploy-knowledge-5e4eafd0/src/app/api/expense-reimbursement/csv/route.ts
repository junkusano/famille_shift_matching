import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import { assertCronAuth } from "@/lib/cron/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function csvEscape(value: unknown) {
  const s = value == null ? "" : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

export async function GET(req: NextRequest) {
  try {
    assertCronAuth(req);

    const { searchParams } = new URL(req.url);
    const month = searchParams.get("month"); // 例: 2026-04

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json(
        { ok: false, error: "month=YYYY-MM が必要です" },
        { status: 400 }
      );
    }

    const startDate = `${month}-01`;
    const end = new Date(`${startDate}T00:00:00+09:00`);
    end.setMonth(end.getMonth() + 1);
    const endDate = end.toISOString().slice(0, 10);

    const { data, error } = await supabaseAdmin
      .from("expense_reimbursements")
      .select(`
        id,
        staff_name,
        service_date,
        service_start_time,
        service_end_time,
        expense_amount,
        expense_detail,
        bank_name,
        branch_name,
        branch_number,
        bank_symbol,
        account_number,
        receipt_photo_url,
        created_at
      `)
      .gte("service_date", startDate)
      .lt("service_date", endDate)
      .order("service_date", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) throw error;

    const headers = [
      "申請ID",
      "名前",
      "サービス日",
      "開始時間",
      "終了時間",
      "金額",
      "経費内容",
      "銀行名",
      "支店名",
      "支店番号",
      "記号",
      "番号",
      "領収書URL",
      "申請日時",
    ];

    const rows = (data ?? []).map((r) => [
      r.id,
      r.staff_name,
      r.service_date,
      r.service_start_time,
      r.service_end_time,
      r.expense_amount,
      r.expense_detail,
      r.bank_name,
      r.branch_name,
      r.branch_number,
      r.bank_symbol,
      r.account_number,
      r.receipt_photo_url,
      r.created_at,
    ]);

    const csv = [
      headers.map(csvEscape).join(","),
      ...rows.map((row) => row.map(csvEscape).join(",")),
    ].join("\r\n");

    const bom = "\uFEFF";

    return new NextResponse(bom + csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="expense_reimbursements_${month}.csv"`,
      },
    });
  } catch (e) {
    console.error("[expense csv] error", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "unknown error" },
      { status: 500 }
    );
  }
}