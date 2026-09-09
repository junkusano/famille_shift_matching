// /src/lib/alert_add/lw_user_group_missing_check.ts
// 「Lw利用者グループ生成エラー」アラート発行ロジック

import { supabaseAdmin } from "@/lib/supabase/service";
import { ensureSystemAlert } from "@/lib/alert/ensureSystemAlert";

type ShiftRow = {
  kaipoke_cs_id: string | null;
};

type GroupRow = {
  group_account: string | null;
};

type CsRow = {
  id: string;
  kaipoke_cs_id: string;
  name: string | null;
};

export type LwUserGroupMissingCheckResult = {
  scanned: number;
  created: number;
};

export async function lwUserGroupMissingCheck(): Promise<LwUserGroupMissingCheckResult> {
  console.log("[lw_user_group_missing_check] start");

  // 1) shift.kaipoke_cs_id（null 以外）の一覧
  const { data: shiftRows, error: shiftError } = await supabaseAdmin
    .from("shift")
    .select("kaipoke_cs_id")
    .not("kaipoke_cs_id", "is", null);

  if (shiftError) {
    console.error("[lw_user_group_missing_check] failed to load shift rows", shiftError);
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
    console.log("[lw_user_group_missing_check] no shift kaipoke_cs_id found");
    return { scanned: 0, created: 0 };
  }

  // 2) group_lw_channel_view で、利用者情報連携グループに紐づいているものを取得
  const { data: groupRows, error: groupError } = await supabaseAdmin
    .from("group_lw_channel_view")
    .select("group_account")
    .eq("group_type", "利用者様情報連携グループ")
    .in("group_account", csIds);

  if (groupError) {
    console.error("[lw_user_group_missing_check] failed to load group_lw_channel_view", groupError);
    throw groupError;
  }

  const existingAccounts = new Set(
    (groupRows ?? [])
      .map((g: GroupRow) => g.group_account)
      .filter((v): v is string => !!v)
  );

  // 3) shift には存在するのに、group_lw_channel_view に無い kaipoke_cs_id を抽出
  const missingCsIds = csIds.filter((id) => !existingAccounts.has(id));

  if (missingCsIds.length === 0) {
    console.log("[lw_user_group_missing_check] all groups exist");
    return { scanned: 0, created: 0 };
  }

  // 4) cs_kaipoke_info から利用者名を取得
  const { data: csRows, error: csError } = await supabaseAdmin
    .from("cs_kaipoke_info")
    .select("id, kaipoke_cs_id, name")
    .in("kaipoke_cs_id", missingCsIds)
    .neq("is_active", false);

  if (csError) {
    console.error("[lw_user_group_missing_check] failed to load cs_kaipoke_info", csError);
    throw csError;
  }

  const rows: CsRow[] = (csRows ?? []) as CsRow[];

  let created = 0;

  for (const cs of rows) {
    const name = cs.name ?? "（名称未設定）";
    const csId = cs.kaipoke_cs_id;

    const msg = `【Lw利用者グループ生成エラー】 「${name}様　情報連携＠${csId}」 というラインワークスグループが存在しない（名前が間違っている）、もしくは すまーとアイさん botが追加されていない　エラーです。対応後、何か一言（テスト　等を）コメントしてください。`;

    try {
      const result = await ensureSystemAlert({
        message: msg,
        kaipoke_cs_id: csId,
      });

      if (result.created) {
        created += 1;
      }
    } catch (err) {
      console.error("[lw_user_group_missing_check] ensureSystemAlert error", err, {
        kaipoke_cs_id: csId,
      });
      // 1件失敗しても他は続行
    }
  }

  console.log("[lw_user_group_missing_check] done", {
    scanned: rows.length,
    created,
  });

  return {
    scanned: rows.length,
    created,
  };
}
