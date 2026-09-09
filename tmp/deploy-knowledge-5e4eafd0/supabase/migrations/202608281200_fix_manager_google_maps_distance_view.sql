-- manager/adminだけを対象にし、距離未取得の対象者も0kmで表示する。
create or replace view public.manager_monthly_google_maps_distance_view as
with months as (
  select date_trunc('month', current_date - (n || ' months')::interval)::date as target_month
  from generate_series(-3, 12) as series(n)
), managers as (
  select
    u.user_id,
    coalesce(nullif(concat_ws(' ', fe.last_name_kanji, fe.first_name_kanji), ''), u.user_id) as staff_name
  from public.users u
  left join public.form_entries fe on fe.id = u.entry_id
  where lower(coalesce(u.system_role, '')) in ('manager', 'admin', 'system_admin', 'super_admin')
)
select
  m.target_month,
  mgr.user_id,
  mgr.staff_name,
  count(distinct s.segment_date)::integer as work_day_count,
  count(s.id)::integer as movement_segment_count,
  round((coalesce(sum(s.distance_meters), 0)::numeric / 1000), 1) as monthly_distance_index,
  max(s.calculated_at) as last_updated_at
from managers mgr
cross join months m
left join public.manager_distance_segments s
  on s.staff_user_id = mgr.user_id
  and date_trunc('month', s.segment_date)::date = m.target_month
  and s.status = 'success'
  and s.distance_meters is not null
group by m.target_month, mgr.user_id, mgr.staff_name;

grant select on public.manager_monthly_google_maps_distance_view to authenticated;
