// src/components/biz-stats/DefectSum.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";

type Row = {
    metric: string;
    snapshot_month: string; // date
    year_month: string;
    orgunitid: string;
    orgunitname: string;
    value: number;
    avg_3m: number | null;
};

function ymToMonthStart(ym: string) {
    // ym: YYYYMM
    const y = Number(ym.slice(0, 4));
    const m = Number(ym.slice(4, 6));
    return new Date(y, m - 1, 1);
}

function fmtYM(d: Date) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return `${y}${m}`;
}

function buildYmOptions(centerYm: string, span = 6) {
    const center = ymToMonthStart(centerYm);
    const out: string[] = [];
    for (let i = -span; i <= span; i++) {
        const d = new Date(center.getFullYear(), center.getMonth() + i, 1);
        out.push(fmtYM(d));
    }
    return out;
}

export default function DefectSum() {
    const now = useMemo(() => new Date(), []);
    const initialYm = useMemo(() => fmtYM(new Date(now.getFullYear(), now.getMonth(), 1)), [now]);

    const [yearMonth, setYearMonth] = useState(initialYm);
    const [loading, setLoading] = useState(false);
    const [recalcLoading, setRecalcLoading] = useState(false);
    const [rows, setRows] = useState<Row[]>([]);
    const ymOptions = useMemo(() => buildYmOptions(yearMonth, 6), [yearMonth]);

    async function load() {
        setLoading(true);
        try {
            const monthStart = ymToMonthStart(yearMonth);
            const yyyy = monthStart.getFullYear();
            const mm = String(monthStart.getMonth() + 1).padStart(2, "0");
            const snapshotMonthStr = `${yyyy}-${mm}-01`;

            // load() 内のクエリだけ差し替え
            const { data, error } = await supabase
                .from("biz_stats_defect_sum_display_view")
                .select("metric,snapshot_month,year_month,orgunitid,orgunitname,value,avg_3m,displaylevel,sort_lv2_order,sort_lv3_order")
                .eq("metric", "team_lv5_defect_count")
                .eq("snapshot_month", snapshotMonthStr)
                .order("sort_lv2_order", { ascending: true })
                .order("displaylevel", { ascending: true })
                .order("sort_lv3_order", { ascending: true })
                .order("orgunitname", { ascending: true });


            if (error) throw error;
            setRows((data ?? []) as Row[]);
        } finally {
            setLoading(false);
        }
    }

    async function recalc() {
        setRecalcLoading(true);
        try {
            const { data: s } = await supabase.auth.getSession();
            const token = s.session?.access_token;
            if (!token) throw new Error("no session");

            const res = await fetch("/api/defect-sum", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ year_month: yearMonth }),
            });

            const j = await res.json();
            if (!res.ok) throw new Error(j?.error ?? "recalc failed");

            await load();
        } finally {
            setRecalcLoading(false);
        }
    }

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [yearMonth]);

    const sorted = useMemo(() => {
        const isTail = (id: string) => id === "TOTAL" || id === "UNASSIGNED";
        const head: Row[] = [];
        const tail: Row[] = [];
        for (const r of rows) (isTail(r.orgunitid) ? tail : head).push(r);
        return [...head, ...tail];
    }, [rows]);


    return (
        <div className="p-3 border rounded-md bg-white">
            <div className="flex items-center gap-3">
                <div className="text-lg font-bold">チーム別 Lv5 到達件数</div>

                <select
                    className="border rounded px-2 py-1 text-sm"
                    value={yearMonth}
                    onChange={(e) => setYearMonth(e.target.value)}
                >
                    {ymOptions.map((ym) => (
                        <option key={ym} value={ym}>
                            {ym.slice(0, 4)}年{ym.slice(4, 6)}月
                        </option>
                    ))}
                </select>

                <Button onClick={recalc} disabled={recalcLoading}>
                    {recalcLoading ? "再計算中..." : "再計算"}
                </Button>

                {loading && <div className="text-sm text-muted-foreground">読み込み中...</div>}
            </div>

            <div className="mt-3 overflow-auto">
                <table className="min-w-[720px] w-full text-sm border-collapse">
                    <thead>
                        <tr className="border-b">
                            <th className="text-left p-2">チーム</th>
                            <th className="text-right p-2">件数</th>
                            <th className="text-right p-2">3ヶ月平均</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sorted.map((r) => (
                            <tr key={r.orgunitid} className="border-b">
                                <td className="p-2">{r.orgunitname}</td>
                                <td className="p-2 text-right">{Number(r.value ?? 0).toFixed(0)}</td>
                                <td className="p-2 text-right">{r.avg_3m == null ? "-" : r.avg_3m.toFixed(2)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
