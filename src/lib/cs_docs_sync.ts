// src/lib/cs_docs_sync.ts
import { supabaseAdmin as supabase } from "@/lib/supabase/service";

type RpcRow = { updated_infos: number };

export async function runCsDocsSyncToKaipokeInfo(): Promise<{ updatedInfos: number }> {
  const { data, error } = await supabase.rpc("cron_sync_cs_documents");

  if (error) {
    throw new Error(`cron_sync_cs_documents RPC error: ${error.message}`);
  }

  // rpc は returns table(...) なので配列で返る（基本 1 行）
  const rows = (data ?? []) as RpcRow[];
  const updatedInfos = rows[0]?.updated_infos ?? 0;

  return { updatedInfos };
}
