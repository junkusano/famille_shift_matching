//components/biz-stats/EntrySum.tsx
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
  return new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 0 }).format(
    Math.round(v)
  );
}

function monthKeyFromDateLike(v: string | null | undefined): string | null {
  if (!v) return null;
  const m = v.match(/^(\d{4})-(\d{2})/);
  if (!m) return null;
  return `${m[1]}${m[2]}`;
}

/* -----------------------------
   error formatting (anyなし)
----------------------------- */

type PostgrestLikeError = {
  message: string;
  details?: string;
  hint?: string;
  code?: string;
};

function isPostgrestLikeError(x: unknown): x is PostgrestLikeError {
  if (typeof x !== "object" || x === null) return false;
  const r = x as Record<string, unknown>;
  return typeof r.message === "string";
}

function formatUnknownError(e: unknown): string {
  if (isPostgrestLikeError(e)) {
    const parts: string[] = [e.message];
    if (typeof e.code === "string" && e.code) parts.push(`code=${e.code}`);
    if (typeof e.details === "string" && e.details)
      parts.push(`details=${e.details}`);
    if (typeof e.hint === "string" && e.hint) parts.push(`hint=${e.hint}`);
    return parts.join(" / ");
  }
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  try {
    return JSON.stringify(e);
  } catch {
    return "failed to load";
  }
}

/* -----------------------------
   form_entries key detection (anyなし)
----------------------------- */

type LooseRow = Record<string, unknown>;

function pickFirstKey(row: LooseRow, candidates: string[]): string | null {
  for (const k of candidates) {
    if (Object.prototype.hasOwnProperty.call(row, k)) return k;
  }
  return null;
}

/* -----------------------------
   types
----------------------------- */

type UsersRow = {
  user_id: string;
  entry_date_latest: string | null;
};

type RemovedRow = {
  resign_date_latest: string | null;
  end_at: string | null;
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

    const fromDate = ymToMonthStartISO(fromYM);
    const toMonthStart = new Date(
      Number(toYM.slice(0, 4)),
      Number(toYM.slice(4, 6)) - 1,
      1
    );
    const toDateExclusive = ymToMonthStartISO(
      toYYYYMM(addMonths(toMonthStart, 1))
    );

    console.log("[EntrySum] load start", {
      fromYM,
      toYM,
      fromDate,
      toDateExclusive,
    });

    try {
      /* -----------------------------
         1) users を取得
      ----------------------------- */
      const { data: usersData, error: usersErr } = await supabase
        .from("users")
        .select("user_id,entry_date_latest");

      if (usersErr) {
        console.error("[EntrySum] users query error", usersErr);
        setError(formatUnknownError(usersErr));
        setRows([]);
        return;
      }

      const users = (usersData ?? []) as UsersRow[];
      console.log("[EntrySum] users rows", { count: users.length });

      const missingUserIds: string[] = [];
      for (const u of users) {
        if (!u.entry_date_latest) missingUserIds.push(u.user_id);
      }
      console.log("[EntrySum] missing entry_date_latest", {
        count: missingUserIds.length,
      });

      /* -----------------------------
         2) form_entries の agreed系日付（fallback）を作成
      ----------------------------- */
      const agreedAtByUser = new Map<string, string>();

      if (missingUserIds.length > 0) {
        // 2-1) サンプル1件で列名を自動判定
        const { data: sampleData, error: sampleErr } = await supabase
          .from("form_entries")
          .select("*")
          .limit(1);

        if (sampleErr) {
          console.error("[EntrySum] form_entries sample error", sampleErr);
          setError(formatUnknownError(sampleErr));
          setRows([]);
          return;
        }

        const sampleRow = ((sampleData ?? [])[0] ?? null) as LooseRow | null;

        if (!sampleRow) {
          console.log("[EntrySum] form_entries has no rows (skip fallback)");
        } else {
          const userKey =
            pickFirstKey(sampleRow, [
              "user_id",
              "requester_user_id",
              "author_user_id",
              "created_by_user_id",
              "created_by",
              "staff_user_id",
              "target_user_id",
            ]) ?? null;

          const agreedKey =
            pickFirstKey(sampleRow, [
              "agreed_at",
              "signed_at",
              "submitted_at",
              "applied_at",
              "created_at",
            ]) ?? null;

          if (!userKey) {
            const msg =
              "form_entries: ユーザー列が見つからない（候補: user_id/requester_user_id/author_user_id/...）。";
            console.error("[EntrySum]", msg, { sampleKeys: Object.keys(sampleRow) });
            setError(msg);
            setRows([]);
            return;
          }

          if (!agreedKey) {
            const msg =
              "form_entries: agreed_at 系の列が見つからない（候補: agreed_at/signed_at/submitted_at/...）。";
            console.error("[EntrySum]", msg, { sampleKeys: Object.keys(sampleRow) });
            setError(msg);
            setRows([]);
            return;
          }

          console.log("[EntrySum] form_entries keys detected", { userKey, agreedKey });

          // 2-2) missingUserIds を 500件ずつ in(...) で取って最古日を確定
          const chunkSize = 500;
          for (let i = 0; i < missingUserIds.length; i += chunkSize) {
            const chunk = missingUserIds.slice(i, i + chunkSize);

            const { data: feData, error: feErr } = await supabase
              .from("form_entries")
              .select(`${userKey},${agreedKey}`)
              .in(userKey, chunk)
              .not(agreedKey, "is", null);

            if (feErr) {
              console.error("[EntrySum] form_entries query error", feErr);
              setError(formatUnknownError(feErr));
              setRows([]);
              return;
            }

            // 動的 select で型が壊れるので unknown 経由（any は使わない）
            const rowsUnknown: unknown = feData ?? [];
            for (const row of rowsUnknown as LooseRow[]) {
              const uid = row[userKey];
              const dt = row[agreedKey];

              if (typeof uid !== "string" || uid.length === 0) continue;
              if (typeof dt !== "string" || dt.length === 0) continue;

              const prev = agreedAtByUser.get(uid);
              if (!prev || dt < prev) agreedAtByUser.set(uid, dt);
            }
          }

          console.log("[EntrySum] agreed_at resolved", { count: agreedAtByUser.size });
        }
      }

      /* -----------------------------
         3) entry 日付を確定して月別集計
         entry_date_latest 優先 → なければ form_entries agreed系
      ----------------------------- */
      const entryCountByYM = new Map<string, number>();

      for (const u of users) {
        const dt = u.entry_date_latest ?? agreedAtByUser.get(u.user_id) ?? null;
        const ym = monthKeyFromDateLike(dt);
        if (!ym) continue;
        if (ym < fromYM || ym > toYM) continue;

        entryCountByYM.set(ym, (entryCountByYM.get(ym) ?? 0) + 1);
      }

      /* -----------------------------
         4) removed 集計
      ----------------------------- */
      const { data: removedData, error: removedErr } = await supabase
        .from("user_entry_united_view_single")
        .select("resign_date_latest,end_at,created_at")
        .eq("status", "removed_from_lineworks_kaipoke");

      if (removedErr) {
        console.error("[EntrySum] removed query error", removedErr);
        setError(formatUnknownError(removedErr));
        setRows([]);
        return;
      }

      const removedCountByYM = new Map<string, number>();
      for (const r of (removedData ?? []) as RemovedRow[]) {
        const dt = r.resign_date_latest ?? r.end_at ?? r.created_at;
        const ym = monthKeyFromDateLike(dt);
        if (!ym) continue;
        if (ym < fromYM || ym > toYM) continue;
        removedCountByYM.set(ym, (removedCountByYM.get(ym) ?? 0) + 1);
      }

      /* -----------------------------
         5) 月配列生成 & 出力
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
        const prevRemoved = prevYM ? removedCountByYM.get(prevYM) ?? 0 : 0;

        return {
          year_month: ym,
          entry_count: entryCountByYM.get(ym) ?? 0,
          removed_count: removed,
          removed_increase: i === 0 ? 0 : removed - prevRemoved,
        };
      });

      console.log("[EntrySum] load ok", { outRows: out.length });
      setRows(out);
    } catch (e: unknown) {
      console.error("[EntrySum] unexpected error", e);
      setError(formatUnknownError(e));
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
      <CardHeader className="space-y-1">
        <CardTitle>{title}</CardTitle>
        <div className="text-sm text-muted-foreground">
          エントリー日: <code>users.entry_date_latest</code>（優先）→ 無ければ{" "}
          <code>form_entries.agreed_at（系）</code> ／ 退職:{" "}
          <code>user_entry_united_view_single.status = removed_from_lineworks_kaipoke</code>
        </div>
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
        </div>

        {error && (
          <pre className="text-xs text-red-600 whitespace-pre-wrap border rounded p-2">
            {error}
          </pre>
        )}

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

        <div className="text-xs text-muted-foreground">
          ※ form_entries は <code>entry_date_latest が空のユーザー</code>のみ参照し、
          列名は <code>1件サンプルから自動判定</code>しています（Console に検出結果が出ます）
        </div>
      </CardContent>
    </Card>
  );
}