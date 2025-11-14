// /src/lib/alert_add/postal_code_check.ts
// 「郵便番号未設定アラート」を発行するロジック本体。
// cron ハブからのみ呼ばれる想定。

import { supabaseAdmin } from '@/lib/supabase/service';
import { ensureSystemAlert } from '@/app/api/alert_add/_shared';

type CsRow = {
  kaipoke_cs_id: string;
  name: string | null;
  postal_code: string | null;
  is_active: boolean | null;
  end_at: string | null;
};

export type PostalCodeCheckResult = {
  scanned: number; // チェック対象件数
  created: number; // 新規に作成された alert 件数
};

export async function runPostalCodeCheck(): Promise<PostalCodeCheckResult> {
  // cs_kaipoke_info 全件から必要なカラムだけ取得
  const { data, error } = await supabaseAdmin
    .from('cs_kaipoke_info')
    .select('kaipoke_cs_id, name, postal_code, is_active, end_at');

  if (error) {
    console.error('[postal_code_check] select error', error);
    throw new Error(`cs_kaipoke_info select failed: ${error.message}`);
  }

  const rows = (data ?? []) as CsRow[];

  // is_active が true（null の場合は true扱い）で、postal_code が空のものだけ対象
  const targets = rows.filter((r) => {
    const active = r.is_active ?? true;
    if (!active) return false;

    const pc = (r.postal_code ?? '').trim();
    return pc === '';
  });

  let created = 0;

  for (const cs of targets) {
    const csid = cs.kaipoke_cs_id;
    const name = cs.name ?? '(名称未設定)';

    const detailUrl = `https://myfamille.shi-on.net/portal/kaipoke-info-detail/${csid}`;

    const message =
      `【要設定】利用者の郵便番号が未入力です：` +
      `${name}（CS ID: ${csid}） ` +
      `利用者詳細: ${detailUrl}`;

    try {
      const res = await ensureSystemAlert({
        message,
        severity: 2,
        visible_roles: ['manager', 'staff'],
        kaipoke_cs_id: csid,
      });
      if (res.created) created++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[postal_code_check] ensureSystemAlert error', { csid, msg });
      // 1件失敗しても他は続行
    }
  }

  console.log('[postal_code_check] done', {
    scanned: targets.length,
    created,
  });

  return { scanned: targets.length, created };
}
