-- 複数サービスの合算ダイアログから、時間・担当構成を同一トランザクションで更新する。
-- 個々のサービスコードとサービス固有項目は変更しない。

create or replace function public.roster_patch_multiple_service_dialog_v1(
  p_group_id text,
  p_shift_ids bigint[],
  p_date date,
  p_group_start time without time zone,
  p_group_end time without time zone,
  p_staff_01_user_id text,
  p_staff_02_user_id text,
  p_staff_03_user_id text,
  p_staff_02_attend_flg boolean,
  p_staff_03_attend_flg boolean,
  p_required_staff_count integer,
  p_two_person_work_flg boolean,
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
  first_start time without time zone;
  last_shift_id bigint;
  move_interval interval;
  next_start time without time zone;
  next_end time without time zone;
  patch jsonb;
begin
  if p_group_id is null or p_group_id not like 'ms:%' then
    raise exception '複数サービス識別子が不正です';
  end if;
  if coalesce(array_length(p_shift_ids, 1), 0) < 2 then
    raise exception '複数サービスは2件以上のシフトが必要です';
  end if;
  if p_group_start is null or p_group_end is null or p_group_end <= p_group_start then
    raise exception '開始・終了時刻が不正です';
  end if;
  if p_staff_01_user_id is null or btrim(p_staff_01_user_id) = '' then
    raise exception 'スタッフ1は必須です';
  end if;
  if p_required_staff_count is null or p_required_staff_count not between 1 and 3 then
    raise exception '派遣人数が不正です';
  end if;
  if p_actor_user_id is null or btrim(p_actor_user_id) = '' then
    raise exception '操作担当者が不明です';
  end if;

  perform 1
    from public.shift
   where shift_id = any(p_shift_ids)
   order by shift_id
   for update;

  select count(*), min(shift_start_time)
    into member_count, first_start
    from public.shift
   where shift_id = any(p_shift_ids)
     and head_shift_id = p_group_id
     and shift_start_date = p_date;

  if member_count <> array_length(p_shift_ids, 1) then
    raise exception '複数サービスの構成が更新されています。画面を再読込してください';
  end if;

  select shift_id
    into last_shift_id
    from public.shift
   where shift_id = any(p_shift_ids)
   order by shift_end_time desc, shift_start_time desc, shift_id desc
   limit 1;

  move_interval := p_group_start - first_start;

  if exists (
    select 1
      from public.shift
     where shift_id = any(p_shift_ids)
       and (
         extract(epoch from shift_start_time) + extract(epoch from move_interval) < 0
         or extract(epoch from shift_end_time) + extract(epoch from move_interval) > 86400
       )
  ) then
    raise exception '日付をまたぐ位置へは変更できません';
  end if;

  for member in
    select shift_id, shift_start_time, shift_end_time
      from public.shift
     where shift_id = any(p_shift_ids)
     order by shift_start_time, shift_id
  loop
    next_start := member.shift_start_time + move_interval;
    next_end := case
      when member.shift_id = last_shift_id then p_group_end
      else member.shift_end_time + move_interval
    end;

    if next_end <= next_start then
      raise exception '終了時刻がサービス開始時刻以前になっています';
    end if;

    patch := jsonb_build_object(
      'shift_start_date', p_date,
      'shift_start_time', next_start,
      'shift_end_time', next_end,
      'staff_01_user_id', p_staff_01_user_id,
      'staff_02_user_id', p_staff_02_user_id,
      'staff_03_user_id', p_staff_03_user_id,
      'staff_02_attend_flg', coalesce(p_staff_02_attend_flg, false),
      'staff_03_attend_flg', coalesce(p_staff_03_attend_flg, false),
      'required_staff_count', p_required_staff_count,
      'two_person_work_flg', p_required_staff_count >= 2 or coalesce(p_two_person_work_flg, false)
    );

    perform public.shifts_update_with_context(
      p_actor_user_id,
      patch,
      p_request_path,
      member.shift_id
    );
  end loop;

  return jsonb_build_object(
    'ok', true,
    'count', member_count,
    'group_id', p_group_id
  );
end
$function$;

revoke all on function public.roster_patch_multiple_service_dialog_v1(
  text, bigint[], date, time without time zone, time without time zone,
  text, text, text, boolean, boolean, integer, boolean, text, text
) from public, anon, authenticated;
grant execute on function public.roster_patch_multiple_service_dialog_v1(
  text, bigint[], date, time without time zone, time without time zone,
  text, text, text, boolean, boolean, integer, boolean, text, text
) to service_role;

notify pgrst, 'reload schema';
