// src/lib/tokutei_sum_order_clone.ts
import "server-only";
import { NextRequest } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase/service";
import { POST as sumOrderPost } from "@/app/api/tokutei/sum-order/route";

type ShiftLite = {
  shift_id: number;
  shift_start_date: string | null;
  shift_start_time: string | null;
  kaipoke_cs_id: string | null;
  tokutei_comment: string | null;
};

export type TokuteiCloneResult = {
  totalTargets: number;
  processed: number;
  results: {
    shift_id: number;
    ok: boolean;
    wrote_to?: string;
    target_shift_id?: number;
    length?: number;
    error?: string;
  }[];
};

// /api/tokutei/sum-order のレスポンス想定型
type SumOrderResponse = {
  ok?: boolean;
  error?: string;
  wrote_to?: string;
  target_shift_id?: number;
  length?: number;
};

/**
 * 特定コメント クローン処理
 *
 * - tokutei_comment が空の shift を拾って
 *   既存の /api/tokutei/sum-order に投げる
 *
 * @param options.limit    一度に処理する件数（デフォルト 20）
 * @param options.fromDate 何日以降のシフトだけを対象にする（YYYY-MM-DD）
 */
export async function runTokuteiSumOrderClone(options?: {
  limit?: number;
  fromDate?: string;
}): Promise<TokuteiCloneResult> {
  const limit = options?.limit ?? 20;
  const fromDate = options?.fromDate ?? null;

  // 1) 対象シフトを取得
  let query = supabase
    .from("shift")
    .select(
      "shift_id, shift_start_date, shift_start_time, kaipoke_cs_id, tokutei_comment"
    )
    .is("tokutei_comment", null)
    .order("shift_start_date", { ascending: true })
    .order("shift_start_time", { ascending: true })
    .limit(limit);

  if (fromDate) {
    query = query.gte("shift_start_date", fromDate);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[tokutei/clone] shift select error", error);
    throw error;
  }

  const rows = (data ?? []) as ShiftLite[];

  console.log(
    "[tokutei/clone] target rows =",
    rows.length,
    "limit =",
    limit,
    "fromDate =",
    fromDate
  );

  const results: TokuteiCloneResult["results"] = [];

  // 2) 1件ずつ、既存の sum-order を呼び出す
  for (const r of rows) {
    try {
      console.log(
        "[tokutei/clone] start",
        r.shift_id,
        r.shift_start_date,
        r.shift_start_time,
        r.kaipoke_cs_id
      );

      const url = new URL(
        "/api/tokutei/sum-order",
        "http://localhost" // ベースはダミーでOK
      );

      const req = new NextRequest(url.toString(), {
        method: "POST",
        body: JSON.stringify({ shift_id: r.shift_id }),
        headers: {
          "content-type": "application/json",
        },
      });

      const res = await sumOrderPost(req);
      const json = (await res.json()) as SumOrderResponse;

      if (json.error) {
        console.warn(
          "[tokutei/clone] sum-order error",
          r.shift_id,
          json.error
        );
        results.push({
          shift_id: r.shift_id,
          ok: false,
          error: json.error,
        });
      } else {
        console.log(
          "[tokutei/clone] done",
          r.shift_id,
          "->",
          json.target_shift_id,
          "len=",
          json.length
        );
        results.push({
          shift_id: r.shift_id,
          ok: Boolean(json.ok),
          wrote_to: json.wrote_to,
          target_shift_id: json.target_shift_id,
          length: json.length,
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[tokutei/clone] error per shift", r.shift_id, msg);
      results.push({ shift_id: r.shift_id, ok: false, error: msg });
    }
  }

  return {
    totalTargets: rows.length,
    processed: results.length,
    results,
  };
}
