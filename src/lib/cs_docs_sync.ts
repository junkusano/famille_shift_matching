// src/lib/cs_docs_sync.ts
import { supabaseAdmin as supabase } from "@/lib/supabase/service";

type RpcRow = {
  updated_infos: number;
  relabeled_documents: number;
  fixed_doc_names: number;
  matched_kaipoke_ids: number;
  filled_doc_dates: number;
  unresolved: number;
};

export type CsDocsSyncResult = {
  updatedInfos: number;
  relabeledDocuments: number;
  fixedDocNames: number;
  matchedKaipokeIds: number;
  filledDocDates: number;
  unresolved: number;
};

export async function runCsDocsSyncToKaipokeInfo(): Promise<CsDocsSyncResult> {
  const { data, error } = await supabase.rpc("sync_cs_docs_to_kaipoke_documents");

  if (error) {
    throw new Error(`sync_cs_docs_to_kaipoke_documents RPC error: ${error.message}`);
  }

  const rows = (data ?? []) as RpcRow[];
  const row = rows[0];

  return {
    updatedInfos: row?.updated_infos ?? 0,
    relabeledDocuments: row?.relabeled_documents ?? 0,
    fixedDocNames: row?.fixed_doc_names ?? 0,
    matchedKaipokeIds: row?.matched_kaipoke_ids ?? 0,
    filledDocDates: row?.filled_doc_dates ?? 0,
    unresolved: row?.unresolved ?? 0,
  };
}