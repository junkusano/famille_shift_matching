// src/app/api/roster/weekly/deploy/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";

type DeployPolicy = "skip_conflict" | "overwrite_only" | "delete_month_insert";

interface DeployRequestBody {
  month?: string;
  kaipoke_cs_id?: string;
  policy?: DeployPolicy;
}

interface ShiftWeeklyTemplate {
  weekday: number;               // 0(日)..6(土)
  start_time: string;            // 'HH:MM:SS'
  required_staff_count: number;
  nth_weeks: (number | string)[] | null;
  active: boolean;
  is_biweekly: boolean;
}

interface ShiftRow {
  shift_id: number;
  shift_start_date: string;      // 'YYYY-MM-DD'
  shift_start_time: string;      // 'HH:MM:SS'
  required_staff_count: number;
}

type TmplKey = string;

interface TmplInfo {
  nthWeeks: number[];
}

export async function POST(req: Request) {
  const tAllStart = Date.now();
  try {
    const body = (await req.json()) as DeployRequestBody;
    const month = body.month;
    const kaipoke_cs_id = body.kaipoke_cs_id;
    const policy: DeployPolicy = body.policy ?? "overwrite_only";

    console.log("[deploy] START", {
      month,
      kaipoke_cs_id,
      policy,
      at: new Date().toISOString(),
    });

    if (!month || !kaipoke_cs_id) {
      console.warn("[deploy] missing params", { month, kaipoke_cs_id });
      return NextResponse.json(
        { error: "month と kaipoke_cs_id は必須です" },
        { status: 400 }
      );
    }

    // ① DB側でシフト展開（ここが timeout しているかを確認したい）
    const tDeployStart = Date.now();
    console.log("[deploy] step1: call deploy_weekly_template RPC");

    const dep = await supabaseAdmin.rpc("deploy_weekly_template", {
      p_month: month,
      p_cs_id: kaipoke_cs_id,
      p_policy: policy,
    });

    const tDeployEnd = Date.now();
    console.log("[deploy] step1: RPC deploy_weekly_template finished", {
      ms: tDeployEnd - tDeployStart,
      error: dep.error ? dep.error.message : null,
      rawDataType: typeof dep.data,
    });

    if (dep.error) {
      console.error("[deploy] deploy_weekly_template error:", dep.error);
      return NextResponse.json(
        {
          error: `deploy_weekly_template failed: ${dep.error.message}`,
          at: new Date().toISOString(),
          elapsed_ms: tDeployEnd - tAllStart,
        },
        { status: 500 }
      );
    }

    const inserted_count = Number(dep.data ?? 0);
    console.log("[deploy] step1: inserted_count", { inserted_count });

    // ② 隔週テンプレート取得（is_biweekly=true & nth_weeksあり）
    const tTmplStart = Date.now();
    console.log("[deploy] step2: fetch biweekly templates");

    const tmplRes = await supabaseAdmin
      .from("shift_weekly_template")
      .select(
        "weekday, start_time, required_staff_count, nth_weeks, active, is_biweekly"
      )
      .eq("kaipoke_cs_id", kaipoke_cs_id)
      .eq("active", true)
      .eq("is_biweekly", true);

    const tTmplEnd = Date.now();
    console.log("[deploy] step2: templates fetched", {
      ms: tTmplEnd - tTmplStart,
      error: tmplRes.error ? tmplRes.error.message : null,
      count: tmplRes.data ? tmplRes.data.length : 0,
    });

    if (tmplRes.error) {
      console.error("[deploy] fetch templates error:", tmplRes.error);
      return NextResponse.json(
        {
          error: `template fetch failed: ${tmplRes.error.message}`,
          inserted_count,
          elapsed_ms: tTmplEnd - tAllStart,
        },
        { status: 500 }
      );
    }

    const templates = (tmplRes.data ?? []) as ShiftWeeklyTemplate[];

    // nth_weeks が空 or null のものは「制限なし」と見なして prune 対象外
    const tmplMap = new Map<TmplKey, TmplInfo>();

    for (const t of templates) {
      const weekday = Number(t.weekday);
      const start_time = t.start_time;
      const required_staff_count = Number(t.required_staff_count);

      const rawNth = t.nth_weeks;
      const nthArray: number[] = Array.isArray(rawNth)
        ? rawNth
            .map((v) => Number(v))
            .filter((n) => Number.isFinite(n) && n >= 1 && n <= 5)
        : [];

      // nth_weeks が空 or null なら「制限なし」→ prune 対象外
      if (nthArray.length === 0) {
        continue;
      }

      const key: TmplKey = `${weekday}|${start_time}|${required_staff_count}`;
      const existing = tmplMap.get(key);

      if (existing) {
        const set = new Set<number>([...existing.nthWeeks, ...nthArray]);
        tmplMap.set(key, {
          nthWeeks: Array.from(set).sort((a, b) => a - b),
        });
      } else {
        tmplMap.set(key, {
          nthWeeks: nthArray.sort((a, b) => a - b),
        });
      }
    }

    console.log("[deploy] step2: tmplMap built", {
      tmplCountRaw: templates.length,
      tmplMapSize: tmplMap.size,
    });

    if (tmplMap.size === 0) {
      const tEnd = Date.now();
      console.log("[deploy] END (no biweekly templates)", {
        inserted_count,
        pruned_count: 0,
        elapsed_ms: tEnd - tAllStart,
      });
      // 隔週テンプレ無し → prune 不要
      return NextResponse.json(
        { inserted_count, pruned_count: 0, status: "ok(no-biweekly)" },
        { status: 200 }
      );
    }

    // ③ 当月の shift を取得
    const tShiftStart = Date.now();
    console.log("[deploy] step3: fetch shifts for month");

    const startDate = `${month}-01`;
    const endDate = `${month}-31`; // 実際は存在する日だけヒットする前提

    const shiftRes = await supabaseAdmin
      .from("shift")
      .select(
        "shift_id, shift_start_date, shift_start_time, required_staff_count"
      )
      .eq("kaipoke_cs_id", kaipoke_cs_id)
      .gte("shift_start_date", startDate)
      .lte("shift_start_date", endDate);

    const tShiftEnd = Date.now();
    console.log("[deploy] step3: shifts fetched", {
      ms: tShiftEnd - tShiftStart,
      error: shiftRes.error ? shiftRes.error.message : null,
      count: shiftRes.data ? shiftRes.data.length : 0,
    });

    if (shiftRes.error) {
      console.error("[deploy] fetch shifts error:", shiftRes.error);
      return NextResponse.json(
        {
          error: `shift fetch failed: ${shiftRes.error.message}`,
          inserted_count,
          elapsed_ms: tShiftEnd - tAllStart,
        },
        { status: 500 }
      );
    }

    const shifts = (shiftRes.data ?? []) as ShiftRow[];

    // ④ nthWeek 判定して「不要な週」の shift_id を拾う
    const tPruneCalcStart = Date.now();
    console.log("[deploy] step4: calculate toDelete");

    const toDelete: number[] = [];

    for (const s of shifts) {
      const dateStr = s.shift_start_date; // 'YYYY-MM-DD'
      const timeStr = s.shift_start_time; // 'HH:MM:SS'
      const reqStaff = Number(s.required_staff_count);

      const date = new Date(`${dateStr}T00:00:00Z`);
      const day = date.getUTCDate(); // 1..31
      const dow = date.getUTCDay();  // 0(日)..6(土)

      // 第n◯曜日（1..5）: 1-7:1, 8-14:2, 15-21:3, 22-28:4, 29-末:5
      const nthWeek = Math.floor((day - 1) / 7) + 1;

      const key: TmplKey = `${dow}|${timeStr}|${reqStaff}`;
      const tmpl = tmplMap.get(key);
      if (!tmpl) {
        continue; // 対応テンプレ無し → 削除対象外
      }

      if (!tmpl.nthWeeks.includes(nthWeek)) {
        toDelete.push(Number(s.shift_id));
      }
    }

    const tPruneCalcEnd = Date.now();
    console.log("[deploy] step4: toDelete calculated", {
      ms: tPruneCalcEnd - tPruneCalcStart,
      shiftsCount: shifts.length,
      deleteCount: toDelete.length,
    });

    if (toDelete.length === 0) {
      const tEnd = Date.now();
      console.log("[deploy] END (no-delete)", {
        inserted_count,
        pruned_count: 0,
        elapsed_ms: tEnd - tAllStart,
      });
      return NextResponse.json(
        {
          inserted_count,
          pruned_count: 0,
          status: "ok(no-delete)",
        },
        { status: 200 }
      );
    }

    // ⑤ 削除を小さなバッチで実行（Timeout 回避用）
    const BATCH_SIZE = 100;
    let pruned_count = 0;

    
    const tDeleteStart = Date.now();
    console.log("[deploy] step5: delete batches", {
      totalDelete: toDelete.length,
      batchSize: BATCH_SIZE,
    });
    void tDeleteStart
    

    for (let i = 0; i < toDelete.length; i += BATCH_SIZE) {
      const batch = toDelete.slice(i, i + BATCH_SIZE);

      const delRes = await supabaseAdmin
        .from("shift")
        .delete()
        .in("shift_id", batch);

      if (delRes.error) {
        console.error(
          "[deploy] delete batch error:",
          delRes.error,
          "batchIds:",
          batch
        );
        const tError = Date.now();
        return NextResponse.json(
          {
            error: `delete failed: ${delRes.error.message}`,
            inserted_count,
            pruned_count,
            elapsed_ms: tError - tAllStart,
          },
          { status: 500 }
        );
      }

      pruned_count += batch.length;
      console.log("[deploy] step5: batch deleted", {
        batchSize: batch.length,
        pruned_count,
      });
    }

    const tEnd = Date.now();
    console.log("[deploy] END", {
      inserted_count,
      pruned_count,
      elapsed_ms: tEnd - tAllStart,
    });

    return NextResponse.json(
      {
        inserted_count,
        pruned_count,
        status: "ok",
      },
      { status: 200 }
    );
  } catch (e: unknown) {
    const tError = Date.now();
    const message =
      e instanceof Error ? e.message : typeof e === "string" ? e : String(e);
    console.error("[deploy] unhandled error:", e, {
      elapsed_ms: tError - tAllStart,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
