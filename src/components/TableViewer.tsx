// src/components/TableViewer.tsx

"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Search,
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
  RefreshCw,
} from "lucide-react";

type TableRow = Record<string, unknown>;

export type TableColumnConfig = {
  key: string;
  label?: string;
  width?: string;
  sortable?: boolean;
  filterable?: boolean;
  filterMode?: "partial" | "exact";
  format?: (value: unknown, row: TableRow) => React.ReactNode;
};

export type TableViewerProps = {
  tableName: string;
  columns: TableColumnConfig[];
  title?: string;
  defaultSort?: {
    column: string;
    ascending?: boolean;
  };
  pageSize?: number;
  emptyMessage?: string;
  className?: string;
  initialColumnFilters?: Record<string, string>;
};

type SortState = {
  column: string;
  ascending: boolean;
};

function toDisplayString(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toLocaleString("ja-JP");
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function formatHours2(value: unknown) {
  const num = Number(value ?? 0);
  if (Number.isNaN(num)) return "-";
  return num.toFixed(2);
}

function getNextYearMonth() {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const y = next.getFullYear();
  const m = String(next.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export default function TableViewer({
  tableName,
  columns,
  title,
  defaultSort,
  pageSize = 50,
  emptyMessage = "データがありません",
  className = "",
  initialColumnFilters,
}: TableViewerProps) {
  const [rows, setRows] = useState<TableRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [globalFilter, setGlobalFilter] = useState("");
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>(
    initialColumnFilters ?? {}
  );
  const [sort, setSort] = useState<SortState | null>(
    defaultSort
      ? {
          column: defaultSort.column,
          ascending: defaultSort.ascending ?? true,
        }
      : null
  );

  const selectClause = useMemo(
    () => columns.map((c) => c.key).join(","),
    [columns]
  );

  const serverFilters = useMemo(() => {
    const filters: Array<{
      column: string;
      operator: "eq" | "ilike";
      value: string;
    }> = [];

    for (const col of columns) {
      const value = (columnFilters[col.key] ?? "").trim();
      if (!value) continue;

      filters.push({
        column: col.key,
        operator: col.filterMode === "exact" ? "eq" : "ilike",
        value,
      });
    }

    return filters;
  }, [columns, columnFilters]);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const offset = (page - 1) * pageSize;

      const url =
        `/api/table-view?tableName=${encodeURIComponent(tableName)}` +
        `&select=${encodeURIComponent(selectClause)}` +
        `&limit=${encodeURIComponent(String(pageSize))}` +
        `&offset=${encodeURIComponent(String(offset))}` +
        `&filters=${encodeURIComponent(JSON.stringify(serverFilters))}` +
        (sort?.column
          ? `&sortColumn=${encodeURIComponent(sort.column)}&sortAscending=${encodeURIComponent(
              String(sort.ascending)
            )}`
          : "");

      const res = await fetch(url, {
        method: "GET",
        cache: "no-store",
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? "データ取得に失敗しました");
      }

      setRows(Array.isArray(json.rows) ? (json.rows as TableRow[]) : []);
      setTotalCount(typeof json.totalCount === "number" ? json.totalCount : 0);
    } catch (e) {
      setRows([]);
      setTotalCount(0);
      setError(e instanceof Error ? e.message : "不明なエラーが発生しました");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, selectClause, serverFilters, sort, tableName]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  useEffect(() => {
    setPage(1);
  }, [tableName, sort, columnFilters]);

  const currentPageRows = useMemo(() => {
    const keyword = globalFilter.trim().toLowerCase();
    if (!keyword) return rows;

    return rows.filter((row) =>
      columns.some((col) =>
        toDisplayString(row[col.key]).toLowerCase().includes(keyword)
      )
    );
  }, [rows, columns, globalFilter]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const startIndex = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIndex = Math.min(page * pageSize, totalCount);

  const toggleSort = (columnKey: string) => {
    setSort((current) => {
      if (!current || current.column !== columnKey) {
        return { column: columnKey, ascending: true };
      }
      if (current.ascending) {
        return { column: columnKey, ascending: false };
      }
      return null;
    });
  };

  return (
    <div className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`}>
      <div className="flex flex-col gap-3 border-b border-slate-200 p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            {title ?? tableName}
          </h2>
          <p className="text-sm text-slate-500">
            読み取り専用 / 並べ替え・フィルターのみ可能 / {totalCount}件表示
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              placeholder="現在ページ内を横断検索"
              className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none placeholder:text-slate-400 focus:border-slate-400 sm:w-64"
            />
          </div>

          <button
            type="button"
            onClick={fetchRows}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className="h-4 w-4" />
            再読込
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-0">
          <thead className="sticky top-0 z-10 bg-slate-50">
            <tr>
              {columns.map((col) => {
                const isSorted = sort?.column === col.key;
                return (
                  <th
                    key={col.key}
                    style={{ width: col.width }}
                    className="border-b border-slate-200 px-3 py-3 text-left align-top"
                  >
                    <div className="flex min-w-[140px] flex-col gap-2">
                      <button
                        type="button"
                        onClick={() => col.sortable !== false && toggleSort(col.key)}
                        className="flex items-center gap-2 text-left text-sm font-semibold text-slate-800"
                      >
                        <span>{col.label ?? col.key}</span>
                        {col.sortable === false ? null : isSorted ? (
                          sort.ascending ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )
                        ) : (
                          <ArrowUpDown className="h-4 w-4 text-slate-400" />
                        )}
                      </button>

                      {col.filterable === false ? null : (
                        <input
                          value={columnFilters[col.key] ?? ""}
                          onChange={(e) =>
                            setColumnFilters((prev) => ({
                              ...prev,
                              [col.key]: e.target.value,
                            }))
                          }
                          placeholder={`${col.label ?? col.key} で絞り込み`}
                          className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none placeholder:text-slate-400 focus:border-slate-400"
                        />
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-sm text-slate-500">
                  読み込み中...
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-sm text-red-600">
                  取得エラー: {error}
                </td>
              </tr>
            ) : currentPageRows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-sm text-slate-500">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              currentPageRows.map((row, rowIndex) => (
                <tr key={`${tableName}-${page}-${rowIndex}`} className="odd:bg-white even:bg-slate-50/40">
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className="max-w-[320px] border-b border-slate-100 px-3 py-3 text-sm text-slate-700"
                    >
                      <div className="truncate">
                        {col.format
                          ? col.format(row[col.key], row)
                          : toDisplayString(row[col.key]) || "-"}
                      </div>
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-3 border-t border-slate-200 p-4 text-sm text-slate-600 md:flex-row md:items-center md:justify-between">
        <div>
          {totalCount}件中 {startIndex} - {endIndex}件を表示
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
            className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-40"
          >
            前へ
          </button>

          <div className="min-w-[96px] text-center">
            {page} / {totalPages}
          </div>

          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((prev) => Math.min(prev + 1, totalPages))}
            className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-40"
          >
            次へ
          </button>
        </div>
      </div>
    </div>
  );
}

export { getNextYearMonth };