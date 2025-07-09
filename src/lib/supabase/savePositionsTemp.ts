import { supabaseAdmin } from "@/lib/supabase/service";
import { Position } from "@/types/lineworks";

export async function savePositionsTemp(positions: Position[]) {
  if (!Array.isArray(positions)) {
    throw new Error("positions は配列である必要があります");
  }

  const formatted = positions.map((p) => ({
    position_id: p.positionId,
    position_name: p.positionName,
    position_external_key: p.positionExternalKey ?? null,
    display_order: p.displayOrder ?? null,
  }));

  const { error } = await supabaseAdmin
    .from("positions_temp")
    .upsert(formatted, { onConflict: "position_id" });

  if (error) {
    throw new Error(`positions_temp 同期失敗: ${error.message}`);
  }
}
