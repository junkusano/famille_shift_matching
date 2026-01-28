// =============================================================
// src/components/cm-components/audit/CmAuditLogsPageContent.tsx
// システムログ管理のClient Component
// =============================================================

"use client";

import React, { useState, useCallback, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { CmAuditLogFilters } from "@/components/cm-components/audit/CmAuditLogFilters";
import { CmAuditLogTable } from "@/components/cm-components/audit/CmAuditLogTable";
import type {
  CmLogEntry,
  CmAuditLogPagination,
  CmAuditLogFilters as FiltersType,
} from "@/types/cm/auditLogs";

type Props = {
  logs: CmLogEntry[];
  pagination: CmAuditLogPagination;
  initialFilters: FiltersType;
};

export function CmAuditLogsPageContent({
  logs,
  pagination,
  initialFilters,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // ローカルのフィルター状態
  const [filters, setFilters] = useState<FiltersType>(initialFilters);

  // URLを更新してServer Componentを再レンダリング
  const updateUrl = useCallback(
    (newParams: Record<string, string | number>) => {
      const params = new URLSearchParams(searchParams.toString());

      Object.entries(newParams).forEach(([key, value]) => {
        if (value === "" || value === 0) {
          params.delete(key);
        } else {
          params.set(key, String(value));
        }
      });

      startTransition(() => {
        router.push(`?${params.toString()}`);
      });
    },
    [router, searchParams]
  );

  // フィルター変更
  const handleFilterChange = useCallback((key: keyof FiltersType, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  // 検索実行
  const handleSearch = useCallback(() => {
    updateUrl({
      page: 1,
      env: filters.env,
      level: filters.level,
      module: filters.moduleName,
      message: filters.message,
      traceId: filters.traceId,
      from: filters.from,
      to: filters.to,
    });
  }, [filters, updateUrl]);

  // リセット
  const handleReset = useCallback(() => {
    const defaultFilters: FiltersType = {
      env: "",
      level: "",
      moduleName: "",
      message: "",
      traceId: "",
      from: "",
      to: "",
    };
    setFilters(defaultFilters);
    updateUrl({ page: 1 });
  }, [updateUrl]);

  // ページ変更
  const handlePageChange = useCallback(
    (newPage: number) => {
      updateUrl({ page: newPage });
    },
    [updateUrl]
  );

  // 更新
  const refresh = useCallback(() => {
    startTransition(() => {
      router.refresh();
    });
  }, [router]);

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
            システムログ
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            warn / error レベルのログを確認できます
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={isPending}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm font-medium shadow-sm"
        >
          <RefreshCw className={`w-4 h-4 ${isPending ? "animate-spin" : ""}`} />
          更新
        </button>
      </div>

      {/* フィルター */}
      <CmAuditLogFilters
        filters={filters}
        onFilterChange={handleFilterChange}
        onSearch={handleSearch}
        onReset={handleReset}
      />

      {/* テーブル */}
      <CmAuditLogTable
        logs={logs}
        pagination={pagination}
        loading={isPending}
        error={null}
        onPageChange={handlePageChange}
      />
    </div>
  );
}
