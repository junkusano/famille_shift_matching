// src/app/portal/dashboard/page.tsx
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
    month_start: string; // YYYY-MM-DD
    year_month: string;  // YYYYMM
    orgunitid: string;
    orgunitname: string;
    total_hours: number;
    avg_3m_hours: number | null;
};

function ymToMonthStart(ym: string) {
    // ym: "YYYYMM" or "YYYY-MM"
    if (ym.includes("-")) return `${ym}-01`;
    return `${ym.slice(0, 4)}-${ym.slice(4, 6)}-01`;
}

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
    return new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 0 }).format(Math.round(v));
}

function diffClass(curr: number | null | undefined, prev: number | null | undefined) {
    if (curr == null || prev == null) return "";
    const c = Math.round(curr);
    const p = Math.round(prev);
    if (c > p) return "text-blue-600";
    if (c < p) return "text-red-600";
    return "";
}

export default function DashboardPage() {
    const today = useMemo(() => new Date(), []);
    const defaultFrom = useMemo(() => toYYYYMM(addMonths(today, -6)), [today]);
    const defaultTo = useMemo(() => toYYYYMM(addMonths(today, 2)), [today]);

    const [fromYM, setFromYM] = useState(defaultFrom); // YYYYMM
    const [toYM, setToYM] = useState(defaultTo);       // YYYYMM
    const [rows, setRows] = useState<Row[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string>("");

    const [recalcYM, setRecalcYM] = useState<string>(defaultFrom); // 初期は適当でOK
    const [recalcLoading, setRecalcLoading] = useState(false);
    const [recalcError, setRecalcError] = useState<string>("");


    async function load() {
        setLoading(true);
        setError("");

        const from = ymToMonthStart(fromYM);
        const to = ymToMonthStart(toYM);

        const { data, error } = await supabase
            .from("biz_stats_shift_sum")
            .select("snapshot_month,year_month,orgunitid,orgunitname,value,avg_3m")
            .eq("metric", "team_service_hours")
            .gte("snapshot_month", from)
            .lte("snapshot_month", to)
            .order("snapshot_month", { ascending: true })
            .order("orgunitname", { ascending: true });

        if (error) {
            setError(error.message ?? "failed to load");
            setRows([]);
            setLoading(false);
            return;
        }

        // ✅ snapshot → Row へ変換（ここがポイント）
        const mapped: Row[] = (data ?? []).map((r) => ({
            month_start: r.snapshot_month as string,
            year_month: r.year_month as string,
            orgunitid: r.orgunitid as string,
            orgunitname: r.orgunitname as string,
            total_hours: Number(r.value ?? 0),
            avg_3m_hours: r.avg_3m == null ? null : Number(r.avg_3m),
        }));

        setRows(mapped);
        setLoading(false);

    }

    async function runRecalc() {
        setRecalcLoading(true);
        setRecalcError("");

        try {
            const res = await fetch("/api/shift-sum", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ year_month: recalcYM }),
            });
            const json = (await res.json()) as { ok?: boolean; error?: string };

            if (!res.ok) {
                setRecalcError(json.error ?? "再計算に失敗しました");
                setRecalcLoading(false);
                return;
            }

            // 実行後に再読み込み
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
        // orgunitid でまとめ（表示は orgunitname）
        const map = new Map<string, { orgunitid: string; orgunitname: string }>();
        for (const r of rows) {
            if (!map.has(r.orgunitid)) map.set(r.orgunitid, { orgunitid: r.orgunitid, orgunitname: r.orgunitname });
        }
        // TOTAL を最後に
        const list = Array.from(map.values()).sort((a, b) => {
            if (a.orgunitid === "TOTAL") return 1;
            if (b.orgunitid === "TOTAL") return -1;
            return a.orgunitname.localeCompare(b.orgunitname, "ja");
        });
        return list;
    }, [rows]);

    const pivot = useMemo(() => {
        // pivot[orgunitid][year_month] = { total, avg3 }
        const m = new Map<string, Map<string, { total: number; avg3: number | null }>>();
        for (const r of rows) {
            if (!m.has(r.orgunitid)) m.set(r.orgunitid, new Map());
            m.get(r.orgunitid)!.set(r.year_month, { total: r.total_hours, avg3: r.avg_3m_hours });
        }
        return m;
    }, [rows]);

    return (
        <div className="p-4 space-y-4">
            <Card>
                <CardHeader>
                    <CardTitle>チーム別サービス時間実績</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="flex flex-wrap gap-2 items-end">
                        <div>
                            <div className="text-sm text-muted-foreground">From (YYYYMM)</div>
                            <Input value={fromYM} onChange={(e) => setFromYM(e.target.value)} className="w-32" />
                        </div>
                        <div>
                            <div className="text-sm text-muted-foreground">To (YYYYMM)</div>
                            <Input value={toYM} onChange={(e) => setToYM(e.target.value)} className="w-32" />
                        </div>
                        <Button onClick={load} disabled={loading}>
                            {loading ? "読込中..." : "更新"}
                        </Button>
                        {error && <div className="text-sm text-red-600">{error}</div>}

                        <select
                            className="h-10 rounded-md border px-2 text-sm"
                            value={recalcYM}
                            onChange={(e) => setRecalcYM(e.target.value)}
                        >
                            {/* もし months が空のときの保険 */}
                            {(months.length ? months : [fromYM, toYM]).map((ym) => (
                                <option key={ym} value={ym}>{ym}</option>
                            ))}
                        </select>

                        <Button onClick={runRecalc} disabled={recalcLoading}>
                            {recalcLoading ? "再計算中..." : "再計算"}
                        </Button>

                        {recalcError && <div className="text-sm text-red-600">{recalcError}</div>}

                    </div>

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
                                {teams.map((t) => {
                                    const rowMap = pivot.get(t.orgunitid) ?? new Map();
                                    const totalRow = (
                                        <TableRow key={`${t.orgunitid}-total`}>
                                            <TableCell className="whitespace-nowrap">{t.orgunitname}</TableCell>
                                            <TableCell className="whitespace-nowrap">単月</TableCell>
                                            {months.map((ym, i) => {
                                                const curr = rowMap.get(ym)?.total ?? null;
                                                const prevYm = i > 0 ? months[i - 1] : null;
                                                const prev = prevYm ? rowMap.get(prevYm)?.total ?? null : null;
                                                const cls = diffClass(curr, prev);

                                                return (
                                                    <TableCell key={`${t.orgunitid}-total-${ym}`} className={`text-right ${cls}`}>
                                                        {formatNumInt(curr)}
                                                    </TableCell>
                                                );
                                            })}

                                        </TableRow>
                                    );
                                    const avgRow = (
                                        <TableRow key={`${t.orgunitid}-avg`} >
                                            <TableCell className="whitespace-nowrap"></TableCell>
                                            <TableCell className="whitespace-nowrap font-semibold">3か月平均</TableCell>
                                            {months.map((ym, i) => {
                                                const curr = rowMap.get(ym)?.avg3 ?? null;
                                                const prevYm = i > 0 ? months[i - 1] : null;
                                                const prev = prevYm ? rowMap.get(prevYm)?.avg3 ?? null : null;
                                                const cls = diffClass(curr, prev);

                                                return (
                                                    <TableCell
                                                        key={`${t.orgunitid}-avg-${ym}`}
                                                        className={`text-right font-semibold ${cls}`}
                                                    >
                                                        {formatNumInt(curr)}
                                                    </TableCell>
                                                );
                                            })}

                                        </TableRow>
                                    );
                                    return (
                                        <Fragment key={t.orgunitid}>
                                            {totalRow}
                                            {avgRow}
                                        </Fragment>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>

                    <div className="text-xs text-muted-foreground">
                        ※ 単月 = Σ(シフト時間[h] × 参加人数)。3か月平均 = 当月を含む直近3か月の移動平均。
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
