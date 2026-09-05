"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";

type MonthlyDistanceRow = {
  target_month: string;
  user_id: string;
  staff_name: string | null;
  work_day_count: number | null;
  movement_segment_count: number | null;
  monthly_distance_index: number | null;
};

type ManagerSummary = {
  userId: string;
  staffName: string;
  monthlyValues: Record<string, number>;
  monthlySegmentCounts: Record<string, number>;
  total: number;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function getMonthKey(value: string): string {
  return value.slice(0, 7);
}

function formatMonth(monthKey: string): string {
  const [year, month] = monthKey.split("-");

  return `${Number(year)}年${Number(month)}月`;
}

function createRecentMonthKeys(count: number): string[] {
  const current = new Date();

  return Array.from({ length: count }, (_, index) => {
    const date = new Date(
      current.getFullYear(),
      current.getMonth() - (count - 1 - index),
      1
    );

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");

    return `${year}-${month}`;
  });
}

export default function ManagerDistanceIndexPage() {
  const [rows, setRows] = useState<MonthlyDistanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [updatingDistance, setUpdatingDistance] = useState(false);

  const monthKeys = useMemo(() => createRecentMonthKeys(4), []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");

    if (!supabaseUrl || !supabaseAnonKey) {
      setErrorMessage(
        "Supabaseの環境変数が設定されていません。"
      );
      setLoading(false);
      return;
    }

    const supabase = createClient(
      supabaseUrl,
      supabaseAnonKey
    );

    const startMonth = `${monthKeys[0]}-01`;

    const { data, error } = await supabase
      .from("manager_monthly_google_maps_distance_view")
      .select(
        [
          "target_month",
          "user_id",
          "staff_name",
          "work_day_count",
          "movement_segment_count",
          "monthly_distance_index",
        ].join(",")
      )
      .gte("target_month", startMonth)
      .order("staff_name", {
        ascending: true,
      })
      .order("target_month", {
        ascending: true,
      });

    if (error) {
      console.error(
        "[manager-distance-index] load error",
        error
      );

      setErrorMessage(
        `データの取得に失敗しました: ${error.message}`
      );

      setRows([]);
      setLoading(false);
      return;
    }

    const typedRows = (data ?? []) as unknown as MonthlyDistanceRow[];
    setRows(typedRows);

    // migration適用前のDBでも画面表示できるよう、最終更新日時は
    // distance viewではなくCron実行ログから取得する。
    const { data: latestRun } = await supabase
      .from("google_maps_distance_cron_runs")
      .select("finished_at")
      .in("status", ["success", "partial"])
      .order("finished_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setLastUpdatedAt(latestRun?.finished_at ?? null);
    setLoading(false);
  }, [monthKeys]);

  const updateDistance = async () => {
    setUpdatingDistance(true);
    setErrorMessage("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch("/api/cron/google-maps-distance", {
        method: "POST",
        headers: session?.access_token ? { "x-supabase-access-token": session.access_token } : {},
      });
      const responseText = await response.text();
      let body: { error?: string } = {};
      try {
        body = JSON.parse(responseText) as { error?: string };
      } catch {
        body = { error: responseText || `HTTP ${response.status}` };
      }
      if (!response.ok) throw new Error(body.error ?? "距離データの更新に失敗しました");
      await loadData();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setUpdatingDistance(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const summaries = useMemo<ManagerSummary[]>(() => {
    const managerMap = new Map<string, ManagerSummary>();

    for (const row of rows) {
      const monthKey = getMonthKey(row.target_month);

      if (!monthKeys.includes(monthKey)) {
        continue;
      }

      const current =
        managerMap.get(row.user_id) ??
        {
          userId: row.user_id,
          staffName:
            row.staff_name?.trim() ||
            row.user_id,
          monthlyValues: {},
          monthlySegmentCounts: {},
          total: 0,
        };

      const value = Number(
        row.monthly_distance_index ?? 0
      );

      current.monthlyValues[monthKey] =
        (current.monthlyValues[monthKey] ?? 0) +
        value;
      current.monthlySegmentCounts[monthKey] = row.movement_segment_count ?? 0;

      current.total += value;

      managerMap.set(row.user_id, current);
    }

    return Array.from(managerMap.values()).sort(
      (a, b) => {
        if (b.total !== a.total) {
          return b.total - a.total;
        }

        return a.staffName.localeCompare(
          b.staffName,
          "ja"
        );
      }
    );
  }, [monthKeys, rows]);

  const monthlyTotals = useMemo(() => {
    const totals: Record<string, number> = {};

    for (const monthKey of monthKeys) {
      totals[monthKey] = summaries.reduce(
        (sum, manager) =>
          sum +
          (manager.monthlyValues[monthKey] ?? 0),
        0
      );
    }

    return totals;
  }, [monthKeys, summaries]);

  const grandTotal = useMemo(
    () =>
      summaries.reduce(
        (sum, manager) => sum + manager.total,
        0
      ),
    [summaries]
  );

  return (
    <main className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            マネージャー移動距離指数
          </h1>

          <p className="mt-1 text-sm text-muted-foreground">
            Google Mapsの道路距離を、完了済み・予定シフトの両方から職員ごとに月間集計しています。
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Google Maps距離　最終更新：{lastUpdatedAt ? new Date(lastUpdatedAt).toLocaleString("ja-JP") : "未更新"}
            <br />※移動距離は3日に1回自動更新されます。シフト変更分は次回更新時に反映されます。
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            void loadData();
          }}
          disabled={loading}
          className="inline-flex h-10 items-center justify-center rounded-md border bg-background px-4 text-sm font-medium shadow-sm transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "更新中..." : "再読み込み"}
        </button>
        <button
          type="button"
          onClick={() => void updateDistance()}
          disabled={loading || updatingDistance}
          className="inline-flex h-10 items-center justify-center rounded-md border border-blue-200 bg-blue-50 px-4 text-sm font-medium text-blue-800 shadow-sm transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {updatingDistance ? "距離更新中..." : "距離データを更新"}
        </button>
      </div>

      <div className="rounded-lg border bg-card shadow-sm">
        <div className="border-b px-4 py-3">
          <p className="text-sm text-muted-foreground">
            対象権限：manager・admin
          </p>
        </div>

        {errorMessage ? (
          <div className="p-6">
            <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {errorMessage}
            </div>
          </div>
        ) : loading ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            データを読み込んでいます。
          </div>
        ) : summaries.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            対象期間のデータがありません。
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="sticky left-0 z-10 min-w-[180px] bg-muted px-4 py-3 text-left font-semibold">
                    マネージャー名
                  </th>

                  {monthKeys.map((monthKey) => (
                    <th
                      key={monthKey}
                      className="min-w-[120px] px-4 py-3 text-right font-semibold"
                    >
                      {formatMonth(monthKey)}
                    </th>
                  ))}

                  <th className="min-w-[130px] bg-muted/70 px-4 py-3 text-right font-semibold">
                    4か月合計
                  </th>
                </tr>
              </thead>

              <tbody>
                {summaries.map((manager) => (
                  <tr
                    key={manager.userId}
                    className="border-b transition-colors hover:bg-muted/30"
                  >
                    <td className="sticky left-0 z-10 bg-card px-4 py-3 font-medium">
                      {manager.staffName}
                    </td>

                    {monthKeys.map((monthKey) => {
                      const value =
                        manager.monthlyValues[
                          monthKey
                        ] ?? 0;
                      const segmentCount = manager.monthlySegmentCounts[monthKey] ?? 0;

                      return (
                        <td
                          key={monthKey}
                          className="px-4 py-3 text-right tabular-nums"
                        >
                          {segmentCount === 0
                            ? "未計算"
                            : `${value.toLocaleString("ja-JP", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`}
                        </td>
                      );
                    })}

                    <td className="bg-muted/30 px-4 py-3 text-right font-semibold tabular-nums">
                      {manager.total.toLocaleString("ja-JP", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km
                    </td>
                  </tr>
                ))}
              </tbody>

              <tfoot>
                <tr className="border-t-2 bg-muted/50 font-semibold">
                  <td className="sticky left-0 z-10 bg-muted px-4 py-3">
                    全体合計
                  </td>

                  {monthKeys.map((monthKey) => (
                    <td
                      key={monthKey}
                      className="px-4 py-3 text-right tabular-nums"
                    >
                      {monthlyTotals[
                        monthKey
                      ].toLocaleString("ja-JP", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km
                    </td>
                  ))}

                  <td className="bg-muted/70 px-4 py-3 text-right tabular-nums">
                    {grandTotal.toLocaleString("ja-JP", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
        Google Mapsの道路距離をメートル単位で保存し、画面ではキロメートルに変換して表示しています。
      </div>
    </main>
  );
}
