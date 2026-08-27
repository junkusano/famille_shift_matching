-- Align the staff-level dashboard with the exact source used by
-- snapshot_biz_stats_shift_sum (the team service-hours dashboard).

create or replace view public.dashboard_staff_monthly_service_hours_view as
with participating_staff as (
  select
    to_char(date_trunc('month', s.shift_start_date::timestamptz), 'YYYY-MM') as year_month,
    participant.staff_user_id,
    extract(epoch from upper(s.shift_timerange) - lower(s.shift_timerange)) / 3600.0 as service_hours
  from public.shift s
  cross join lateral (
    values
      (s.staff_01_user_id, true),
      (s.staff_02_user_id, not coalesce(s.staff_02_attend_flg, false)),
      (s.staff_03_user_id, not coalesce(s.staff_03_attend_flg, false))
  ) as participant(staff_user_id, is_service_staff)
  where s.shift_start_date >= date '2025-11-01'
    and s.shift_start_time is not null
    and s.shift_end_time is not null
    and s.kaipoke_cs_id not like '99999999%'
    and (s.service_code is null or s.service_code not ilike '%キャンセル%')
    and participant.is_service_staff
    and nullif(participant.staff_user_id, '') is not null
), staff_hours as (
  select
    year_month,
    staff_user_id,
    round(sum(service_hours)::numeric, 2) as total_service_hours
  from participating_staff
  group by year_month, staff_user_id
)
select
  staff_hours.year_month,
  staff_hours.staff_user_id,
  coalesce(
    nullif(concat_ws('', staff.last_name_kanji, staff.first_name_kanji), ''),
    staff_hours.staff_user_id
  ) as staff_name,
  case
    when coalesce(nullif(users.role, ''), users.system_role) in ('admin', 'manager')
      then 'マネジャー'
    else 'スタッフ'
  end as manager_category,
  staff_hours.total_service_hours
from staff_hours
left join public.user_entry_united_view_single staff
  on staff.user_id = staff_hours.staff_user_id
left join public.users users
  on users.user_id = staff_hours.staff_user_id;

alter view public.dashboard_staff_monthly_service_hours_view
  set (security_invoker = false);

comment on view public.dashboard_staff_monthly_service_hours_view is
  'チーム別サービス時間実績と同じshift・同行除外・キャンセル除外・時間計算で、スタッフID・月単位に集約する一覧。users.roleを優先し、未設定時はusers.system_roleでマネジャー・スタッフを分類する。';
