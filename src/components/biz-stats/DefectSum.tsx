"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";

type Row = {
    month_start: string;
    year_month: string;
    orgunitid: string;
    orgunitname: string;

    defect_count: number;          // Lv5到達件数
    avg_3m_count: number | null;   // 3か月平均（件数）

    defect_rate: number;           // 不備率（0〜1）
    defect_rate_avg_3m: number | null; // 3か月平均（不備率）

    displaylevel: number | null;
    sort_lv2_order: number | null;
    sort_lv3_order: number | null;
};


function addMonths(date: Date, delta: number) {
    const d = new Date(date);
    d.setMonth(d.getMonth() + delta);
    return d;
}

function toYYYYMM(d: Date) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return `${y}${m}`;
}

function formatNumInt(v: number | null | undefined) {
    if (v == null || Number.isNaN(v)) return "";
    return new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 0 }).format(
        Math.round(v)
    );
}

function diffClassDefect(curr?: number | null, prev?: number | null) {
    if (curr == null || prev == null) return "";
    if (curr > prev) return "text-red-600";   // 悪化
    if (curr < prev) return "text-blue-600";  // 改善
    return "";
}

function formatRate(v: number | null | undefined) {
    if (v == null) return "";
    return `${(v * 100).toFixed(2)}%`;
}

// 不備率の絶対値判定（1%超で赤）
function rateClassByThreshold(rate?: number | null) {
    if (rate == null) return "";
    return rate > 0.01 ? "text-red-600" : "";
}


type Props = {
    title?: string;
    //metric?: string;
};

export default function DefectSumBizStats({
    title = "不備件数・不備率　（アラート Lv5 到達）",
    //metric = "team_lv5_defect_count",
}: Props) {
    const today = useMemo(() => new Date(), []);
    const defaultFrom = useMemo(() => toYYYYMM(addMonths(today, -6)), [today]);
    const defaultTo = useMemo(() => toYYYYMM(addMonths(today, 2)), [today]);

    const [fromYM, setFromYM] = useState(defaultFrom);
    const [toYM, setToYM] = useState(defaultTo);
    const [rows, setRows] = useState<Row[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string>("");

    // ✅ 再計算：±6か月（ShiftSumと同じ）
    const recalcOptions = useMemo(() => {
        const base = new Date(today.getFullYear(), today.getMonth(), 1);
        return Array.from({ length: 13 }, (_, i) => toYYYYMM(addMonths(base, i - 6))); // -6..+6
    }, [today]);

    const currentYM = useMemo(() => {
        const base = new Date(today.getFullYear(), today.getMonth(), 1);
        return toYYYYMM(base);
    }, [today]);

    const [recalcYM, setRecalcYM] = useState<string>(currentYM);
    const [recalcLoading, setRecalcLoading] = useState(false);
    const [recalcError, setRecalcError] = useState<string>("");

    async function load() {
        setLoading(true);
        setError("");

        const { data, error } = await supabase
            .from("biz_stats_defect_rate_view") // ★ここ重要
            .select(
                "snapshot_month,year_month,orgunitid,orgunitname,defect_count,defect_avg_3m,defect_rate,defect_rate_avg_3m,displaylevel,sort_lv2_order,sort_lv3_order"
            )
            .gte("year_month", fromYM)
            .lte("year_month", toYM)
            .order("sort_lv2_order", { ascending: true })
            .order("displaylevel", { ascending: true })
            .order("sort_lv3_order", { ascending: true })
            .order("orgunitname", { ascending: true });


        if (error) {
            setError(error.message ?? "failed to load");
            setRows([]);
            setLoading(false);
            return;
        }

        const mapped: Row[] = (data ?? []).map((r) => ({
            month_start: r.snapshot_month as string,
            year_month: r.year_month as string,
            orgunitid: r.orgunitid as string,
            orgunitname: r.orgunitname as string,

            defect_count: Number(r.defect_count ?? 0),
            avg_3m_count: (r).defect_avg_3m == null ? null : Number(r.defect_avg_3m),

            defect_rate: Number((r).defect_rate ?? 1),
            defect_rate_avg_3m: (r).defect_rate_avg_3m == null ? null : Number(r.defect_rate_avg_3m),

            displaylevel: r.displaylevel == null ? null : Number(r.displaylevel),
            sort_lv2_order: r.sort_lv2_order == null ? null : Number(r.sort_lv2_order),
            sort_lv3_order: r.sort_lv3_order == null ? null : Number(r.sort_lv3_order),
        }));

        setRows(mapped);
        setLoading(false);
    }

    async function runRecalc() {
        setRecalcLoading(true);
        setRecalcError("");

        try {
            const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
            if (sessionErr) {
                setRecalcError("セッション取得に失敗しました");
                return;
            }
            const token = sessionData.session?.access_token;
            if (!token) {
                setRecalcError("ログインしてください");
                return;
            }

            const res = await fetch("/api/defect-sum", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ year_month: recalcYM }),
            });

            const json = (await res.json()) as { ok?: boolean; error?: string };

            if (!res.ok) {
                setRecalcError(json.error ?? "再計算に失敗しました");
                return;
            }

            await load();
        } catch {
            setRecalcError("再計算に失敗しました");
        } finally {
            setRecalcLoading(false);
        }
    }

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const months = useMemo(() => {
        const set = new Set(rows.map((r) => r.year_month));
        return Array.from(set).sort();
    }, [rows]);

    const teams = useMemo(() => {
        const seen = new Set<string>();
        const list: Array<{ orgunitid: string; orgunitname: string; displaylevel: number | null }> =
            [];

        for (const r of rows) {
            if (seen.has(r.orgunitid)) continue;
            seen.add(r.orgunitid);
            list.push({ orgunitid: r.orgunitid, orgunitname: r.orgunitname, displaylevel: r.displaylevel });
        }

        const isTail = (id: string) => id === "TOTAL" || id === "UNASSIGNED";
        const head = list.filter((x) => !isTail(x.orgunitid));
        const tail = list.filter((x) => isTail(x.orgunitid));
        return [...head, ...tail];
    }, [rows]);

    const pivot = useMemo(() => {
        const m = new Map<string, Map<string, { defect: number; rate: number; rateAvg: number | null }>>();

        for (const r of rows) {
            if (!m.has(r.orgunitid)) m.set(r.orgunitid, new Map());
            m.get(r.orgunitid)!.set(r.year_month, {
                defect: r.defect_count,
                rate: r.defect_rate,
                rateAvg: r.defect_rate_avg_3m,
            });
        }
        return m;
    }, [rows]);


    return (
        <Card>
            <CardHeader className="space-y-1">
                <CardTitle>{title}</CardTitle>
                <div className="text-sm text-muted-foreground">
          シニアマネジャー・マネジャーの報酬決定・足切りはこの数字で決定。詳細は{" "}
          <a
            href="https://talk.worksmobile.com/note/99142491/4090000000158760277"
            className="underline"
            target="_blank"
            rel="noreferrer"
          >
            ★重要：マネジャーへの期待値・報酬体系が変わります
          </a>{" "}
          で確認してください。
        </div>
            </CardHeader>

            <CardContent className="space-y-3">
                {/* ✅ 上部UI：ShiftSumと同型 */}
                <div className="flex flex-nowrap gap-2 items-end overflow-x-auto whitespace-nowrap">
                    <div>
                        <div className="text-sm text-muted-foreground">From (YYYYMM)</div>
                        <Input value={fromYM} onChange={(e) => setFromYM(e.target.value)} className="w-32" />
                    </div>

                    <div>
                        <div className="text-sm text-muted-foreground">To (YYYYMM)</div>
                        <Input value={toYM} onChange={(e) => setToYM(e.target.value)} className="w-32" />
                    </div>

                    <Button className="shrink-0" onClick={load} disabled={loading}>
                        {loading ? "読込中..." : "更新"}
                    </Button>
                    {error && <div className="text-sm text-red-600 shrink-0">{error}</div>}

                    <select
                        className="h-10 w-24 shrink-0 rounded-md border px-2 text-sm"
                        value={recalcYM}
                        onChange={(e) => setRecalcYM(e.target.value)}
                    >
                        {recalcOptions.map((ym) => (
                            <option key={ym} value={ym}>
                                {ym}
                            </option>
                        ))}
                    </select>

                    <Button className="shrink-0" onClick={runRecalc} disabled={recalcLoading}>
                        {recalcLoading ? "再計算中..." : "再計算"}
                    </Button>

                    {recalcError && <div className="text-sm text-red-600 shrink-0">{recalcError}</div>}
                </div>

                {/* ✅ 年月推移（ピボット）：ShiftSumと同型 */}
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="whitespace-nowrap">チーム</TableHead>
                                <TableHead className="whitespace-nowrap">種別</TableHead>
                                {months.map((ym) => (
                                    <TableHead key={ym} className="text-right whitespace-nowrap">
                                        {ym}
                                    </TableHead>
                                ))}
                            </TableRow>
                        </TableHeader>

                        <TableBody>
                            {teams.map((t, idx) => {
                                const rowMap = pivot.get(t.orgunitid) ?? new Map();
                                const isLv2 = t.displaylevel === 2;
                                const isTotal = t.orgunitid === "TOTAL";

                                // 罫線ルールも ShiftSum踏襲（Lv2塊の先頭、Total直前）
                                const prev = idx > 0 ? teams[idx - 1] : null;
                                const borderTop =
                                    (isLv2 && prev && prev.displaylevel !== 2) || // Lv2の塊の先頭
                                    isTotal;

                                const cellBorderTop = borderTop ? "border-t border-border" : "";

                                const countRow = (
                                    <TableRow key={`${t.orgunitid}-count`}>
                                        <TableCell className={`whitespace-nowrap ${cellBorderTop} ${isLv2 ? "font-bold" : ""}`}>
                                            {t.orgunitname}
                                        </TableCell>
                                        <TableCell className={`whitespace-nowrap ${cellBorderTop} ${isLv2 ? "font-bold" : ""}`}>
                                            単月（件数）
                                        </TableCell>

                                        {months.map((ym, i) => {
                                            const curr = rowMap.get(ym)?.defect ?? null;
                                            const prevYm = i > 0 ? months[i - 1] : null;
                                            const prevVal = prevYm ? rowMap.get(prevYm)?.defect ?? null : null;
                                            const cls = diffClassDefect(curr, prevVal); // ★不備は悪化=赤/改善=青

                                            return (
                                                <TableCell
                                                    key={`${t.orgunitid}-count-${ym}`}
                                                    className={`text-right ${cellBorderTop} ${isLv2 ? "font-bold" : ""} ${cls}`}
                                                >
                                                    {formatNumInt(curr ?? 0)}
                                                </TableCell>
                                            );
                                        })}
                                    </TableRow>
                                );

                                const rateRow = (
                                    <TableRow key={`${t.orgunitid}-rate`}>
                                        <TableCell className="whitespace-nowrap"></TableCell>
                                        <TableCell className={`whitespace-nowrap font-semibold ${isLv2 ? "font-bold" : ""}`}>
                                            不備率
                                        </TableCell>

                                        {months.map((ym) => {
                                            const curr = rowMap.get(ym)?.rate ?? null;
                                            const cls = rateClassByThreshold(curr);

                                            return (
                                                <TableCell
                                                    key={`${t.orgunitid}-rate-${ym}`}
                                                    className={`text-right font-semibold ${isLv2 ? "font-bold" : ""} ${cls}`}
                                                >
                                                    {formatRate(curr)}
                                                </TableCell>
                                            );
                                        })}

                                    </TableRow>
                                );

                                const rateAvgRow = (
                                    <TableRow key={`${t.orgunitid}-rateavg`}>
                                        <TableCell className="whitespace-nowrap"></TableCell>
                                        <TableCell className={`whitespace-nowrap font-semibold ${isLv2 ? "font-bold" : ""}`}>
                                            3か月平均（不備率）
                                        </TableCell>

                                        {months.map((ym) => {
                                            const curr = rowMap.get(ym)?.rateAvg ?? null;
                                            const cls = rateClassByThreshold(curr);

                                            return (
                                                <TableCell
                                                    key={`${t.orgunitid}-rateavg-${ym}`}
                                                    className={`text-right font-semibold ${isLv2 ? "font-bold" : ""} ${cls}`}
                                                >
                                                    {formatRate(curr)}
                                                </TableCell>
                                            );
                                        })}
                                    </TableRow>
                                );

                                return (
                                    <Fragment key={t.orgunitid}>
                                        {countRow}
                                        {rateRow}
                                        {rateAvgRow}
                                    </Fragment>
                                );
                            })}
                        </TableBody>
                    </Table>
                </div>

                <div className="text-xs text-muted-foreground">
                    ※ 単月 = Lv5到達件数。<br />
                    ※ 3か月平均 = 当月を含む直近3か月の移動平均。<br />
                    ※ 不備率 = Lv5到達件数 ÷ サービス時間。<br />
                </div>
            </CardContent>
        </Card>
    );
}
