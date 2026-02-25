"use client";

import { useEffect, useMemo, useState } from "react";
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

/* -----------------------------
   utility
----------------------------- */

function addMonths(date: Date, delta: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + delta);
  return d;
}

function toYYYYMM(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}${m}`;
}

function ymToMonthStartISO(ym: string): string {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(4, 6));
  const dt = new Date(y, m - 1, 1);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}-01`;
}

function formatNumInt(v: number): string {
  return new Intl.NumberFormat("ja-JP", {
    maximumFractionDigits: 0,
  }).format(Math.round(v));
}

function monthKeyFromDateLike(v: string | null | undefined): string | null {
  if (!v) return null;
  const m = v.match(/^(\d{4})-(\d{2})/);
  if (!m) return null;
  return `${m[1]}${m[2]}`;
}

/* -----------------------------
   types
----------------------------- */

type UsersEntryRow = {
  entry_date_latest: string | null;
};

type RemovedRow = {
  resign_date_latest: string | null;
  end_at: string | null;
  updated_at: string | null;
  created_at: string | null;
};

type Row = {
  year_month: string;
  entry_count: number;
  removed_count: number;
  removed_increase: number;
};

/* -----------------------------
   component
----------------------------- */

export default function EntrySumBizStats({
  title = "エントリー数の推移（月別）/ 退職者の推移（前月からの増加分）",
}: {
  title?: string;
}) {
  const today = useMemo(() => new Date(), []);
  const defaultFrom = useMemo(() => toYYYYMM(addMonths(today, -12)), [today]);
  const defaultTo = useMemo(() => toYYYYMM(addMonths(today, 1)), [today]);

  const [fromYM, setFromYM] = useState<string>(defaultFrom);
  const [toYM, setToYM] = useState<string>(defaultTo);

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  async function load(): Promise<void> {
    setLoading(true);
    setError("");

    try {
      const fromDate = ymToMonthStartISO(fromYM);

      const toMonthStart = new Date(
        Number(toYM.slice(0, 4)),
        Number(toYM.slice(4, 6)) - 1,
        1
      );

      const toDateExclusive = ymToMonthStartISO(
        toYYYYMM(addMonths(toMonthStart, 1))
      );

      /* -----------------------------
         1) entry 集計
      ----------------------------- */

      const { data: entryData, error: entryErr } = await supabase
        .from("users")
        .select("entry_date_latest")
        .not("entry_date_latest", "is", null)
        .gte("entry_date_latest", fromDate)
        .lt("entry_date_latest", toDateExclusive);

      if (entryErr) throw entryErr;

      const entryCountByYM = new Map<string, number>();

      for (const r of (entryData ?? []) as UsersEntryRow[]) {
        const ym = monthKeyFromDateLike(r.entry_date_latest);
        if (!ym) continue;

        entryCountByYM.set(ym, (entryCountByYM.get(ym) ?? 0) + 1);
      }

      /* -----------------------------
         2) removed 集計
      ----------------------------- */

      const { data: removedData, error: removedErr } = await supabase
        .from("user_entry_united_view_single")
        .select(
          "resign_date_latest,end_at,updated_at,created_at"
        )
        .eq("status", "removed_from_lineworks_kaipoke");

      if (removedErr) throw removedErr;

      const removedCountByYM = new Map<string, number>();

      for (const r of (removedData ?? []) as RemovedRow[]) {
        const dt =
          r.resign_date_latest ??
          r.end_at ??
          r.updated_at ??
          r.created_at;

        const ym = monthKeyFromDateLike(dt);
        if (!ym) continue;

        if (ym < fromYM || ym > toYM) continue;

        removedCountByYM.set(ym, (removedCountByYM.get(ym) ?? 0) + 1);
      }

      /* -----------------------------
         3) 月配列生成
      ----------------------------- */

      const months: string[] = [];

      const start = new Date(
        Number(fromYM.slice(0, 4)),
        Number(fromYM.slice(4, 6)) - 1,
        1
      );

      const end = new Date(
        Number(toYM.slice(0, 4)),
        Number(toYM.slice(4, 6)) - 1,
        1
      );

      for (let d = new Date(start); d <= end; d = addMonths(d, 1)) {
        months.push(toYYYYMM(d));
      }

      const out: Row[] = months.map((ym, i) => {
        const removed = removedCountByYM.get(ym) ?? 0;
        const prevYM = i > 0 ? months[i - 1] : null;
        const prevRemoved =
          prevYM !== null ? removedCountByYM.get(prevYM) ?? 0 : 0;

        return {
          year_month: ym,
          entry_count: entryCountByYM.get(ym) ?? 0,
          removed_count: removed,
          removed_increase: i === 0 ? 0 : removed - prevRemoved,
        };
      });

      setRows(out);
    } catch (e: unknown) {
      const message =
        e instanceof Error ? e.message : "failed to load";
      setError(message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex gap-3 items-end flex-wrap">
          <div>
            <div className="text-sm text-muted-foreground">From (YYYYMM)</div>
            <Input
              value={fromYM}
              onChange={(e) => setFromYM(e.target.value)}
              className="w-32"
            />
          </div>

          <div>
            <div className="text-sm text-muted-foreground">To (YYYYMM)</div>
            <Input
              value={toYM}
              onChange={(e) => setToYM(e.target.value)}
              className="w-32"
            />
          </div>

          <Button onClick={load} disabled={loading}>
            {loading ? "読込中..." : "更新"}
          </Button>

          {error && (
            <div className="text-sm text-red-600">{error}</div>
          )}
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>年月</TableHead>
                <TableHead className="text-right">エントリー数</TableHead>
                <TableHead className="text-right">退職数</TableHead>
                <TableHead className="text-right">前月増加分</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {rows.map((r) => {
                const incCls =
                  r.removed_increase > 0
                    ? "text-red-600"
                    : r.removed_increase < 0
                    ? "text-blue-600"
                    : "";

                return (
                  <TableRow key={r.year_month}>
                    <TableCell>{r.year_month}</TableCell>
                    <TableCell className="text-right">
                      {formatNumInt(r.entry_count)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatNumInt(r.removed_count)}
                    </TableCell>
                    <TableCell className={`text-right ${incCls}`}>
                      {formatNumInt(r.removed_increase)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}