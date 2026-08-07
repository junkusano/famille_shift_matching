// src/app/portal/cs_docs/page.tsx
import CsDocsPageClient from "@/components/CsDocsPageClient";
import { getCsDocsInitialData, type CsDocsFilters } from "@/lib/cs_docs";
import { supabaseAdmin } from "@/lib/supabase/service";

type DocOption = { value: string; label: string };

type SearchParams = {
  page?: string;
  perPage?: string;
  kaipoke_cs_id?: string;
  unassigned?: string;
  keyword?: string;
  unclassified?: string;
  date_from?: string;
  date_to?: string;
};

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

function readString(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function readBoolean(value: string | undefined): boolean {
  const v = readString(value).toLowerCase();
  return v === "1" || v === "true" || v === "on";
}

function isValidDateOnly(value: string): boolean {
  if (!DATE_ONLY_RE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function validateDateRange(dateFrom: string, dateTo: string): string | null {
  if ((dateFrom && !isValidDateOnly(dateFrom)) || (dateTo && !isValidDateOnly(dateTo))) {
    return "日付は YYYY-MM-DD 形式で指定してください。";
  }

  if (dateFrom && dateTo && dateFrom > dateTo) {
    return "開始日は終了日以前の日付を指定してください。";
  }

  return null;
}

async function getUserDocMasterOptions(category: string): Promise<DocOption[]> {
  const { data, error } = await supabaseAdmin
    .from("user_doc_master")
    .select("label")
    .eq("category", category)
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });

  if (error) throw error;

  const labels = (data ?? [])
    .map((r) => r.label)
    .filter((v): v is string => typeof v === "string" && v.trim() !== "");

  return labels.map((label) => ({ value: label, label }));
}

export default async function Page({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const page = Number(searchParams?.page ?? "1");
  const perPage = Number(searchParams?.perPage ?? "50");
  const safePage = Number.isFinite(page) && page > 0 ? page : 1;
  const safePerPage = Number.isFinite(perPage) && perPage > 0 ? perPage : 50;

  const kaipokeCsId = readString(searchParams?.kaipoke_cs_id) || null;
  const keyword = readString(searchParams?.keyword);
  const dateFrom = readString(searchParams?.date_from);
  const dateTo = readString(searchParams?.date_to);
  const filterError = validateDateRange(dateFrom, dateTo);
  const safeDateFrom = isValidDateOnly(dateFrom) ? dateFrom : "";
  const safeDateTo = isValidDateOnly(dateTo) ? dateTo : "";

  const filters: CsDocsFilters = {
    kaipokeCsId,
    unassignedOnly: readBoolean(searchParams?.unassigned),
    keyword: keyword || null,
    unclassifiedOnly: readBoolean(searchParams?.unclassified),
    dateFrom: safeDateFrom || null,
    dateTo: safeDateTo || null,
  };

  const queryFilters: CsDocsFilters = filterError
    ? { ...filters, dateFrom: null, dateTo: null }
    : filters;

  const initialData = await getCsDocsInitialData({
    page: safePage,
    perPage: safePerPage,
    ...queryFilters,
  });

  const docMasterList = await getUserDocMasterOptions("cs_doc");

  return (
    <CsDocsPageClient
      initialData={initialData}
      docMasterList={docMasterList}
      page={safePage}
      perPage={safePerPage}
      filters={filters}
      filterError={filterError}
    />
  );
}
