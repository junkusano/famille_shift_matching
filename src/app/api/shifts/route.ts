//api/shifts

import { supabaseAdmin } from '@/lib/supabase/service';

/**
 * GET /api/shifts?kaipoke_cs_id=XXXX&month=YYYY-MM
 * - view からは * を取得し、足りない項目は API 層で補完（デフォルト値）
 * - 月フィルタは [月初, 翌月初) の範囲フィルタに変更
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const kaipokeCsId = searchParams.get('kaipoke_cs_id') ?? '';
    const month = searchParams.get('month') ?? '';

    console.info('[shifts][GET] kaipoke_cs_id=', kaipokeCsId, ' month=', month);

    if (!kaipokeCsId || !month) {
      return new Response(JSON.stringify({ error: 'kaipoke_cs_id and month are required' }), { status: 400 });
    }

    // month: 'YYYY-MM' を検証して日付範囲を作る
    const m = month.match(/^(\d{4})-(\d{2})$/);
    if (!m) {
      return new Response(JSON.stringify({ error: 'month must be YYYY-MM' }), { status: 400 });
    }
    const year = Number(m[1]);
    const mon = Number(m[2]); // 1..12
    const startDate = new Date(Date.UTC(year, mon - 1, 1));
    const endDate = new Date(Date.UTC(year, mon, 1));

    const fmt = (d: Date) => d.toISOString().slice(0, 10); // YYYY-MM-DD
    const gte = fmt(startDate);
    const lt = fmt(endDate);

    // ★ 列名不一致の事故を避けるため SQL では '*' に統一
    const { data, error } = await supabaseAdmin
      .from('shift_csinfo_postalname_view')
      .select('*')
      .eq('kaipoke_cs_id', kaipokeCsId)
      .gte('shift_start_date', gte)
      .lt('shift_start_date', lt)
      .order('shift_start_date', { ascending: true });

    if (error) {
      console.error('[shifts][GET] error', error);
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    // 足りない列を API 層で補完（UI が期待する形に正規化）
    const normalized = (Array.isArray(data) ? data : []).map((row: Record<string, unknown>) => {
      // 既存のキーをそのまま活かしながら、UI 必須の項目を埋める
      const staff02Attend = typeof row['staff_02_attend_flg'] === 'boolean'
        ? (row['staff_02_attend_flg'] as boolean)
        : false;

      const staff03Attend = typeof row['staff_03_attend_flg'] === 'boolean'
        ? (row['staff_03_attend_flg'] as boolean)
        : false;

      const requiredCount = typeof row['required_staff_count'] === 'number'
        ? (row['required_staff_count'] as number)
        : 1;

      const twoPerson = typeof row['two_person_work_flg'] === 'boolean'
        ? (row['two_person_work_flg'] as boolean)
        : Boolean(row['staff_02_user_id']); // 2人目が入っていれば true とみなす暫定

      return {
        // そのまま拾える想定の項目（存在しない場合は undefined になるだけ）
        shift_id: String(row['shift_id'] ?? ''),
        kaipoke_cs_id: String(row['kaipoke_cs_id'] ?? ''),
        name: String(row['name'] ?? ''), // 利用者名（view から来ている想定）
        shift_start_date: String(row['shift_start_date'] ?? ''),
        shift_start_time: String(row['shift_start_time'] ?? ''),
        shift_end_time: String(row['shift_end_time'] ?? ''),
        service_code: String(row['service_code'] ?? ''),

        staff_01_user_id: row['staff_01_user_id'] ? String(row['staff_01_user_id']) : null,
        staff_02_user_id: row['staff_02_user_id'] ? String(row['staff_02_user_id']) : null,
        staff_03_user_id: row['staff_03_user_id'] ? String(row['staff_03_user_id']) : null,

        // この辺は view に無ければデフォルトで補完
        staff_02_attend_flg: staff02Attend,
        staff_03_attend_flg: staff03Attend,
        required_staff_count: requiredCount,
        two_person_work_flg: twoPerson,
        judo_ido: String(row['judo_ido'] ?? ''), // 無ければ空文字
      };
    });

    console.info('[shifts][GET] result count=', normalized.length);
    return new Response(JSON.stringify(normalized), { status: 200 });
  } catch (e: unknown) {
    console.error('[shifts][GET] unhandled error', e);
    return new Response(JSON.stringify({ error: 'internal error' }), { status: 500 });
  }
}

/**
 * 現状、更新先テーブルの仕様が未確定（view は更新不可 / "shift(s)" テーブル無し）なので 501
 * 仕様確定後、更新可能なベーステーブルに対して update する実装へ置き換えてください。
 */
export async function PUT() {
  return new Response(JSON.stringify({ error: 'Not Implemented: backend update target is not defined in this environment.' }), { status: 501 });
}
