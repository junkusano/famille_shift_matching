import { supabaseAdmin } from "@/lib/supabase/service";
import { Position } from "@/types/lineworks";

export async function savePositionsTemp(positions: Position[]) {
  if (!Array.isArray(positions)) {
    throw new Error("positions は配列である必要があります");
  }

  const formatted = positions.map((position) => ({
    position_id: position.positionId,
    domain_id: position.domainId,
    display_order: position.displayOrder ?? null,
    position_name: position.positionName,
    position_external_key: position.positionExternalKey ?? null,
  }));

  const { error } = await supabaseAdmin
    .from("positions_temp")
    .upsert(formatted, { onConflict: "position_id" });

  if (error) {
    throw new Error(`positions_temp の保存に失敗しました: ${error.message}`);
  }
}
