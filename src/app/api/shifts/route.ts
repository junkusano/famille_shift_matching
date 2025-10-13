// /src/app/api/shifts/route.ts
import { supabaseAdmin } from '@/lib/supabase/service'

// APIはNodeランタイムで実行（Service Role利用）
export const runtime = 'nodejs'

// === 共通: エラー型（軽量） ===
type SupaErrLike = { code?: string | null; message: string; details?: string | null; hint?: string | null };

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

const toHMS = (v: string) => {
  const s = String(v ?? '').trim();
  if (/^\d{2}:\d{2}:\d{2}$/.test(s)) return s;
  if (/^\d{1,2}:\d{2}$/.test(s)) {
    const [h, m] = s.split(':');
    return `${h.padStart(2, '0')}:${m.padStart(2, '0')}:00`;
  }
  return s; // 想定外はDB側でエラー
};

/*
const toBool = (v: unknown): boolean =>
  typeof v === 'boolean' ? v : /^(true|t|1)$/i.test(String(v ?? '').trim());
*/

/**
 * GET /api/shifts?kaipoke_cs_id=XXXX&month=YYYY-MM
 * - view からは * を取得し、足りない項目は API 層で補完（デフォルト値）
 * - 月フィルタは [月初, 翌月初) の範囲フィルタ
 * - ※ “素のコード”仕様に復元
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const kaipokeCsId = searchParams.get('kaipoke_cs_id') ?? ''
    const month = searchParams.get('month') ?? ''

    console.info('[shifts][GET] kaipoke_cs_id=', kaipokeCsId, ' month=', month)

    if (!kaipokeCsId || !month) {
      return json({ error: 'kaipoke_cs_id and month are required' }, 400)
    }

    const m = month.match(/^(\d{4})-(\d{2})$/)
    if (!m) return json({ error: 'month must be YYYY-MM' }, 400)

    const year = Number(m[1])
    const mon = Number(m[2]) // 1..12
    const startDate = new Date(Date.UTC(year, mon - 1, 1))
    const endDate = new Date(Date.UTC(year, mon, 1))
    const fmt = (d: Date) => d.toISOString().slice(0, 10) // YYYY-MM-DD
    const gte = fmt(startDate)
    const lt = fmt(endDate)

    // ★ view名・列名は“素のコード”に合わせています
    const { data, error } = await supabaseAdmin
      .from('shift_csinfo_postalname_view')
      .select('*')
      .eq('kaipoke_cs_id', kaipokeCsId)
      .gte('shift_start_date', gte)
      .lt('shift_start_date', lt)
      .order('shift_start_date', { ascending: true })

    if (error) {
      console.error('[shifts][GET] error', error)
      return json({ error: error.message }, 500)
    }

    // UI が使う形へ正規化（足りない列はデフォルト補完）
    const normalized = (Array.isArray(data) ? data : []).map((row: Record<string, unknown>) => {
      const staff02Attend = row['staff_02_attend_flg'];
      const staff03Attend = row['staff_03_attend_flg'];

      // 1. required_staff_count を取得 (number型)
      const requiredCount =
        typeof row['required_staff_count'] === 'number' ? (row['required_staff_count'] as number) : 1

      // 2. two_person_work_flg を計算
      // requiredCount が 2 以上の場合は、強制的に true にする。
      // DBの値 (row['two_person_work_flg']) よりも requiredCount を優先します。
      const twoPerson = requiredCount >= 2 ? true :
        (typeof row['two_person_work_flg'] === 'boolean'
          ? (row['two_person_work_flg'] as boolean)
          : Boolean(row['staff_02_user_id'])
        )

      return {
        shift_id: String(row['shift_id'] ?? ''),
        kaipoke_cs_id: String(row['kaipoke_cs_id'] ?? ''),
        name: String(row['name'] ?? ''),
        shift_start_date: String(row['shift_start_date'] ?? ''),
        shift_start_time: String(row['shift_start_time'] ?? ''),
        shift_end_time: String(row['shift_end_time'] ?? ''),
        service_code: String(row['service_code'] ?? ''),
        staff_01_user_id: row['staff_01_user_id'] ? String(row['staff_01_user_id']) : null,
        staff_02_user_id: row['staff_02_user_id'] ? String(row['staff_02_user_id']) : null,
        staff_03_user_id: row['staff_03_user_id'] ? String(row['staff_03_user_id']) : null,
        staff_02_attend_flg: staff02Attend,
        staff_03_attend_flg: staff03Attend,
        // requiredCount (number) を String(requiredCount) に変換
        required_staff_count: String(requiredCount),
        // twoPerson (boolean) を String(twoPerson) に変換 ("true" or "false" になる)
        two_person_work_flg: String(twoPerson),
        judo_ido: String(row['judo_ido'] ?? ''), // 無ければ空文字
      }
    })

    console.info('[shifts][GET] result count=', normalized.length)
    return json(normalized, 200)
  } catch (e: unknown) {
    console.error('[shifts][GET] unhandled error', e)
    return json({ error: 'internal error' }, 500)
  }
}

// === POST /api/shifts : 新規作成（正しいテーブル: public.shift） ===
export async function POST(req: Request) {
  const json = (obj: unknown, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

  const toHMS = (v: string) => {
    const s = String(v ?? '').trim();
    if (/^\d{2}:\d{2}:\d{2}$/.test(s)) return s;
    if (/^\d{1,2}:\d{2}$/.test(s)) {
      const [h, m] = s.split(':');
      return `${h.padStart(2, '0')}:${m.padStart(2, '0')}:00`;
    }
    return s;
  };

  try {
    const raw = (await req.json()) as Record<string, unknown>;

    // 必須
    for (const k of ['kaipoke_cs_id', 'shift_start_date', 'shift_start_time'] as const) {
      if (!raw[k]) return json({ error: { message: `missing field: ${k}` } }, 400);
    }

    // UIドラフトと同じ導出（未指定なら計算）
    const dispatchSize = raw['dispatch_size'] as string | undefined;
    const dupRole = raw['dup_role'] as string | undefined;

    // required_staff_count は raw['required_staff_count'] があればそれを使用。
    // 無ければ dispatch_size に応じて 2 または 1 を設定。
    const required_staff_count =
      (raw['required_staff_count'] as number | undefined) ?? (dispatchSize === '01' ? 2 : 1);

    // two_person_work_flg は required_staff_count が 2 以上なら true に上書きするロジックを優先。
    // それ以外は raw['two_person_work_flg'] または dupRole に応じて設定。
    let two_person_work_flg = required_staff_count >= 2;
    if (!two_person_work_flg) {
      two_person_work_flg =
        (raw['two_person_work_flg'] as boolean | undefined) ?? (!!dupRole && dupRole !== '-');
    }

    // INSERT行（public.shift のカラムに合わせる）
    const row = {
      kaipoke_cs_id: String(raw['kaipoke_cs_id']),
      shift_start_date: String(raw['shift_start_date']),          // date
      shift_start_time: toHMS(String(raw['shift_start_time'])),  // time
      shift_end_date: (raw['shift_end_date'] ?? null) as string | null,
      shift_end_time: raw['shift_end_time'] ? toHMS(String(raw['shift_end_time'])) : null,
      service_code: (raw['service_code'] ?? null) as string | null,
      staff_01_user_id: (raw['staff_01_user_id'] ?? null) as string | null,
      staff_02_user_id: (raw['staff_02_user_id'] ?? null) as string | null,
      staff_02_attend_flg: Boolean(raw['staff_02_attend_flg'] ?? false),
      staff_03_user_id: (raw['staff_03_user_id'] ?? null) as string | null,
      staff_03_attend_flg: Boolean(raw['staff_03_attend_flg'] ?? false),
      required_staff_count,
      two_person_work_flg,
      staff_01_role_code: (raw['staff_01_role_code'] ?? null) as string | null,
      staff_02_role_code: (raw['staff_02_role_code'] ?? null) as string | null,
      staff_03_role_code: (raw['staff_03_role_code'] ?? null) as string | null,
      judo_ido: (raw['judo_ido'] ?? null) as string | null,
    };

    const SHIFT_TABLE = 'shift' as const;

    // 1) まず通常の挿入
    const { data, error } = await supabaseAdmin
      .from(SHIFT_TABLE)
      .insert(row)
      .select('shift_id')
      .single();

    if (!error && data) {
      return json({ shift_id: (data as { shift_id: number }).shift_id, table: SHIFT_TABLE }, 201);
    }

    // 2) 一意制約(kaipoke_cs_id, start_date, start_time) で重複した場合のフォールバック
    const errMsg = (error as { message?: string; code?: string } | null)?.message ?? String(error ?? '');
    const errCode = (error as { code?: string } | null)?.code ?? null;
    if (errCode === '23505' || /duplicate key value/i.test(errMsg)) {
      const { data: existing, error: selErr } = await supabaseAdmin
        .from(SHIFT_TABLE)
        .select('shift_id')
        .eq('kaipoke_cs_id', row.kaipoke_cs_id)
        .eq('shift_start_date', row.shift_start_date)
        .eq('shift_start_time', row.shift_start_time)
        .single();

      if (!selErr && existing) {
        return json({ shift_id: (existing as { shift_id: number }).shift_id, duplicate: true }, 200);
      }
    }

    // 3) それ以外の失敗はメッセージをそのまま返す
    return json({ error: { code: errCode, message: errMsg } }, 400);
  } catch (e: unknown) {
    const err = e instanceof Error ? { message: e.message, stack: e.stack } : { message: String(e ?? 'unknown') };
    console.error('[shifts][POST] unhandled error', err);
    return json({ error: err }, 500);
  }
}



// === PUT /api/shifts : 更新 ===
export async function PUT(req: Request) {
  try {
    const raw = (await req.json()) as Record<string, unknown>;
    const idVal = raw['shift_id'] ?? raw['id'];
    const id = typeof idVal === 'string' ? Number(idVal) : (typeof idVal === 'number' ? idVal : null);

    // 部分更新パッチを構築
    const patch: Record<string, unknown> = {};
    const setIf = (k: string, v: unknown) => { if (v !== undefined) patch[k] = v; };

    setIf('shift_start_date', raw['shift_start_date'] as string | undefined);
    setIf('shift_end_date', raw['shift_end_date'] as string | undefined);
    if (raw['shift_start_time'] !== undefined) patch['shift_start_time'] = toHMS(String(raw['shift_start_time']));
    if (raw['shift_end_time'] !== undefined) patch['shift_end_time'] = toHMS(String(raw['shift_end_time']));

    ([
      'service_code', 'staff_01_user_id', 'staff_02_user_id', 'staff_03_user_id',
      'staff_01_role_code', 'staff_02_role_code', 'staff_03_role_code', 'judo_ido'
    ] as const).forEach(k => setIf(k, (raw[k] ?? null) as string | null));

    if (raw['staff_02_attend_flg'] !== undefined) patch['staff_02_attend_flg'] = Boolean(raw['staff_02_attend_flg']);
    if (raw['staff_03_attend_flg'] !== undefined) patch['staff_03_attend_flg'] = Boolean(raw['staff_03_attend_flg']);

    // required_staff_count が渡された場合
    if (raw['required_staff_count'] !== undefined) {
      const requiredCount = Number(raw['required_staff_count']);
      patch['required_staff_count'] = requiredCount;
      // required_staff_count が 2 以上なら two_person_work_flg を true に上書きするロジックを優先
      if (requiredCount >= 2) {
        patch['two_person_work_flg'] = true;
      } else if (raw['two_person_work_flg'] !== undefined) {
        // 1人以下で、two_person_work_flg が明示的に渡された場合はそれを使用
        patch['two_person_work_flg'] = Boolean(raw['two_person_work_flg']);
      }
    } else if (raw['two_person_work_flg'] !== undefined) {
      // required_staff_count が渡されていないが two_person_work_flg が渡された場合
      patch['two_person_work_flg'] = Boolean(raw['two_person_work_flg']);
    }

    if (Object.keys(patch).length === 0) return json({ error: { message: 'no fields to update' } }, 400);

    // 1) shift_id 優先
    if (id != null) {
      const { data, error } = await supabaseAdmin
        .from('shift')
        .update(patch)
        .eq('shift_id', id)
        .select('shift_id')
        .single();

      if (error) {
        const e = error as SupaErrLike;
        return json({ error: { code: e.code ?? null, message: e.message } }, 400);
      }
      return json({ ok: true, shift_id: (data as { shift_id: number }).shift_id });
    }

    // 2) 複合キー（kaipoke_cs_id + start_date + start_time）でも更新可
    const cs = raw['kaipoke_cs_id'] as string | undefined;
    const sd = raw['shift_start_date'] as string | undefined;
    const st = raw['shift_start_time'] as string | undefined;

    if (cs && sd && st) {
      const { data, error } = await supabaseAdmin
        .from('shift')
        .update(patch)
        .eq('kaipoke_cs_id', cs)
        .eq('shift_start_date', sd)
        .eq('shift_start_time', toHMS(String(st)))
        .select('shift_id')
        .single();

      if (error) {
        const e = error as SupaErrLike;
        return json({ error: { code: e.code ?? null, message: e.message } }, 400);
      }
      return json({ ok: true, shift_id: (data as { shift_id: number }).shift_id });
    }

    return json({ error: { message: 'missing shift_id (or composite keys)' } }, 400);
  } catch (e: unknown) {
    const err = e instanceof Error ? { message: e.message, stack: e.stack } : { message: String(e ?? 'unknown') };
    console.error('[shifts][PUT] unhandled error', err);
    return json({ error: err }, 500);
  }
}

// === DELETE /api/shifts : 削除 ===
export async function DELETE(req: Request) {
  try {
    const raw = (await req.json()) as Record<string, unknown>;

    // 1) 複数ID
    if (Array.isArray(raw['ids'])) {
      const ids = (raw['ids'] as unknown[])
        .map(v => (typeof v === 'string' ? Number(v) : v))
        .filter((v): v is number => typeof v === 'number');

      if (ids.length === 0) return json({ error: { message: 'ids is empty' } }, 400);

      const { error } = await supabaseAdmin.from('shift').delete().in('shift_id', ids);
      if (error) {
        const e = error as SupaErrLike;
        return json({ error: { code: e.code ?? null, message: e.message } }, 400);
      }
      return json({ ok: true, count: ids.length });
    }

    // 2) 単一ID
    const idVal = raw['shift_id'] ?? raw['id'];
    if (idVal != null) {
      const id = typeof idVal === 'string' ? Number(idVal) : (idVal as number);
      const { error } = await supabaseAdmin.from('shift').delete().eq('shift_id', id);
      if (error) {
        const e = error as SupaErrLike;
        return json({ error: { code: e.code ?? null, message: e.message } }, 400);
      }
      return json({ ok: true, count: 1 });
    }

    // 3) 複合キーでも削除可
    const cs = raw['kaipoke_cs_id'] as string | undefined;
    const sd = raw['shift_start_date'] as string | undefined;
    const st = raw['shift_start_time'] as string | undefined;
    if (cs && sd && st) {
      const { error } = await supabaseAdmin
        .from('shift')
        .delete()
        .eq('kaipoke_cs_id', cs)
        .eq('shift_start_date', sd)
        .eq('shift_start_time', toHMS(String(st)));

      if (error) {
        const e = error as SupaErrLike;
        return json({ error: { code: e.code ?? null, message: e.message } }, 400);
      }
      return json({ ok: true, count: 1 });
    }

    return json({ error: { message: 'missing ids or composite keys' } }, 400);
  } catch (e: unknown) {
    const err = e instanceof Error ? { message: e.message, stack: e.stack } : { message: String(e ?? 'unknown') };
    console.error('[shifts][DELETE] unhandled error', err);
    return json({ error: err }, 500);
  }
}
