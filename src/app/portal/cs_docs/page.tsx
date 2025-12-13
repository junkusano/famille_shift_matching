// src/app/portal/cs_docs/page.tsx
import CsDocsPageClient from "@/components/CsDocsPageClient";
import { getCsDocsInitialData } from "@/lib/cs_docs";
import { supabaseAdmin } from "@/lib/supabase/service";

type DocOption = { value: string; label: string };

type SearchParams = {
  page?: string;
  perPage?: string;
  kaipoke_cs_id?: string;
};

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
  const kaipokeCsId =
    typeof searchParams?.kaipoke_cs_id === "string" &&
    searchParams?.kaipoke_cs_id.trim() !== ""
      ? searchParams?.kaipoke_cs_id.trim()
      : null;

  const initialData = await getCsDocsInitialData({
    page: Number.isFinite(page) && page > 0 ? page : 1,
    perPage: Number.isFinite(perPage) && perPage > 0 ? perPage : 50,
    kaipokeCsId,
  });

  const docMasterList = await getUserDocMasterOptions("cs_doc");

  return (
    <CsDocsPageClient initialData={initialData} docMasterList={docMasterList} />
  );
}
