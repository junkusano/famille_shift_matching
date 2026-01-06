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
  defect_count: number;
  avg_3m_count: number | null;

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

function diffClass(curr: number | null | undefined, prev: number | null | undefined) {
  if (curr == null || prev == null) return "";
  const c = Math.round(curr);
  const p = Math.round(prev);
  if (c > p) return "text-blue-600";
  if (c < p) return "text-red-600";
  return "";
}

type Props = {
  title?: string;
  metric?: string;
};

export default function DefectSumBizStats({
  title = "チーム別 Lv5 到達件数",
  metric = "team_lv5_defect_count",
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
      .from("biz_stats_defect_sum_display_view")
      .select(
        "snapshot_month,year_month,orgunitid,orgunitname,value,avg_3m,displaylevel,sort_lv2_order,sort_lv3_order"
      )
      .eq("metric", metric)
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
      defect_count: Number(r.value ?? 0),
      avg_3m_count: r.avg_3m == null ? null : Number(r.avg_3m),

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
    const m = new Map<string, Map<string, { total: number; avg3: number | null }>>();
    for (const r of rows) {
      if (!m.has(r.orgunitid)) m.set(r.orgunitid, new Map());
      m.get(r.orgunitid)!.set(r.year_month, { total: r.defect_count, avg3: r.avg_3m_count });
    }
    return m;
  }, [rows]);

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle>{title}</CardTitle>
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

                const totalRow = (
                  <TableRow key={`${t.orgunitid}-total`}>
                    <TableCell className={`whitespace-nowrap ${cellBorderTop} ${isLv2 ? "font-bold" : ""}`}>
                      {t.orgunitname}
                    </TableCell>
                    <TableCell className={`whitespace-nowrap ${cellBorderTop} ${isLv2 ? "font-bold" : ""}`}>
                      単月
                    </TableCell>

                    {months.map((ym, i) => {
                      const curr = rowMap.get(ym)?.total ?? null;
                      const prevYm = i > 0 ? months[i - 1] : null;
                      const prevVal = prevYm ? rowMap.get(prevYm)?.total ?? null : null;
                      const cls = diffClass(curr, prevVal);

                      return (
                        <TableCell
                          key={`${t.orgunitid}-total-${ym}`}
                          className={`text-right ${cellBorderTop} ${isLv2 ? "font-bold" : ""} ${cls}`}
                        >
                          {formatNumInt(curr)}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );

                const avgRow = (
                  <TableRow key={`${t.orgunitid}-avg`}>
                    <TableCell className="whitespace-nowrap"></TableCell>
                    <TableCell className={`whitespace-nowrap font-semibold ${isLv2 ? "font-bold" : ""}`}>
                      3か月平均
                    </TableCell>

                    {months.map((ym, i) => {
                      const curr = rowMap.get(ym)?.avg3 ?? null;
                      const prevYm = i > 0 ? months[i - 1] : null;
                      const prevVal = prevYm ? rowMap.get(prevYm)?.avg3 ?? null : null;
                      const cls = diffClass(curr, prevVal);

                      return (
                        <TableCell
                          key={`${t.orgunitid}-avg-${ym}`}
                          className={`text-right font-semibold ${isLv2 ? "font-bold" : ""} ${cls}`}
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
          ※ 単月 = Lv5到達件数。3か月平均 = 当月を含む直近3か月の移動平均。
        </div>
      </CardContent>
    </Card>
  );
}
