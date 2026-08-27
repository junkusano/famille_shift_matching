-- Dashboard: staff-level monthly service hours.
--
-- Reuse the same source rows as the existing team and service-qualification
-- dashboards. That function owns the service-duration calculation, test/client
-- exclusions, cancellation exclusions, and accompaniment exclusions.

create or replace view public.dashboard_staff_monthly_service_hours_view as
with staff_hours as (
  select
    service_rows.year_month,
    service_rows.staff_user_id,
    sum(service_rows.total_hours) as total_service_hours
  from public.dashboard_service_time_qualification_staff_rows() service_rows
  where service_rows.year_month <= to_char(current_date + interval '1 month', 'YYYY-MM')
  group by service_rows.year_month, service_rows.staff_user_id
)
select
  staff_hours.year_month,
  staff_hours.staff_user_id,
  concat_ws('', staff.last_name_kanji, staff.first_name_kanji) as staff_name,
  case
    when coalesce(nullif(users.role, ''), users.system_role) in ('admin', 'manager')
      then 'マネジャー'
    else 'スタッフ'
  end as manager_category,
  round(staff_hours.total_service_hours, 2) as total_service_hours
from staff_hours
join public.user_entry_united_view_single staff
  on staff.user_id = staff_hours.staff_user_id
left join public.users users
  on users.user_id = staff_hours.staff_user_id;

alter view public.dashboard_staff_monthly_service_hours_view
  set (security_invoker = false);

comment on view public.dashboard_staff_monthly_service_hours_view is
  '既存サービス時間母データをスタッフID・月単位で集約し、users.roleを優先して未設定時はusers.system_roleからマネジャー・スタッフ区分を表示する。';
