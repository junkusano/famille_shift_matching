-- Future-shift reassignment for departed staff.  This function is deliberately
-- callable only by the server-side service role; it re-checks the acting user.
-- The weekly-template counters extend the result row introduced by the first
-- version of this migration. PostgreSQL requires dropping the old signature
-- before an OUT-parameter row type can change.
drop function if exists public.batch_reassign_departed_staff_shifts(uuid, timestamp without time zone, text, text);

create or replace function public.batch_reassign_departed_staff_shifts(
  p_actor_auth_id uuid,
  p_start_at timestamp without time zone,
  p_from_user_id text,
  p_to_user_id text
)
returns table(
  processed_count integer,
  updated_count integer,
  deleted_count integer,
  failed_count integer,
  weekly_processed_count integer,
  weekly_updated_count integer,
  weekly_deleted_count integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_shift public.shift%rowtype;
  v_template public.shift_weekly_template%rowtype;
  v_entries jsonb;
  v_next jsonb;
  v_entry jsonb;
  v_user_id text;
  v_seen text[] := array[]::text[];
  v_target_exists boolean;
  v_count integer;
  v_updated integer := 0;
  v_deleted integer := 0;
  v_processed integer := 0;
  v_weekly_processed integer := 0;
  v_weekly_updated integer := 0;
  v_weekly_deleted integer := 0;
begin
  if p_start_at is null or nullif(btrim(p_from_user_id), '') is null or nullif(btrim(p_to_user_id), '') is null then
    raise exception '開始日時、変更元スタッフ、変更先スタッフは必須です';
  end if;
  if btrim(p_from_user_id) = btrim(p_to_user_id) then
    raise exception '変更元スタッフと変更先スタッフは異なるスタッフを指定してください';
  end if;
  if not exists (
    select 1 from public.users u
    where u.auth_user_id::text = p_actor_auth_id::text
      and lower(coalesce(u.system_role, '')) in ('manager', 'admin')
  ) then
    raise exception 'この操作を実行する権限がありません';
  end if;

  for v_shift in
    select s.*
    from public.shift s
    where (s.shift_start_date::date + coalesce(s.shift_start_time::time, time '00:00')) >= p_start_at
      and btrim(p_from_user_id) in (
        nullif(btrim(s.staff_01_user_id), ''), nullif(btrim(s.staff_02_user_id), ''), nullif(btrim(s.staff_03_user_id), '')
      )
    for update
  loop
    v_processed := v_processed + 1;
    v_entries := jsonb_build_array(
      jsonb_build_object('user_id', nullif(btrim(v_shift.staff_01_user_id), ''), 'role_code', v_shift.staff_01_role_code, 'attend_flg', false),
      jsonb_build_object('user_id', nullif(btrim(v_shift.staff_02_user_id), ''), 'role_code', v_shift.staff_02_role_code, 'attend_flg', coalesce(v_shift.staff_02_attend_flg, false)),
      jsonb_build_object('user_id', nullif(btrim(v_shift.staff_03_user_id), ''), 'role_code', v_shift.staff_03_role_code, 'attend_flg', coalesce(v_shift.staff_03_attend_flg, false))
    );
    v_target_exists := exists (
      select 1 from jsonb_array_elements(v_entries) e
      where e->>'user_id' = btrim(p_to_user_id)
    );
    v_next := '[]'::jsonb;
    v_seen := array[]::text[];
    for v_entry in select value from jsonb_array_elements(v_entries)
    loop
      v_user_id := v_entry->>'user_id';
      if v_user_id is null then
        continue;
      end if;
      -- A replacement that would duplicate an existing assignee removes the
      -- departing slot.  All remaining entries are then compacted in order.
      if v_user_id = btrim(p_from_user_id) then
        if v_target_exists then
          continue;
        end if;
        v_entry := jsonb_set(v_entry, '{user_id}', to_jsonb(btrim(p_to_user_id)));
        v_user_id := btrim(p_to_user_id);
      end if;
      if v_user_id = any(v_seen) then
        continue;
      end if;
      v_seen := array_append(v_seen, v_user_id);
      v_next := v_next || jsonb_build_array(v_entry);
    end loop;
    v_count := jsonb_array_length(v_next);
    if v_count = 0 then
      delete from public.shift where shift_id = v_shift.shift_id;
      v_deleted := v_deleted + 1;
    else
      update public.shift s set
        staff_01_user_id = v_next->0->>'user_id',
        staff_01_role_code = v_next->0->>'role_code',
        staff_02_user_id = case when v_count >= 2 then v_next->1->>'user_id' else null end,
        staff_02_role_code = case when v_count >= 2 then v_next->1->>'role_code' else null end,
        staff_02_attend_flg = case when v_count >= 2 then coalesce((v_next->1->>'attend_flg')::boolean, false) else false end,
        staff_03_user_id = case when v_count >= 3 then v_next->2->>'user_id' else null end,
        staff_03_role_code = case when v_count >= 3 then v_next->2->>'role_code' else null end,
        staff_03_attend_flg = case when v_count >= 3 then coalesce((v_next->2->>'attend_flg')::boolean, false) else false end,
        update_at = now()
      where s.shift_id = v_shift.shift_id;
      v_updated := v_updated + 1;
    end if;
  end loop;

  -- Weekly templates create future shifts.  Only active templates which can
  -- still produce a shift on/after the start date are changed in this same
  -- transaction; an expired or inactive template remains historical data.
  for v_template in
    select t.*
    from public.shift_weekly_template t
    where t.active
      and (t.effective_to is null or t.effective_to::date >= p_start_at::date)
      and btrim(p_from_user_id) in (
        nullif(btrim(t.staff_01_user_id), ''), nullif(btrim(t.staff_02_user_id), ''), nullif(btrim(t.staff_03_user_id), '')
      )
    for update
  loop
    v_weekly_processed := v_weekly_processed + 1;
    v_entries := jsonb_build_array(
      jsonb_build_object('user_id', nullif(btrim(v_template.staff_01_user_id), ''), 'role_code', v_template.staff_01_role_code, 'attend_flg', false),
      jsonb_build_object('user_id', nullif(btrim(v_template.staff_02_user_id), ''), 'role_code', v_template.staff_02_role_code, 'attend_flg', coalesce(v_template.staff_02_attend_flg, false)),
      jsonb_build_object('user_id', nullif(btrim(v_template.staff_03_user_id), ''), 'role_code', v_template.staff_03_role_code, 'attend_flg', coalesce(v_template.staff_03_attend_flg, false))
    );
    v_target_exists := exists (select 1 from jsonb_array_elements(v_entries) e where e->>'user_id' = btrim(p_to_user_id));
    v_next := '[]'::jsonb;
    v_seen := array[]::text[];
    for v_entry in select value from jsonb_array_elements(v_entries)
    loop
      v_user_id := v_entry->>'user_id';
      if v_user_id is null then continue; end if;
      if v_user_id = btrim(p_from_user_id) then
        if v_target_exists then continue; end if;
        v_entry := jsonb_set(v_entry, '{user_id}', to_jsonb(btrim(p_to_user_id)));
        v_user_id := btrim(p_to_user_id);
      end if;
      if v_user_id = any(v_seen) then continue; end if;
      v_seen := array_append(v_seen, v_user_id);
      v_next := v_next || jsonb_build_array(v_entry);
    end loop;
    v_count := jsonb_array_length(v_next);
    if v_count = 0 then
      delete from public.shift_weekly_template where template_id = v_template.template_id;
      v_weekly_deleted := v_weekly_deleted + 1;
    else
      update public.shift_weekly_template t set
        staff_01_user_id = v_next->0->>'user_id',
        staff_01_role_code = v_next->0->>'role_code',
        staff_02_user_id = case when v_count >= 2 then v_next->1->>'user_id' else null end,
        staff_02_role_code = case when v_count >= 2 then v_next->1->>'role_code' else null end,
        staff_02_attend_flg = case when v_count >= 2 then coalesce((v_next->1->>'attend_flg')::boolean, false) else false end,
        staff_03_user_id = case when v_count >= 3 then v_next->2->>'user_id' else null end,
        staff_03_role_code = case when v_count >= 3 then v_next->2->>'role_code' else null end,
        staff_03_attend_flg = case when v_count >= 3 then coalesce((v_next->2->>'attend_flg')::boolean, false) else false end
      where t.template_id = v_template.template_id;
      v_weekly_updated := v_weekly_updated + 1;
    end if;
  end loop;
  return query select v_processed, v_updated, v_deleted, 0, v_weekly_processed, v_weekly_updated, v_weekly_deleted;
end;
$$;

revoke all on function public.batch_reassign_departed_staff_shifts(uuid, timestamp without time zone, text, text) from public, anon, authenticated;
grant execute on function public.batch_reassign_departed_staff_shifts(uuid, timestamp without time zone, text, text) to service_role;
