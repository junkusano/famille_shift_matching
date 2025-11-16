// /src/lib/alert_add/kodoengo_plan_link_check.ts
// 「行動援護 支援手順書リンク無アラート」を発行するロジック本体。
// cron ハブ (/api/cron/alert-check-excuse) からのみ呼ばれる想定。

import { supabaseAdmin } from "@/lib/supabase/service";
import { ensureSystemAlert } from "@/lib/alert/ensureSystemAlert";

type ShiftRow = {
  kaipoke_cs_id: string | null;
};

type CsRow = {
  id: string; // uuid
  kaipoke_cs_id: string;
  name: string | null;
  kodoengo_plan_link: string | null;
  is_active: boolean | null;
  end_at: string | null;
};

export type KodoengoPlanLinkCheckResult = {
  scanned: number;
  created: number;
};

export async function kodoengoPlanLinkCheck(): Promise<KodoengoPlanLinkCheckResult> {
  console.log("[kodoengo_plan_link_check] start");

  // 1) 行動援護シフトがある CS ID 一覧を取得
  const { data: shiftRows, error: shiftError } = await supabaseAdmin
    .from("shift")
    .select("kaipoke_cs_id")
    .eq("service_code", "行動援護")
    .not("kaipoke_cs_id", "is", null);

  if (shiftError) {
    console.error("[kodoengo_plan_link_check] failed to load shift rows", shiftError);
    throw shiftError;
  }

  const csIds = Array.from(
    new Set(
      (shiftRows ?? [])
        .map((r: ShiftRow) => r.kaipoke_cs_id)
        .filter((v): v is string => !!v)
    )
  );

  if (csIds.length === 0) {
    console.log("[kodoengo_plan_link_check] no 行動援護 shifts found");
    return { scanned: 0, created: 0 };
  }

  // 2) 行動援護シフトがあり、かつ kodoengo_plan_link が空の利用者のみを抽出
  const { data: targets, error: csError } = await supabaseAdmin
    .from("cs_kaipoke_info")
    .select("id, kaipoke_cs_id, name, kodoengo_plan_link, is_active, end_at")
    .in("kaipoke_cs_id", csIds)
    // 空欄: null または '' を対象
    .or("kodoengo_plan_link.is.null,kodoengo_plan_link.eq.''")
    // 一応、現役利用者メインに絞る（必要なければこの2行は削ってください）
    .eq("is_active", true);

  if (csError) {
    console.error("[kodoengo_plan_link_check] failed to load cs_kaipoke_info", csError);
    throw csError;
  }

  const rows: CsRow[] = (targets ?? []) as CsRow[];

  let created = 0;

  for (const cs of rows) {
    const name = cs.name ?? "（名称未設定）";

    const msg = `【行動援護 支援手順書リンク無】 <a href="https://myfamille.shi-on.net/portal/kaipoke-info-detail/${cs.id}">${name}</a>`;

    try {
      const result = await ensureSystemAlert({
        message: msg,
        kaipoke_cs_id: cs.kaipoke_cs_id,
      });

      if (result.created) {
        created += 1;
      }
    } catch (err) {
      console.error("[kodoengo_plan_link_check] ensureSystemAlert error", err, {
        kaipoke_cs_id: cs.kaipoke_cs_id,
      });
      // 1件失敗しても他は続行
    }
  }

  console.log("[kodoengo_plan_link_check] done", {
    scanned: rows.length,
    created,
  });

  return {
    scanned: rows.length,
    created,
  };
}
