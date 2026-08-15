"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type StaffMonthlyStatsRow = {
  month: string;
  hired_count: number;
  retired_count: number;
  active_count: number;
  fulltime_count: number;
  other_count: number;
  working_count: number;
};

const formatNumber = (value: number) => new Intl.NumberFormat("ja-JP").format(value);
const monthStart = (ym: string) => `${ym.slice(0, 4)}-${ym.slice(4, 6)}-01`;
const monthKey = (date: Date) => `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}`;

export default function EntrySumBizStats() {
  const now = useMemo(() => new Date(), []);
  const currentYm = useMemo(() => monthKey(now), [now]);
  const defaultFrom = useMemo(() => {
    const date = new Date(now.getFullYear(), now.getMonth() - 12, 1);
    return monthKey(date);
  }, [now]);
  const [fromYm, setFromYm] = useState(defaultFrom);
  const [toYm, setToYm] = useState(currentYm);
  const [rows, setRows] = useState<StaffMonthlyStatsRow[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    if (!/^\d{6}$/.test(fromYm) || !/^\d{6}$/.test(toYm) || fromYm > toYm || toYm > currentYm) {
      setError("期間は YYYYMM 形式で、現在月までを指定してください。");
      return;
    }
    setLoading(true);
    setError("");
    const { data, error: queryError } = await supabase
      .from("staff_monthly_stats")
      .select("month,hired_count,retired_count,active_count,fulltime_count,other_count,working_count")
      .gte("month", monthStart(fromYm))
      .lte("month", monthStart(toYm))
      .order("month", { ascending: true });
    if (queryError) {
      setError(queryError.message);
      setRows([]);
    } else {
      setRows((data ?? []) as StaffMonthlyStatsRow[]);
    }
    setLoading(false);
  }

  useEffect(() => { void load(); }, []); // Initial dashboard load.

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle>人員推移（月次）</CardTitle>
        <div className="text-sm text-muted-foreground">
          採用・退職・月末在籍・実働（サービス時間集計と同じ対象シフト）を月単位で表示します。
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-3 items-end flex-wrap">
          <label className="text-sm text-muted-foreground">From (YYYYMM)<Input value={fromYm} onChange={(event) => setFromYm(event.target.value)} className="w-32" /></label>
          <label className="text-sm text-muted-foreground">To (YYYYMM)<Input value={toYm} onChange={(event) => setToYm(event.target.value)} className="w-32" /></label>
          <Button onClick={() => void load()} disabled={loading}>{loading ? "読込中..." : "更新"}</Button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>月</TableHead><TableHead className="text-right">採用数</TableHead><TableHead className="text-right">退職数</TableHead><TableHead className="text-right">前月比増加</TableHead><TableHead className="text-right">在籍数</TableHead><TableHead className="text-right">正社員</TableHead><TableHead className="text-right">その他</TableHead><TableHead className="text-right">実働数</TableHead>
            </TableRow></TableHeader>
            <TableBody>{rows.map((row, index) => {
              const previous = index > 0 ? rows[index - 1].active_count : null;
              const growth = previous === null ? null : row.active_count - previous;
              return <TableRow key={row.month}>
                <TableCell>{row.month.slice(0, 7)}</TableCell><TableCell className="text-right">{formatNumber(row.hired_count)}</TableCell><TableCell className="text-right">{formatNumber(row.retired_count)}</TableCell><TableCell className="text-right">{growth === null ? "—" : formatNumber(growth)}</TableCell><TableCell className="text-right">{formatNumber(row.active_count)}</TableCell><TableCell className="text-right">{formatNumber(row.fulltime_count)}</TableCell><TableCell className="text-right">{formatNumber(row.other_count)}</TableCell><TableCell className="text-right">{formatNumber(row.working_count)}</TableCell>
              </TableRow>;
            })}</TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
