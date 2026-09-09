-- `users.resign_date_latest` is empty for the existing removed staff.  `end_at`
-- must not be used because it is changed by the LineWorks synchronisation.  For
-- the historical backfill, infer a departure from the day after the person's
-- final valid service shift instead.

create or replace function public.rebuild_staff_monthly_stats(
  p_from date default date '2025-07-01',
  p_to date default date_trunc('month', timezone('Asia/Tokyo', now()))::date
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month date;
  v_count integer := 0;
begin
  if p_from > p_to then
    raise exception 'p_from must be on or before p_to';
  end if;

  for v_month in
    select generate_series(date_trunc('month', p_from)::date, date_trunc('month', p_to)::date, interval '1 month')::date
  loop
    with eligible_shift_participants as (
      select s.shift_start_date::date as shift_date, participant.staff_user_id
      from shift_shift_record_view s
      cross join lateral (values
        (s.staff_01_user_id, true),
        (s.staff_02_user_id, not coalesce(s.staff_02_attend_flg, false)),
        (s.staff_03_user_id, not coalesce(s.staff_03_attend_flg, false))
      ) participant(staff_user_id, is_service_staff)
      where s.shift_start_date < (timezone('Asia/Tokyo', now())::date + 1)
        and coalesce(s.kaipoke_cs_id, '') not like '99999999%'
        and coalesce(s.service_code, '') not like '%キャンセル%'
        and participant.is_service_staff
        and nullif(btrim(participant.staff_user_id), '') is not null
        and s.shift_start_time is not null and s.shift_end_time is not null
    ), last_valid_shift as (
      select staff_user_id, max(shift_date) as last_shift_date
      from eligible_shift_participants
      group by staff_user_id
    ), staff as (
      select distinct on (u.user_id)
        u.user_id,
        coalesce(u.entry_date_latest, fe.agreed_at, fe.created_at, u.created_at)::timestamptz as hired_at,
        lower(btrim(coalesce(u.status, ''))) as staff_status,
        case when lower(btrim(coalesce(u.status, ''))) = 'removed_from_lineworks_kaipoke'
          then coalesce(u.resign_date_latest::timestamptz, (lvs.last_shift_date + 1)::timestamptz)
        end as retired_at,
        lower(btrim(coalesce(u.system_role, u.role, ''))) as staff_role
      from users u
      left join form_entries fe on fe.id = u.entry_id
      left join last_valid_shift lvs on lvs.staff_user_id = u.user_id
      where nullif(btrim(coalesce(u.user_id, '')), '') is not null
      order by u.user_id, u.created_at desc nulls last
    ), counts as (
      select
        count(*) filter (where hired_at >= v_month and hired_at < v_month + interval '1 month')::integer as hired_count,
        count(*) filter (where retired_at >= v_month and retired_at < v_month + interval '1 month')::integer as retired_count,
        count(*) filter (where hired_at < v_month + interval '1 month' and (retired_at is null or retired_at >= v_month + interval '1 month') and not (v_month = date_trunc('month', timezone('Asia/Tokyo', now()))::date and staff_status = 'removed_from_lineworks_kaipoke'))::integer as active_count,
        count(*) filter (where hired_at < v_month + interval '1 month' and (retired_at is null or retired_at >= v_month + interval '1 month') and not (v_month = date_trunc('month', timezone('Asia/Tokyo', now()))::date and staff_status = 'removed_from_lineworks_kaipoke') and staff_role in ('manager', 'admin'))::integer as fulltime_count,
        count(*) filter (where hired_at < v_month + interval '1 month' and (retired_at is null or retired_at >= v_month + interval '1 month') and not (v_month = date_trunc('month', timezone('Asia/Tokyo', now()))::date and staff_status = 'removed_from_lineworks_kaipoke') and staff_role not in ('manager', 'admin'))::integer as other_count,
        count(*) filter (where user_id in (select staff_user_id from eligible_shift_participants where shift_date >= v_month and shift_date < (v_month + interval '1 month')::date) and hired_at < v_month + interval '1 month' and (retired_at is null or retired_at >= v_month + interval '1 month') and not (v_month = date_trunc('month', timezone('Asia/Tokyo', now()))::date and staff_status = 'removed_from_lineworks_kaipoke'))::integer as working_count
      from staff
    )
    insert into staff_monthly_stats (month, hired_count, retired_count, active_count, fulltime_count, other_count, working_count, calculated_at, updated_at)
    select v_month, hired_count, retired_count, active_count, fulltime_count, other_count, working_count, now(), now() from counts
    on conflict (month) do update set
      hired_count = excluded.hired_count, retired_count = excluded.retired_count,
      active_count = excluded.active_count, fulltime_count = excluded.fulltime_count,
      other_count = excluded.other_count, working_count = excluded.working_count,
      calculated_at = excluded.calculated_at, updated_at = excluded.updated_at;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Initial historical backfill, including the currently displayed months so that
-- the former 2026-07 inflated value is overwritten as well.
select public.rebuild_staff_monthly_stats(
  date '2025-07-01',
  date_trunc('month', timezone('Asia/Tokyo', now()))::date
);
