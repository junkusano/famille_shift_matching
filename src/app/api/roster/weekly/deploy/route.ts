// src/app/api/roster/weekly/deploy/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";

type DeployPolicy = "skip_conflict" | "overwrite_only" | "delete_month_insert";

export async function POST(req: Request) {
  try {
    const { month, kaipoke_cs_id, policy } = (await req.json()) as {
      month: string;
      kaipoke_cs_id: string;
      policy: DeployPolicy;
    };

    if (!month || !kaipoke_cs_id) {
      return NextResponse.json(
        { error: "month and kaipoke_cs_id are required" },
        { status: 400 }
      );
    }

    // ① いつものデプロイ（隔週なしで展開）
    const dep = await supabaseAdmin.rpc("deploy_weekly_template", {
      p_month: month,
      p_cs_id: kaipoke_cs_id,
      p_policy: policy,
    });
    if (dep.error) {
      console.error("[deploy] deploy_weekly_template error:", dep.error);
      return NextResponse.json(
        { error: `deploy failed: ${dep.error.message}` },
        { status: 500 }
      );
    }
    const inserted_count = Number(dep.data ?? 0);

    // ② 直後に「不要週」を削る
    const pr = await supabaseAdmin.rpc("prune_biweekly_nthweeks", {
      p_month: month,
      p_cs_id: kaipoke_cs_id,
    });
    if (pr.error) {
      console.error("[deploy] prune_biweekly_nthweeks error:", pr.error);
      return NextResponse.json(
        { error: `prune failed: ${pr.error.message}`, inserted_count },
        { status: 500 }
      );
    }
    const pruned_count = Number(pr.data ?? 0);

    return NextResponse.json(
      { inserted_count, pruned_count, status: "ok" },
      { status: 200 }
    );
  } catch (e: any) {
    console.error("[deploy] unhandled error:", e);
    return NextResponse.json(
      { error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}