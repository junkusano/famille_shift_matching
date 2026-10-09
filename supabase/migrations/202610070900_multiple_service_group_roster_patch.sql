-- 複数サービスをシフト表上で1枚のカードとして移動・担当変更する。
-- 既存テーブル/Viewの構造は変更せず、既存の監査付き単一シフト更新RPCを
-- 1トランザクション内で構成シフトすべてへ適用する。

create or replace function public.roster_patch_multiple_service_group_v1(
  p_group_id text,
  p_shift_ids bigint[],
  p_date date,
  p_mode text,
  p_delta_minutes integer,
  p_last_end time without time zone,
  p_target_col text,
  p_source_staff_id text,
  p_staff_id text,
  p_actor_user_id text,
  p_request_path text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  member record;
  member_count integer;
  last_shift_id bigint;
  next_start time without time zone;
  next_end time without time zone;
begin
  if p_group_id is null or p_group_id not like 'ms:%' then
    raise exception '複数サービス識別子が不正です';
  end if;
  if coalesce(array_length(p_shift_ids, 1), 0) < 2 then
    raise exception '複数サービスは2件以上のシフトが必要です';
  end if;
  if p_mode not in ('move', 'resizeEnd') then
    raise exception '変更方法が不正です';
  end if;
  if p_target_col not in ('staff_01_user_id', 'staff_02_user_id', 'staff_03_user_id') then
    raise exception '担当者欄が不正です';
  end if;
  if p_staff_id is null or btrim(p_staff_id) = '' or p_actor_user_id is null then
    raise exception '担当者または操作担当者が不明です';
  end if;

  -- 構成確認から一括更新完了まで、対象シフトを同一トランザクションで固定する。
  perform 1
    from public.shift
   where shift_id = any(p_shift_ids)
   order by shift_id
   for update;

  select count(*)
    into member_count
    from public.shift
   where shift_id = any(p_shift_ids)
     and head_shift_id = p_group_id
     and shift_start_date = p_date;

  if member_count <> array_length(p_shift_ids, 1) then
    raise exception '複数サービスの構成が更新されています。画面を再読込してください';
  end if;

  if exists (
    select 1
      from public.shift
     where shift_id = any(p_shift_ids)
       and case p_target_col
         when 'staff_01_user_id' then staff_01_user_id
         when 'staff_02_user_id' then staff_02_user_id
         else staff_03_user_id
       end is distinct from p_source_staff_id
  ) then
    raise exception '担当者構成が更新されています。画面を再読込してください';
  end if;

  if p_mode = 'move' then
    if p_delta_minutes is null or abs(p_delta_minutes) > 1430 then
      raise exception '移動時間が不正です';
    end if;
    if exists (
      select 1
        from public.shift
       where shift_id = any(p_shift_ids)
         and (
           extract(epoch from shift_start_time) / 60 + p_delta_minutes < 0
           or extract(epoch from shift_end_time) / 60 + p_delta_minutes > 1440
         )
    ) then
      raise exception '日付をまたぐ位置へは移動できません';
    end if;
  else
    select shift_id
      into last_shift_id
      from public.shift
     where shift_id = any(p_shift_ids)
     order by shift_end_time desc, shift_start_time desc, shift_id desc
     limit 1;

    if p_last_end is null or exists (
      select 1
        from public.shift
       where shift_id = last_shift_id
         and p_last_end <= shift_start_time
    ) then
      raise exception '終了時刻が不正です';
    end if;
  end if;

  for member in
    select shift_id, shift_start_time, shift_end_time
      from public.shift
     where shift_id = any(p_shift_ids)
     order by shift_start_time, shift_id
     for update
  loop
    if p_mode = 'move' then
      next_start := member.shift_start_time + make_interval(mins => p_delta_minutes);
      next_end := member.shift_end_time + make_interval(mins => p_delta_minutes);
    else
      next_start := member.shift_start_time;
      next_end := case when member.shift_id = last_shift_id then p_last_end else member.shift_end_time end;
    end if;

    perform public.roster_patch_shift_with_context(
      member.shift_id,
      p_date,
      next_start,
      next_end,
      localtimestamp,
      p_target_col,
      p_staff_id,
      p_actor_user_id,
      p_request_path
    );
  end loop;

  return jsonb_build_object(
    'ok', true,
    'count', member_count,
    'group_id', p_group_id
  );
end
$function$;

revoke all on function public.roster_patch_multiple_service_group_v1(
  text, bigint[], date, text, integer, time without time zone,
  text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.roster_patch_multiple_service_group_v1(
  text, bigint[], date, text, integer, time without time zone,
  text, text, text, text, text
) to service_role;

notify pgrst, 'reload schema';
