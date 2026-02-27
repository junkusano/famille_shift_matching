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
   loose row type (anyなし)
----------------------------- */

type LooseRow = Record<string, unknown>;

/* -----------------------------
   types
----------------------------- */

type UsersRow = {
  user_id: string;
  auth_user_id: string | null;
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
        .select("user_id,auth_user_id,entry_date_latest");

      if (usersErr) {
        console.error("[EntrySum] users query error", usersErr);
        setError(formatUnknownError(usersErr));
        setRows([]);
        return;
      }

      const users = (usersData ?? []) as UsersRow[];
      console.log("[EntrySum] users rows", { count: users.length });

      const missingAuthUids: string[] = [];
      const authUidToUserId = new Map<string, string>();

      for (const u of users) {
        if (typeof u.auth_user_id === "string" && u.auth_user_id.length > 0) {
          authUidToUserId.set(u.auth_user_id, u.user_id);
        }
        if (!u.entry_date_latest && u.auth_user_id) {
          missingAuthUids.push(u.auth_user_id);
        }
      }

      console.log("[EntrySum] missing entry_date_latest (with auth_user_id)", {
        count: missingAuthUids.length,
      });

      /* -----------------------------
         2) form_entries の agreed系日付（fallback）を作成
         users.entry_date_latest が無い場合のみ、
         form_entries.auth_uid (= users.auth_user_id) で紐づける
      ----------------------------- */
      const agreedAtByUser = new Map<string, string>();

      if (missingAuthUids.length > 0) {
        // form_entries から auth_uid で紐付けて agreed_at（無ければ created_at）を拾う
        const chunkSize = 500;

        for (let i = 0; i < missingAuthUids.length; i += chunkSize) {
          const chunk = missingAuthUids.slice(i, i + chunkSize);

          const { data: feData, error: feErr } = await supabase
            .from("form_entries")
            .select("auth_uid,agreed_at,created_at")
            .in("auth_uid", chunk);

          if (feErr) {
            console.error("[EntrySum] form_entries query error", feErr);
            setError(formatUnknownError(feErr));
            setRows([]);
            return;
          }

          const rowsUnknown: unknown = feData ?? [];
          for (const row of rowsUnknown as LooseRow[]) {
            const authUid = row["auth_uid"];
            const agreedAt = row["agreed_at"];
            const createdAt = row["created_at"];

            if (typeof authUid !== "string" || authUid.length === 0) continue;

            const userId = authUidToUserId.get(authUid);
            if (!userId) continue;

            const dt =
              (typeof agreedAt === "string" && agreedAt.length > 0
                ? agreedAt
                : typeof createdAt === "string" && createdAt.length > 0
                ? createdAt
                : null);

            if (!dt) continue;

            const prev = agreedAtByUser.get(userId);
            if (!prev || dt < prev) agreedAtByUser.set(userId, dt);
          }
        }

        console.log("[EntrySum] agreed_at resolved (via form_entries.auth_uid)", {
          count: agreedAtByUser.size,
        });
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
          <code>form_entries.agreed_at（無ければ created_at）</code>（<code>auth_uid</code>{" "}
          → <code>users.auth_user_id</code> で紐付け） ／ 退職:{" "}
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
          ※ form_entries は <code>entry_date_latest が空</code>かつ{" "}
          <code>users.auth_user_id がある</code>ユーザーのみ参照し、
          <code>form_entries.auth_uid</code> で照合しています
        </div>
      </CardContent>
    </Card>
  );
}