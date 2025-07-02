// /lib/sync/savePositionsMaster.ts

import { supabaseAdmin } from "@/lib/supabase/service";
import { Position } from "@/types/lineworks";

export async function savePositionsMaster(positions: Position[]) {
  if (!Array.isArray(positions)) {
    throw new Error("positions は配列である必要があります");
  }

  const formatted = positions.map((p) => ({
    id: p.positionId,                // ← positions テーブルの主キー
    label: p.positionName,
    sort_order: p.displayOrder ?? null,
    description: null,               // 今は空欄で統一
  }));

  const { error } = await supabaseAdmin
    .from("positions")
    .upsert(formatted, { onConflict: "id" });

  if (error) {
    throw new Error(`positions 同期失敗: ${error.message}`);
  }
}
