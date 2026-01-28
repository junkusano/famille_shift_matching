// =============================================================
// src/components/cm-components/other-offices/CmOtherOfficesPageContent.tsx
// 他社事業所一覧のClient Component
// =============================================================

"use client";

import React, { useState, useCallback, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { CmOtherOfficeFilters } from "@/components/cm-components/other-offices/CmOtherOfficeFilters";
import { CmOtherOfficeTable } from "@/components/cm-components/other-offices/CmOtherOfficeTable";
import { updateOtherOfficeFaxProxy } from "@/lib/cm/other-offices/actions";
import type {
  CmOtherOffice,
  CmOtherOfficePagination,
  CmOtherOfficeFilters as FiltersType,
} from "@/types/cm/otherOffices";

type Props = {
  offices: CmOtherOffice[];
  serviceTypeOptions: string[];
  pagination: CmOtherOfficePagination;
  initialFilters: FiltersType;
};

export function CmOtherOfficesPageContent({
  offices: initialOffices,
  serviceTypeOptions,
  pagination,
  initialFilters,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // ローカルの事業所リスト（楽観的更新用）
  const [offices, setOffices] = useState<CmOtherOffice[]>(initialOffices);

  // ローカルのフィルター状態
  const [filters, setFilters] = useState<FiltersType>(initialFilters);

  // 更新状態
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);

  // propsが変わったらローカル状態を更新
  React.useEffect(() => {
    setOffices(initialOffices);
  }, [initialOffices]);

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
      serviceType: filters.serviceType,
      officeName: filters.officeName,
      officeNumber: filters.officeNumber,
      faxNumber: filters.faxNumber,
    });
  }, [filters, updateUrl]);

  // リセット
  const handleReset = useCallback(() => {
    const defaultFilters: FiltersType = {
      serviceType: "",
      officeName: "",
      officeNumber: "",
      faxNumber: "",
    };
    setFilters(defaultFilters);
    updateUrl({ page: 1, ...defaultFilters });
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

  // FAX代行番号更新（Server Action使用）
  const handleUpdateFaxProxy = useCallback(
    async (id: number, faxProxy: string | null): Promise<boolean> => {
      setUpdatingId(id);
      setUpdateError(null);

      try {
        const result = await updateOtherOfficeFaxProxy(id, faxProxy);

        if (result.ok === false){
          setUpdateError(result.error);
          return false;
        }

        // ローカルステートを更新（楽観的更新）
        if (result.data) {
          setOffices((prev) =>
            prev.map((office) =>
              office.id === id ? { ...office, fax_proxy: result.data!.fax_proxy } : office
            )
          );
        }

        return true;
      } catch (e) {
        setUpdateError(e instanceof Error ? e.message : "通信エラー");
        return false;
      } finally {
        setUpdatingId(null);
      }
    },
    []
  );

  // エラークリア
  const clearUpdateError = useCallback(() => {
    setUpdateError(null);
  }, []);

  // フィルター適用中かどうか
  const isFiltered =
    filters.serviceType !== "" ||
    filters.officeName !== "" ||
    filters.officeNumber !== "" ||
    filters.faxNumber !== "";

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
            他社事業所一覧
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            カイポケから取得した他社事業所情報を管理します
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
      <CmOtherOfficeFilters
        filters={filters}
        serviceTypeOptions={serviceTypeOptions}
        onFilterChange={handleFilterChange}
        onSearch={handleSearch}
        onReset={handleReset}
      />

      {/* 件数表示 */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-slate-600">
          <span className="font-semibold text-slate-800">
            {pagination.total.toLocaleString()}
          </span>{" "}
          件
        </span>
        {isFiltered && (
          <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded font-medium">
            フィルター適用中
          </span>
        )}
        {isPending && (
          <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded font-medium">
            読み込み中...
          </span>
        )}
      </div>

      {/* テーブル */}
      <CmOtherOfficeTable
        offices={offices}
        pagination={pagination}
        loading={isPending}
        error={null}
        updatingId={updatingId}
        updateError={updateError}
        onPageChange={handlePageChange}
        onUpdateFaxProxy={handleUpdateFaxProxy}
        onClearUpdateError={clearUpdateError}
      />
    </div>
  );
}
