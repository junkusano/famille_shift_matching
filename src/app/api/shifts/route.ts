//api/shifts

import { supabaseAdmin } from '@/lib/supabase/service';

export const runtime = 'nodejs'

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

// === POST /api/shifts : 新規作成 ===
export async function POST(req: Request) {
  // 書き込み先候補（存在する方に書く）
  const CANDIDATE_TABLES = ['roster_shift', 'shifts'] as const

  // ヘルパー
  const json = (obj: unknown, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } })

  const toHMS = (v: string) => {
    const s = String(v ?? '').trim()
    if (/^\d{2}:\d{2}:\d{2}$/.test(s)) return s
    if (/^\d{1,2}:\d{2}$/.test(s)) {
      const [h, m] = s.split(':')
      return `${h.padStart(2, '0')}:${m.padStart(2, '0')}:00`
    }
    return s
  }

  try {
    const raw = (await req.json()) as Record<string, unknown>

    // 必須
    for (const k of ['kaipoke_cs_id','shift_start_date','shift_start_time','shift_end_time'] as const) {
      if (!raw[k]) return json({ error: { message: `missing field: ${k}` } }, 400)
    }

    // UI側draftと同じ導出（未指定なら計算）
    const dispatchSize = (raw['dispatch_size'] as string | undefined)
    const dupRole = (raw['dup_role'] as string | undefined)

    const required_staff_count =
      (raw['required_staff_count'] as number | undefined) ?? (dispatchSize === '01' ? 2 : 1)

    const two_person_work_flg =
      (raw['two_person_work_flg'] as boolean | undefined) ?? (!!dupRole && dupRole !== '-')

    // insert行
    const row = {
      kaipoke_cs_id: String(raw['kaipoke_cs_id']),
      shift_start_date: String(raw['shift_start_date']),       // YYYY-MM-DD
      shift_start_time: toHMS(String(raw['shift_start_time'])),// HH:MM:SS
      shift_end_time: toHMS(String(raw['shift_end_time'])),    // HH:MM:SS
      service_code: (raw['service_code'] ?? null) as string | null,
      required_staff_count,
      two_person_work_flg,
      judo_ido: (raw['judo_ido'] ?? null) as string | null,    // 'HHMM' or null
      staff_01_user_id: (raw['staff_01_user_id'] ?? null) as string | null,
      staff_02_user_id: (raw['staff_02_user_id'] ?? null) as string | null,
      staff_03_user_id: (raw['staff_03_user_id'] ?? null) as string | null,
      staff_02_attend_flg: Boolean(raw['staff_02_attend_flg'] ?? false),
      staff_03_attend_flg: Boolean(raw['staff_03_attend_flg'] ?? false),
    }

    // 順にトライ（存在/権限のあるテーブルで通る）
    let lastErr: Record<string, unknown> | null = null

    for (const table of CANDIDATE_TABLES) {
      const { data, error } = await supabaseAdmin
        .from(table)
        .insert(row)
        .select('shift_id, id')
        .single()

      if (!error && data) {
        const createdId = (data as { shift_id?: string; id?: string }).shift_id ?? (data as { id?: string }).id
        return json({ shift_id: createdId, table }, 201)
      }

      // エラーを取り出して保持（message/details/hint/code を詰める）
      if (error && typeof error === 'object') {
        lastErr = {
          code: (error as any).code ?? null,
          message: (error as any).message ?? null,
          details: (error as any).details ?? null,
          hint: (error as any).hint ?? null,
          table,
        }
        // 代表的な「テーブルが無い」「RLS」等は次の候補へ
        continue
      }
    }

    // ここまで来たら全候補NG
    return json({ error: lastErr ?? { message: 'insert failed (unknown)', table: CANDIDATE_TABLES.join(',') } }, 400)
  } catch (e: unknown) {
    const err = e instanceof Error ? { message: e.message, stack: e.stack } : { message: String(e ?? 'unknown') }
    console.error('[shifts][POST] unhandled error', err)
    return json({ error: err }, 500)
  }
}

/**
 * 現状、更新先テーブルの仕様が未確定（view は更新不可 / "shift(s)" テーブル無し）なので 501
 * 仕様確定後、更新可能なベーステーブルに対して update する実装へ置き換えてください。
 */
export async function PUT() {
  return new Response(JSON.stringify({ error: 'Not Implemented: backend update target is not defined in this environment.' }), { status: 501 });
}
