import { supabaseAdmin } from "@/lib/supabase/service";
import { Level } from "@/types/lineworks";

export async function saveLevelsMaster(levels: Level[]) {
  if (!Array.isArray(levels)) {
    throw new Error("levels は配列である必要があります");
  }

  const formatted = levels.map((level) => ({
    id: level.levelId,
    name: level.levelName,
    sort_order: level.displayOrder ?? null,
    description: null,
  }));

  const { error } = await supabaseAdmin
    .from("levels")
    .upsert(formatted, { onConflict: "id" });

  if (error) {
    throw new Error(`levels 同期失敗: ${error.message}`);
  }
}
