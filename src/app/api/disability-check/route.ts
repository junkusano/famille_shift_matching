//api/disability-check/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";

type Body = {
  yearMonth: string;
  kaipokeServicek: string;
  districts?: string[];
};

type UpdateBody = {
  kaipoke_cs_id: string;
  year_month: string;        // DB の year_month と同じ "YYYY-MM"
  kaipoke_servicek: string;  // "障害" or "移動支援"
  application_check: boolean;
};

export async function POST(req: NextRequest) {
  try {
    const { yearMonth, kaipokeServicek, districts = [] } = (await req.json()) as Body;

    // 変更後
    let query = supabaseAdmin
      .from("disability_check_view")
      .select(
        "kaipoke_cs_id,year_month,kaipoke_servicek,client_name,ido_jukyusyasho,is_checked,application_check,district"
      )
      .eq("year_month", yearMonth)
      .eq("kaipoke_servicek", kaipokeServicek)
      .order("district", { ascending: true })
      .order("client_name", { ascending: true });

    if (districts.length > 0) {
      query = query.in("district", districts);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json(data ?? []);
  } catch (e) {
    console.error("[disability-check] fetch error", e);
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }
}
export async function PUT(req: NextRequest) {
  try {
    const {
      kaipoke_cs_id,
      year_month,
      kaipoke_servicek,
      application_check,
    } = (await req.json()) as UpdateBody;

    if (!kaipoke_cs_id || !year_month || !kaipoke_servicek) {
      return NextResponse.json(
        { error: "missing parameters" },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin
      .from("disability_check")
      .upsert(
        [
          {
            kaipoke_cs_id,
            year_month,
            kaipoke_servicek,
            application_check,
            // is_checked は NOT NULL + default false なので
            // ここで指定しなくても insert 時は false が入る
          },
        ],
        {
          // uq_disability_check_unique (kaipoke_cs_id, year_month, kaipoke_servicek)
          onConflict: "kaipoke_cs_id,year_month,kaipoke_servicek",
        }
      );

    if (error) {
      console.error(
        "[disability-check] update error",
        error
      );
      return NextResponse.json(
        { error: "db_error", detail: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[disability-check] unexpected error", e);
    return NextResponse.json(
      { error: "unexpected_error" },
      { status: 500 }
    );
  }
}
