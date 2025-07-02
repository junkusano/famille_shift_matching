import { supabaseAdmin } from "@/lib/supabase/service";
import { Level } from "@/types/lineworks";

export async function saveLevelsTemp(levels: Level[]) {
  if (!Array.isArray(levels)) {
    throw new Error("levels は配列である必要があります");
  }

  const formatted = levels.map((level) => ({
    level_id: level.levelId,
    level_name: level.levelName,
    level_external_key: level.levelExternalKey ?? null,
    display_order: level.displayOrder ?? null,
    executive: level.executive ?? false,
  }));

  const { error } = await supabaseAdmin
    .from("levels_temp")
    .upsert(formatted, { onConflict: "level_id" });

  if (error) {
    throw new Error(`levels_temp の保存に失敗しました: ${error.message}`);
  }
}
