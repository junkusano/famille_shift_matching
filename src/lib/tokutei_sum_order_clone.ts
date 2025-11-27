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

    // ★テスト対象の利用者ID
    const TARGET_CS_ID = "7310167" as const;

    // 1) 対象シフトを取得

    // ★ 今日の日付（YYYY-MM-DD）を作成
    const todayStr = new Date().toISOString().slice(0, 10); // "2025-11-27" みたいな形式

    let query = supabase
        .from("shift")
        .select(
            "shift_id, shift_start_date, shift_start_time, kaipoke_cs_id, tokutei_comment"
        )
        // ★ここで利用者を絞るように変更
        .eq("kaipoke_cs_id", TARGET_CS_ID)
        .is("tokutei_comment", null)
        .order("shift_start_date", { ascending: true })
        .order("shift_start_time", { ascending: true })
        .limit(limit);

    if (fromDate) {
        query = query.gte("shift_start_date", fromDate);
    }

    // ★ ここを追加：今日までのシフトだけを対象にする
    query = query.lte("shift_start_date", todayStr);

    const { data, error } = await query;

    if (error) {
        console.error("[tokutei/clone] shift select error", error);
        throw error;
    }

    // ここはそのまま配列にキャスト（テストのためこれを消して下の２行を有効にする）
    const rows = (data ?? []) as ShiftLite[];

    // ① Supabase からの結果を ShiftLite[] にキャスト
    //const allRows = (data ?? []) as ShiftLite[];

    /* 
    ② この方だけに絞る（テスト用）
    const TARGET_CS_ID = "7310167"; // ← 今回テストしたい利用者
    const rows: ShiftLite[] = allRows.filter(
      (r) => r.kaipoke_cs_id === TARGET_CS_ID
    );
    */

    // ③ 対象が無ければ何もせず終了
    if (rows.length === 0) {
        return {
            totalTargets: 0,
            processed: 0,
            results: [],
        };
    }

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
            // ★ここを追加：「r（コメントを入れたいシフト）」の一つ前(prev)を探す

            // 同じ日で、開始時刻が r より前のシフト（あればそっちを優先）
            const { data: sameDayPrevData, error: sameDayPrevError } = await supabase
                .from("shift")
                .select("shift_id, shift_start_date, shift_start_time")
                .eq("kaipoke_cs_id", r.kaipoke_cs_id)
                .eq("shift_start_date", r.shift_start_date)
                .lt("shift_start_time", r.shift_start_time)
                .order("shift_start_time", { ascending: false })
                .limit(1);

            if (sameDayPrevError) {
                console.error(
                    "[tokutei/clone] same-day prev shift error",
                    r.shift_id,
                    sameDayPrevError
                );
            }

            const sameDayPrev = (sameDayPrevData ?? [])[0] as
                | { shift_id: number; shift_start_date: string | null; shift_start_time: string | null }
                | undefined;

            // 前日以前のシフト（同じ利用者で、日付が r より前のもの）
            let prevDayPrev: typeof sameDayPrev = undefined;

            if (!sameDayPrev) {
                const { data: prevDayData, error: prevDayError } = await supabase
                    .from("shift")
                    .select("shift_id, shift_start_date, shift_start_time")
                    .eq("kaipoke_cs_id", r.kaipoke_cs_id)
                    .lt("shift_start_date", r.shift_start_date)
                    .order("shift_start_date", { ascending: false })
                    .order("shift_start_time", { ascending: false })
                    .limit(1);

                if (prevDayError) {
                    console.error(
                        "[tokutei/clone] prev-day prev shift error",
                        r.shift_id,
                        prevDayError
                    );
                }

                prevDayPrev = (prevDayData ?? [])[0] as typeof sameDayPrev;
            }

            const prev = sameDayPrev ?? prevDayPrev;

            if (!prev) {
                // 前回シフトが無ければ、この r にはコメントを付けられないのでスキップ
                console.warn(
                    "[tokutei/clone] no previous shift found for",
                    r.shift_id,
                    r.shift_start_date,
                    r.shift_start_time,
                    r.kaipoke_cs_id
                );
                results.push({
                    shift_id: r.shift_id,
                    ok: false,
                    error: "previous shift not found",
                });
                continue;
            }
            // ★★ ここを追加：前回シフトに「実施済みの訪問記録」があるかチェック ★★
            const { data: recRows, error: recError } = await supabase
                .from("shift_records")
                .select("id")
                .eq("shift_id", prev.shift_id)
                .in("status", ["submitted", "approved", "archived"])
                .limit(1);

            if (recError) {
                console.error(
                    "[tokutei/clone] shift_records check error",
                    prev.shift_id,
                    recError
                );
                results.push({
                    shift_id: r.shift_id,
                    ok: false,
                    error: "shift_records check error",
                });
                continue;
            }

            if (!recRows || recRows.length === 0) {
                // 訪問記録が無い（＝まだ実施されていない）ので、このターゲットはスキップ
                console.log(
                    "[tokutei/clone] skip (no executed record)",
                    "prev_shift_id=",
                    prev.shift_id,
                    "-> target_shift_id=",
                    r.shift_id,
                    r.shift_start_date,
                    r.shift_start_time
                );
                results.push({
                    shift_id: r.shift_id,
                    ok: false,
                    error: "skip: no executed record",
                });
                continue;
            }

            // ★ここから先で /sum-order に渡す shift_id を「prev.shift_id」に変更
            console.log(
                "[tokutei/clone] start (prev -> target)",
                prev.shift_id,
                "->",
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
                // ★ここ：current として「前回シフト prev.shift_id」を投げる
                body: JSON.stringify({ shift_id: prev.shift_id }),
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
                    prev.shift_id,
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
