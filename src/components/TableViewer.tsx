//components/TableViewer.tsx
"use client";

import React, { useEffect, useMemo, useState, useCallback } from "react";
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
  maxRows?: number;
  emptyMessage?: string;
  className?: string;
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

function compareValues(a: unknown, b: unknown) {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;

  if (typeof a === "number" && typeof b === "number") {
    return a - b;
  }

  const aDate = Date.parse(String(a));
  const bDate = Date.parse(String(b));
  const isADate = !Number.isNaN(aDate);
  const isBDate = !Number.isNaN(bDate);

  if (isADate && isBDate) {
    return aDate - bDate;
  }

  return String(a).localeCompare(String(b), "ja");
}

export default function TableViewer({
  tableName,
  columns,
  title,
  defaultSort,
  pageSize = 20,
  maxRows = 1000,
  emptyMessage = "データがありません",
  className = "",
}: TableViewerProps) {
  const [rows, setRows] = useState<TableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [globalFilter, setGlobalFilter] = useState("");
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
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

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const url = `/api/table-view?tableName=${encodeURIComponent(
        tableName
      )}&limit=${encodeURIComponent(String(maxRows))}&select=${encodeURIComponent(
        selectClause
      )}`;

      const res = await fetch(url, {
        method: "GET",
        cache: "no-store",
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? "データ取得に失敗しました");
      }

      const normalizedRows = Array.isArray(json.rows)
        ? (json.rows as TableRow[])
        : [];

      setRows(normalizedRows);
    } catch (e) {
      setRows([]);
      setError(e instanceof Error ? e.message : "不明なエラーが発生しました");
    } finally {
      setLoading(false);
    }
  }, [tableName, maxRows, selectClause]);

  useEffect(() => {
    setPage(1);
    fetchRows();
  }, [fetchRows]);

  const filteredRows = useMemo(() => {
    const globalKeyword = globalFilter.trim().toLowerCase();

    return rows.filter((row) => {
      const matchesGlobal =
        !globalKeyword ||
        columns.some((col) =>
          toDisplayString(row[col.key]).toLowerCase().includes(globalKeyword)
        );

      if (!matchesGlobal) return false;

      return columns.every((col) => {
        const filterValue = (columnFilters[col.key] ?? "").trim().toLowerCase();
        if (!filterValue) return true;
        return toDisplayString(row[col.key]).toLowerCase().includes(filterValue);
      });
    });
  }, [rows, columns, globalFilter, columnFilters]);

  const sortedRows = useMemo(() => {
    if (!sort) return filteredRows;

    const copied = [...filteredRows];
    copied.sort((a, b) => {
      const result = compareValues(a[sort.column], b[sort.column]);
      return sort.ascending ? result : -result;
    });
    return copied;
  }, [filteredRows, sort]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));

  const pagedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sortedRows.slice(start, start + pageSize);
  }, [sortedRows, page, pageSize]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const toggleSort = (columnKey: string) => {
    setPage(1);
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

  const startIndex = sortedRows.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIndex = Math.min(page * pageSize, sortedRows.length);

  return (
    <div className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`}>
      <div className="flex flex-col gap-3 border-b border-slate-200 p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            {title ?? tableName}
          </h2>
          <p className="text-sm text-slate-500">
            読み取り専用 / 並べ替え・フィルターのみ可能 / {sortedRows.length}件表示
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={globalFilter}
              onChange={(e) => {
                setPage(1);
                setGlobalFilter(e.target.value);
              }}
              placeholder="全項目を横断検索"
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
                          sort?.ascending ? (
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
                          onChange={(e) => {
                            setPage(1);
                            setColumnFilters((prev) => ({
                              ...prev,
                              [col.key]: e.target.value,
                            }));
                          }}
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
            ) : pagedRows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-sm text-slate-500">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              pagedRows.map((row, rowIndex) => (
                <tr key={`${tableName}-${rowIndex}`} className="odd:bg-white even:bg-slate-50/40">
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
          {sortedRows.length}件中 {startIndex} - {endIndex}件を表示
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