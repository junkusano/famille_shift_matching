// src/app/api/shift-assign-after-rpa/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/service';

export const runtime = 'nodejs';        // ← service-role必須のためEdge回避
export const dynamic = 'force-dynamic'; // ← キャッシュ無効
export const revalidate = 0;

type AssignResult = {
  status: 'assigned' | 'replaced' | 'error' | 'noop';
  slot?: 'staff_01' | 'staff_02' | 'staff_03';
  message?: string;
};

export async function POST(req: NextRequest) {
  const stages: Array<Record<string, unknown>> = [];
  const now = () => new Date().toISOString();

  let apiLogError: string | null = null;
  let shiftIdForLog: number | null = null;
  let requestedByForLog: string | null = null;
  let accompanyForLog: boolean | null = null;

  // 相関ID（フロントからもらう or サーバで発行）
  const traceId =
    req.headers.get('x-trace-id') ??
    (typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? (crypto as { randomUUID: () => string }).randomUUID()
      : `${Date.now()}_${Math.random()}`);

  try {
    const body = await req.json();
    stages.push({ t: now(), stage: 'entered_api', keys: Object.keys(body ?? {}), traceId });
    console.log('[AFTER-RPA]', traceId, 'entered_api', Object.keys(body ?? {}));

    const {
      shift_id,
      requested_by_user_id,    // ← users.user_id（社内ID）
      accompany = true,
      role_code = null,
    } = body ?? {};

    shiftIdForLog = Number(shift_id) || null;
    requestedByForLog = requested_by_user_id ?? null;
    accompanyForLog = !!accompany;

    if (!shift_id || !requested_by_user_id) {
      apiLogError = 'bad request';
      stages.push({ t: now(), stage: 'bad_request', traceId });
      console.warn('[AFTER-RPA]', traceId, 'bad_request');
      return NextResponse.json({ error: 'bad request', stages, traceId }, { status: 400 });
    }

    stages.push({ t: now(), stage: 'rpc_call', shift_id, requested_by_user_id, accompany, traceId });
    console.log('[AFTER-RPA]', traceId, 'rpc_call', { shift_id, requested_by_user_id, accompany });

    //supabase の function assign_user_to_shift_v2' を実行　以下は　function の中身
    /*
    drop function if exists public.assign_user_to_shift_v2(bigint, text, text, boolean);

create or replace function public.assign_user_to_shift_v2(
  p_shift_id   bigint,
  p_user_id    text,
  p_role_code  text default null,  -- '01' / '02' / '-999' / null
  p_accompany  boolean default true
)
returns jsonb
language plpgsql
as $fn$
declare
  v_shift         public.shift%rowtype;
  v_required      smallint;
  v_empty_idx     int := 0;
  v_candidate_idx int := 0;
  v_lowest_sort   bigint := null;
  v_level_sort    bigint;
  v_slot_idx      int;
  v_slot_names    text[] := array['staff_01','staff_02','staff_03'];

  -- 生値
  v_u1_raw text; v_u2_raw text; v_u3_raw text;
  v_r1_raw text; v_r2_raw text; v_r3_raw text;

  -- 正規化後（'' → NULL）
  v_u1 text; v_u2 text; v_u3 text;
  v_r1 text; v_r2 text; v_r3 text;

  v_level_sorts   bigint[] := array[NULL::bigint, NULL::bigint, NULL::bigint];
  v_decision      text := '';
  v_status        text := '';
  v_message       text := null;

  -- role_code のサニタイズ（テーブル制約対応）
  v_new_role text;
begin
  -- 0) role_code 正規化
  if p_role_code in ('01','02','-999') then
    v_new_role := p_role_code;
  else
    v_new_role := null; -- 無指定 or 無効値は変更しない方針
  end if;

  -- 1) 対象行をロック取得
  select * into v_shift from public.shift where shift_id = p_shift_id for update;
  if not found then
    v_status  := 'error';
    v_message := 'shift not found';
    insert into public.shift_assign_log(shift_id, requested_user_id, accompany, decision, status, message)
    values (p_shift_id, p_user_id, p_accompany, 'not_found', v_status, v_message);
    return jsonb_build_object('status','error','message',v_message);
  end if;

  -- 既存値を退避（生値）
  v_u1_raw := v_shift.staff_01_user_id;  v_r1_raw := v_shift.staff_01_role_code;
  v_u2_raw := v_shift.staff_02_user_id;  v_r2_raw := v_shift.staff_02_role_code;
  v_u3_raw := v_shift.staff_03_user_id;  v_r3_raw := v_shift.staff_03_role_code;

  -- '' を NULL に正規化
  v_u1 := nullif(v_u1_raw, '');  v_r1 := nullif(v_r1_raw, '');
  v_u2 := nullif(v_u2_raw, '');  v_r2 := nullif(v_r2_raw, '');
  v_u3 := nullif(v_u3_raw, '');  v_r3 := nullif(v_r3_raw, '');

  -- 2) 既に本人が入っているなら何もしない（空文字も含めた比較：正規化後でOK）
  if v_u1 = p_user_id or v_u2 = p_user_id or v_u3 = p_user_id then
    v_status   := 'noop';
    v_decision := 'already_assigned';
    insert into public.shift_assign_log(
      shift_id, requested_user_id, accompany, required_staff_count,
      staff_01_user_id, staff_02_user_id, staff_03_user_id,
      empty_idx, candidate_idx, lowest_sort, decision, status, message
    ) values (
      p_shift_id, p_user_id, p_accompany, v_shift.required_staff_count,
      v_u1, v_u2, v_u3,
      0, 0, null, v_decision, v_status, 'already assigned'
    );
    return jsonb_build_object('status','noop','message','already assigned');
  end if;

  v_required := greatest(1, coalesce(v_shift.required_staff_count,1));

  -- 3) 必要枠内(1..required)で最初の空きを探索（'' も空き扱い → 正規化済みを判定）
  for v_slot_idx in 1..v_required loop
    if (v_slot_idx = 1 and v_u1 is null)
       or (v_slot_idx = 2 and v_u2 is null)
       or (v_slot_idx = 3 and v_u3 is null)
    then
      v_empty_idx := v_slot_idx;
      exit;
    end if;
  end loop;

  -- 4) 置換候補（level_sort<5000000 の中で最小）を探索＆各枠の level_sort を記録
  for v_slot_idx in 1..3 loop
    if (v_slot_idx = 1 and v_u1 is null)
       or (v_slot_idx = 2 and v_u2 is null)
       or (v_slot_idx = 3 and v_u3 is null)
    then
      continue;
    end if;

    select ue.level_sort::bigint into v_level_sort
      from public.user_entry_united_view_single ue
     where ue.user_id = case v_slot_idx when 1 then v_u1 when 2 then v_u2 else v_u3 end
     limit 1;

    if v_level_sort is null then
      v_level_sort := 999999999; -- 未登録は置換不可扱い
    end if;

    v_level_sorts[v_slot_idx] := v_level_sort;

    if v_level_sort < 5000000 then
      -- attend フラグ制御（02/03 は false の時だけ候補可）
      if v_slot_idx = 1
         or (v_slot_idx = 2 and coalesce(v_shift.staff_02_attend_flg,false) = false)
         or (v_slot_idx = 3 and coalesce(v_shift.staff_03_attend_flg,false) = false)
      then
        if v_lowest_sort is null or v_level_sort < v_lowest_sort then
          v_lowest_sort   := v_level_sort;
          v_candidate_idx := v_slot_idx;
        end if;
      end if;
    end if;
  end loop;

  -- 5) 適用
  if p_accompany then
    -- 5-1) 空きがあればそこに入れる（後ろずらしなし → attend_flg 変更なし）
    if v_empty_idx > 0 then
      if v_empty_idx = 1 then
        update public.shift
           set staff_01_user_id  = p_user_id,
               staff_01_role_code= coalesce(v_new_role, staff_01_role_code),
               update_at         = now()
         where shift_id = p_shift_id;
      elsif v_empty_idx = 2 then
        update public.shift
           set staff_02_user_id  = p_user_id,
               staff_02_role_code= coalesce(v_new_role, staff_02_role_code),
               update_at         = now()
         where shift_id = p_shift_id;
      else
        update public.shift
           set staff_03_user_id  = p_user_id,
               staff_03_role_code= coalesce(v_new_role, staff_03_role_code),
               update_at         = now()
         where shift_id = p_shift_id;
      end if;

      v_status   := 'assigned';
      v_decision := format('accompany=true empty->%s', v_slot_names[v_empty_idx]);

      insert into public.shift_assign_log(
        shift_id, requested_user_id, accompany, required_staff_count,
        staff_01_user_id, staff_01_level_sort,
        staff_02_user_id, staff_02_level_sort,
        staff_03_user_id, staff_03_level_sort,
        empty_idx, candidate_idx, lowest_sort, decision, status, message
      ) values (
        p_shift_id, p_user_id, p_accompany, v_required,
        v_u1, v_level_sorts[1],
        v_u2, v_level_sorts[2],
        v_u3, v_level_sorts[3],
        v_empty_idx, 0, null, v_decision, v_status, null
      );

      return jsonb_build_object('status','assigned','slot',v_slot_names[v_empty_idx]);
    end if;

    -- 5-2) 空きが無い → 最小 level_sort の枠を置換。
    --       このとき “押し出されたユーザー” を下位枠へずらし、ずらされた枠の attend_flg を true にする
    if v_candidate_idx > 0 then
      if v_candidate_idx = 1 then
        -- 01 をリクエスト者に、旧01 を 02/03 へ“ずらす”
        if v_u2 is null then
          -- 01 -> 02 にスライド（02 attend=true）
          update public.shift
             set staff_01_user_id   = p_user_id,
                 staff_01_role_code = coalesce(v_new_role, staff_01_role_code),
                 staff_02_user_id   = v_u1,
                 staff_02_role_code = v_r1,
                 staff_02_attend_flg= true,
                 update_at          = now()
           where shift_id = p_shift_id;
          v_decision := 'accompany=true replace->staff_01 (demote 01->02, attend_02=true)';
        elsif v_u3 is null then
          -- 02 -> 03 にスライド（03 attend=true）、01 -> 02 にスライド（02 attend=true）
          update public.shift
             set staff_01_user_id   = p_user_id,
                 staff_01_role_code = coalesce(v_new_role, staff_01_role_code),
                 staff_03_user_id   = v_u2,
                 staff_03_role_code = v_r2,
                 staff_03_attend_flg= true,
                 staff_02_user_id   = v_u1,
                 staff_02_role_code = v_r1,
                 staff_02_attend_flg= true,
                 update_at          = now()
           where shift_id = p_shift_id;
          v_decision := 'accompany=true replace->staff_01 (demote 02->03 & 01->02, attend_02/03=true)';
        else
          -- 下位に空きが無ければ“ずらせない”ので、ノーデモート（従来挙動）
          update public.shift
             set staff_01_user_id   = p_user_id,
                 staff_01_role_code = coalesce(v_new_role, staff_01_role_code),
                 update_at          = now()
           where shift_id = p_shift_id;
          v_decision := 'accompany=true replace->staff_01 (no demote)';
        end if;

      elsif v_candidate_idx = 2 then
        -- 02 をリクエスト者に、旧02 を 03 へ“ずらす”（03 attend=true）※03 が空いている場合のみ
        if v_u3 is null then
          update public.shift
             set staff_02_user_id   = p_user_id,
                 staff_02_role_code = coalesce(v_new_role, staff_02_role_code),
                 staff_03_user_id   = v_u2,
                 staff_03_role_code = v_r2,
                 staff_03_attend_flg= true,
                 update_at          = now()
           where shift_id = p_shift_id;
          v_decision := 'accompany=true replace->staff_02 (demote 02->03, attend_03=true)';
        else
          -- 03も埋まっているなら“ずらせない” → ノーデモートで 02 に入れるだけ
          update public.shift
             set staff_02_user_id   = p_user_id,
                 staff_02_role_code = coalesce(v_new_role, staff_02_role_code),
                 update_at          = now()
           where shift_id = p_shift_id;
          v_decision := 'accompany=true replace->staff_02 (no demote)';
        end if;

      else
        -- accompany=true で 03 候補 → 下位が無いのでノーデモート
        update public.shift
           set staff_03_user_id   = p_user_id,
               staff_03_role_code = coalesce(v_new_role, staff_03_role_code),
               update_at          = now()
         where shift_id = p_shift_id;
        v_decision := 'accompany=true replace->staff_03 (no demote)';
      end if;

      v_status := 'replaced';

      insert into public.shift_assign_log(
        shift_id, requested_user_id, accompany, required_staff_count,
        staff_01_user_id, staff_01_level_sort,
        staff_02_user_id, staff_02_level_sort,
        staff_03_user_id, staff_03_level_sort,
        empty_idx, candidate_idx, lowest_sort, decision, status, message
      ) values (
        p_shift_id, p_user_id, p_accompany, v_required,
        v_u1, v_level_sorts[1],
        v_u2, v_level_sorts[2],
        v_u3, v_level_sorts[3],
        v_empty_idx, v_candidate_idx, v_lowest_sort, v_decision, v_status, null
      );

      return jsonb_build_object('status','replaced','slot',v_slot_names[v_candidate_idx]);
    end if;

    -- 空きも候補もない
    v_status   := 'error';
    v_decision := 'accompany=true no_empty no_candidate';
    v_message  := '交代できる人が見つけられないため、希望シフトを登録できませんでした。マネジャーに問い合わせください';

    insert into public.shift_assign_log(
      shift_id, requested_user_id, accompany, required_staff_count,
      staff_01_user_id, staff_01_level_sort,
      staff_02_user_id, staff_02_level_sort,
      staff_03_user_id, staff_03_level_sort,
      empty_idx, candidate_idx, lowest_sort, decision, status, message
    ) values (
      p_shift_id, p_user_id, p_accompany, v_required,
      v_u1, v_level_sorts[1],
      v_u2, v_level_sorts[2],
      v_u3, v_level_sorts[3],
      v_empty_idx, v_candidate_idx, v_lowest_sort, v_decision, v_status, v_message
    );

    return jsonb_build_object('status','error','message',v_message);

  else
    -- accompany=false（ずらし不要）: attend_flg 変更なし
    if v_candidate_idx > 0 then
      if v_candidate_idx = 1 then
        update public.shift
           set staff_01_user_id   = p_user_id,
               staff_01_role_code = coalesce(v_new_role, staff_01_role_code),
               update_at          = now()
         where shift_id = p_shift_id;
      elsif v_candidate_idx = 2 then
        update public.shift
           set staff_02_user_id   = p_user_id,
               staff_02_role_code = coalesce(v_new_role, staff_02_role_code),
               update_at          = now()
         where shift_id = p_shift_id;
      else
        update public.shift
           set staff_03_user_id   = p_user_id,
               staff_03_role_code = coalesce(v_new_role, staff_03_role_code),
               update_at          = now()
         where shift_id = p_shift_id;
      end if;

      v_status   := 'replaced';
      v_decision := format('accompany=false replace->%s (no demote)', v_slot_names[v_candidate_idx]);

      insert into public.shift_assign_log(
        shift_id, requested_user_id, accompany, required_staff_count,
        staff_01_user_id, staff_01_level_sort,
        staff_02_user_id, staff_02_level_sort,
        staff_03_user_id, staff_03_level_sort,
        empty_idx, candidate_idx, lowest_sort, decision, status, message
      ) values (
        p_shift_id, p_user_id, p_accompany, v_required,
        v_u1, v_level_sorts[1],
        v_u2, v_level_sorts[2],
        v_u3, v_level_sorts[3],
        v_empty_idx, v_candidate_idx, v_lowest_sort, v_decision, v_status, null
      );

      return jsonb_build_object('status','replaced','slot',v_slot_names[v_candidate_idx]);

    elsif v_empty_idx > 0 then
      if v_empty_idx = 1 then
        update public.shift
           set staff_01_user_id   = p_user_id,
               staff_01_role_code = coalesce(v_new_role, staff_01_role_code),
               update_at          = now()
         where shift_id = p_shift_id;
      elsif v_empty_idx = 2 then
        update public.shift
           set staff_02_user_id   = p_user_id,
               staff_02_role_code = coalesce(v_new_role, staff_02_role_code),
               update_at          = now()
         where shift_id = p_shift_id;
      else
        update public.shift
           set staff_03_user_id   = p_user_id,
               staff_03_role_code = coalesce(v_new_role, staff_03_role_code),
               update_at          = now()
         where shift_id = p_shift_id;
      end if;

      v_status   := 'assigned';
      v_decision := format('accompany=false empty->%s', v_slot_names[v_empty_idx]);

      insert into public.shift_assign_log(
        shift_id, requested_user_id, accompany, required_staff_count,
        staff_01_user_id, staff_01_level_sort,
        staff_02_user_id, staff_02_level_sort,
        staff_03_user_id, staff_03_level_sort,
        empty_idx, candidate_idx, lowest_sort, decision, status, message
      ) values (
        p_shift_id, p_user_id, p_accompany, v_required,
        v_u1, v_level_sorts[1],
        v_u2, v_level_sorts[2],
        v_u3, v_level_sorts[3],
        v_empty_idx, 0, null, v_decision, v_status, null
      );

      return jsonb_build_object('status','assigned','slot',v_slot_names[v_empty_idx]);

    else
      v_status   := 'error';
      v_decision := 'accompany=false no_empty no_candidate';
      v_message  := '交代できる人が見つけられないため、希望シフトを登録できませんでした。マネジャーに問い合わせください';

      insert into public.shift_assign_log(
        shift_id, requested_user_id, accompany, required_staff_count,
        staff_01_user_id, staff_01_level_sort,
        staff_02_user_id, staff_02_level_sort,
        staff_03_user_id, staff_03_level_sort,
        empty_idx, candidate_idx, lowest_sort, decision, status, message
      ) values (
        p_shift_id, p_user_id, p_accompany, v_required,
        v_u1, v_level_sorts[1],
        v_u2, v_level_sorts[2],
        v_u3, v_level_sorts[3],
        v_empty_idx, v_candidate_idx, v_lowest_sort, v_decision, v_status, v_message
      );

      return jsonb_build_object('status','error','message',v_message);
    end if;
  end if;
end;
$fn$;

    */

    const { data: assignRes, error: assignErr } = await supabaseAdmin.rpc(
      'assign_user_to_shift_v2',
      {
        p_shift_id: Number(shift_id),
        p_user_id: String(requested_by_user_id),
        p_role_code: role_code,      // '01' | '02' | '-999' | null を想定（それ以外は無視される）
        p_accompany: !!accompany,    // true=同行希望あり（ずらし＋attend_flg制御）
      }
    );

    if (assignErr) {
      apiLogError = `RPC Error: ${assignErr.message}`;
      stages.push({ t: now(), stage: 'rpc_error', error: assignErr.message, traceId });
      console.error('[AFTER-RPA]', traceId, 'rpc_error', assignErr.message);
      return NextResponse.json({ error: '割当処理に失敗しました', stages, traceId }, { status: 500 });
    }

    const assign: AssignResult = (assignRes as AssignResult | null) ?? { status: 'error' };
    stages.push({ t: now(), stage: 'rpc_done', assign, traceId });
    console.log('[AFTER-RPA]', traceId, 'rpc_done', assign);

    if (assign.status === 'error') {
      const msg =
        assign.message ||
        '交代できる人が見つけられないため、希望シフトを登録できませんでした。マネジャーに問い合わせください';
      apiLogError = msg;
      console.warn('[AFTER-RPA]', traceId, 'replace_not_possible', msg);
      return NextResponse.json({ ok: false, assign, stages, error: msg, traceId }, { status: 409 });
    }

    stages.push({ t: now(), stage: 'done', traceId });
    console.log('[AFTER-RPA]', traceId, 'done');
    return NextResponse.json({ ok: true, assign, stages, traceId });

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : typeof e === 'string' ? e : JSON.stringify(e);
    apiLogError = msg;
    stages.push({ t: now(), stage: 'exception', error: msg, traceId });
    console.error('[AFTER-RPA]', traceId, 'exception', msg);
    return NextResponse.json({ error: 'サーバーエラーが発生しました', stages, traceId }, { status: 500 });

  } finally {
    // ★毎回 API ログをDBへ（“来たかどうか”の足跡）
    try {
      await supabaseAdmin.from('api_shift_coord_log').insert({
        path: '/api/shift-assign-after-rpa',
        requester_auth_id: req.headers.get('x-client-info') ?? null,
        requested_by_user_id: requestedByForLog,
        shift_id: shiftIdForLog,
        accompany: accompanyForLog,
        stages,
        error: apiLogError,
        trace_id: traceId,
      });
      console.log('[AFTER-RPA]', traceId, 'api log saved');
    } catch (logErr) {
      const m = logErr instanceof Error ? logErr.message : JSON.stringify(logErr);
      console.error('[AFTER-RPA]', traceId, 'api log save failed', m);
    }
  }
}
