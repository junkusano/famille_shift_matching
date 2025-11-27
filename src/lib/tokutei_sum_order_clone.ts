// src/lib/tokutei_sum_order_clone.ts
import "server-only";
import { NextRequest } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase/service";
import { POST as sumOrderPost } from "@/app/api/tokutei/sum-order/route";

type ShiftLite = {
    shift_id: number;
    kaipoke_cs_id: string | null;
    shift_start_date: string; // "YYYY-MM-DD"
    shift_start_time: string; // "HH:MM:SS"
    shift_end_date: string | null;
    shift_end_time: string | null;
    tokutei_comment: string | null;
};

export type TokuteiCloneResult = {
    totalTargets: number; // 最終的に「処理対象」となった件数（チェーン除外後）
    processed: number;    // 実際にループを回して結果を積んだ件数（＝results.length）
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
 * @param options.limit    一度に処理する件数（デフォルト 200）
 * @param options.fromDate 何日以降のシフトだけを対象にする（YYYY-MM-DD）
 */
export async function runTokuteiSumOrderClone(options?: {
    limit?: number;
    fromDate?: string;
}): Promise<TokuteiCloneResult> {
    const limit = options?.limit ?? 200;
    const fromDate = options?.fromDate ?? null;

    // 1) 対象シフトを取得

    // 今日の日付（YYYY-MM-DD）
    const todayStr = new Date().toISOString().slice(0, 10);

    let query = supabase
        .from("shift")
        .select(
            "shift_id, shift_start_date, shift_start_time, shift_end_date, shift_end_time, kaipoke_cs_id, tokutei_comment"
        )
        .is("tokutei_comment", null)
        .order("shift_start_date", { ascending: true })
        .order("shift_start_time", { ascending: true })
        //.limit(limit);  //ここではlimitかけない　単にtokutei_comment is null だけでは連続シフトだけで満杯になることもあるから

    if (fromDate) {
        query = query.gte("shift_start_date", fromDate);
    }

    // 今日までのシフトだけを対象にする
    query = query.lte("shift_start_date", todayStr);

    const { data, error } = await query;

    if (error) {
        console.error("[tokutei/clone] shift select error", error);
        throw error;
    }

    const rows = (data ?? []) as ShiftLite[];

    // まず「tokutei_comment が空」かつ「fromDate～today」の範囲に該当するシフトが 0 件
    if (rows.length === 0) {
        console.info("[tokutei/clone] no target rows (before chain filter)");
        return {
            totalTargets: 0,
            processed: 0,
            results: [],
        };
    }

    // 2) チェーン途中のシフト（134920→134921 の「134921」みたいなやつ）を除外する

    // このバッチで対象になっている利用者ID一覧
    const csIds = Array.from(
        new Set(
            rows
                .map((r) => r.kaipoke_cs_id)
                .filter((id): id is string => !!id)
        )
    );

    type NeighborShift = {
        shift_id: number;
        kaipoke_cs_id: string | null;
        shift_start_date: string;
        shift_start_time: string;
        shift_end_date: string | null;
        shift_end_time: string | null;
    };

    let neighbors: NeighborShift[] = [];

    if (csIds.length > 0) {
        // ここで、その利用者さんたちのシフトを「前後判定用」に取得
        const { data: neighborData, error: neighborError } = await supabase
            .from("shift")
            .select(
                "shift_id, kaipoke_cs_id, shift_start_date, shift_start_time, shift_end_date, shift_end_time"
            )
            .in("kaipoke_cs_id", csIds)
            .lte("shift_start_date", todayStr); // fromDate があれば gte で絞ってもOK

        if (neighborError) {
            console.error(
                "[tokutei/clone] neighbor shift select error",
                neighborError
            );
            throw neighborError;
        }

        neighbors = (neighborData ?? []) as NeighborShift[];
    }

    // key: `${csId}__${endDate}__${endTime}`
    // value: true（この日時から連結して始まるシフトが存在する）※s1 の終了 → s2 の開始
    const prevIndex = new Set<string>();

    for (const s1 of neighbors) {
        const csId = s1.kaipoke_cs_id;
        if (!csId) continue;
        if (!s1.shift_end_time) continue; // 終了時刻がないものはチェーン判定対象外

        const endDate = s1.shift_end_date ?? s1.shift_start_date;
        if (!endDate) continue;

        const key = `${csId}__${endDate}__${s1.shift_end_time}`;
        prevIndex.add(key);
    }

    // rows から「チェーン途中」のレコードを除外したものが最終的な targets
    const targets = rows.filter((r) => {
        const csId = r.kaipoke_cs_id;
        if (!csId) return true; // 利用者IDないものは一旦対象のまま（ほぼ無い想定）

        const key = `${csId}__${r.shift_start_date}__${r.shift_start_time}`;

        // prevIndex に存在する ⇒ 直前に連結シフトがある ⇒ チェーン途中 ⇒ 処理対象外
        const isMiddleOfChain = prevIndex.has(key);

        if (isMiddleOfChain) {
            console.info(
                "[tokutei/clone] skip middle-of-chain shift",
                r.shift_id,
                r.kaipoke_cs_id,
                r.shift_start_date,
                r.shift_start_time
            );
        }

        return !isMiddleOfChain;
    });

    console.info(
        "[tokutei/clone] target rows (after chain filter) =",
        targets.length,
        "of",
        rows.length
    );

    if (targets.length === 0) {
        // このバッチ内に「処理すべきシフト」は無かった
        return {
            totalTargets: 0,
            processed: 0,
            results: [],
        };
    }

    // ★ ここで「このバッチで実際に処理する件数」を制限する
    const batchTargets = targets.slice(0, limit);

    console.log(
        "[tokutei/clone] target rows =",
        targets.length,
        "limit =",
        limit,
        "fromDate =",
        fromDate
    );

    const results: TokuteiCloneResult["results"] = [];

    // 3) 1件ずつ、既存の sum-order を呼び出す
    for (const r of batchTargets) {
        try {
            // ---- 前回シフト(prev) の検索ロジック ----

            // 同じ日で、開始時刻が r より前のシフト（あればそっちを優先）
            const { data: sameDayPrevData, error: sameDayPrevError } = await supabase
                .from("shift")
                .select("shift_id, shift_start_date, shift_start_time")
                .eq("kaipoke_cs_id", r.kaipoke_cs_id)
                .eq("shift_start_date", r.shift_start_date)
                .lt("shift_start_time", r.shift_start_time)
                .order("shift_start_time", { ascending: false })
                .limit(1); // ★ ここは 1 件で良い

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

            // ---- 前回シフトに「実施済みの訪問記録」があるかチェック ----
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

            // ---- /sum-order に渡す shift_id を「prev.shift_id」にする ----
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
                body: JSON.stringify({ shift_id: prev.shift_id }),
                headers: {
                    "content-type": "application/json",
                },
            });

            const res = await sumOrderPost(req);
            const json = (await res.json()) as SumOrderResponse;

            console.log("[tokutei/clone] sum-order response", {
                prev_shift_id: prev.shift_id,
                target_shift_id: r.shift_id,
                json,
            });

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
        totalTargets: targets.length,
        processed: results.length,
        results,
    };
}
