// /src/app/api/alert_add/postal_code_check/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/service';
import { assertCronAuth, ensureSystemAlert } from '../_shared';

type CsRow = {
  kaipoke_cs_id: string;
  name: string | null;
  postal_code: string | null;
  is_active: boolean | null;
  end_at: string | null;
};

type ApiBody = { ok: true; scanned: number; created: number } | { ok: false; error: string };

export async function GET(req: NextRequest) {
  try {
    assertCronAuth(req);

    const { data, error } = await supabaseAdmin
      .from('cs_kaipoke_info')
      .select('kaipoke_cs_id, name, postal_code, is_active, end_at')
      .or('postal_code.is.null,postal_code.eq.')
      .eq('is_active', true)
      .is('end_at', null)
      .limit(2000);

    if (error) throw error;

    const rows: CsRow[] = (data ?? []) as CsRow[];
    let created = 0;

    for (const row of rows) {
      const csid = row.kaipoke_cs_id;
      const message = `【要入力】利用者(${row.name ?? '不明'}) の郵便番号が未設定です。kaipoke_cs_id=${csid}`;
      const res = await ensureSystemAlert({
        message,
        severity: 2,
        visible_roles: ['manager', 'staff'],
        kaipoke_cs_id: csid,
      });
      if (res.created) created++;
    }

    const body: ApiBody = { ok: true, scanned: rows.length, created };
    return NextResponse.json(body, { status: 200 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const body: ApiBody = { ok: false, error: msg };
    return NextResponse.json(body, { status: 500 });
  }
}
