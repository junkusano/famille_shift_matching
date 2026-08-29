-- イベントテンプレートで指定した未完了タスクを、既存の日次シフトViewへ一括集約する。
-- アプリ側の追加API・追加クエリは作らず、1シフト1行の粒度を維持する。

alter table public.event_template
  add column if not exists shift_alert boolean not null default false;

create index if not exists idx_event_tasks_shift_alert_lookup
  on public.event_tasks (kaipoke_cs_id, due_date, template_id)
  where status in ('open', 'in_progress');

create or replace view public.shift_daily_dialog_view as
with required_actual_months as materialized (
  select
    history.kaipoke_cs_id,
    to_char(history.shift_start_date, 'YYYY-MM') as year_month,
    history_service.kaipoke_servicek
  from public.shift history
  join public.shift_service_code history_service
    on history.service_code = history_service.service_code
  where history_service.kaipoke_servicek in ('障害', '移動支援')
    and history.shift_start_date >= date '2025-11-01'
    and history.shift_start_date < (
      date_trunc('month', current_timestamp at time zone 'Asia/Tokyo')
      - case
          when extract(day from current_timestamp at time zone 'Asia/Tokyo') <= 10
            then interval '2 months'
          else interval '1 month'
        end
      + interval '1 month'
    )::date
  group by
    history.kaipoke_cs_id,
    to_char(history.shift_start_date, 'YYYY-MM'),
    history_service.kaipoke_servicek
),
unsubmitted_actual as (
  select
    required.kaipoke_cs_id,
    array_agg(
      distinct required.year_month
      order by required.year_month
    ) as months
  from required_actual_months required
  left join public.disability_check actual_check
    on actual_check.kaipoke_cs_id = required.kaipoke_cs_id
   and actual_check.year_month = required.year_month
   and actual_check.kaipoke_servicek = required.kaipoke_servicek
  where coalesce(actual_check.application_check, false) = false
  group by required.kaipoke_cs_id
),
active_event_alert_tasks as (
  select
    task.id,
    task.template_id,
    template.template_name as event_name,
    task.memo,
    task.user_id,
    task.kaipoke_cs_id,
    task.due_date,
    task.created_at
  from public.event_tasks task
  join public.event_template template
    on template.id = task.template_id
   and template.shift_alert = true
  where task.status in ('open', 'in_progress')
),
base as (
  select
    s.shift_id,
    s.shift_start_date as shift_date,
    s.shift_start_time::text as start_at,
    s.shift_end_time::text as end_at,
    s.kaipoke_cs_id,
    k.name as client_name,
    k.postal_code,
    k.address,
    k.biko as cs_note,
    k.gender_request,
    g.gender_request_name,
    g.male_flg,
    g.female_flg,
    s.service_code,
    sc.kaipoke_servicecode as service_name,
    s.staff_01_user_id as staff_id_1,
    s.staff_02_user_id as staff_id_2,
    s.staff_03_user_id as staff_id_3,
    s.staff_02_attend_flg,
    s.staff_03_attend_flg,
    s.required_staff_count,
    s.two_person_work_flg,
    s.judo_ido,
    d.dsp_short,
    'https://www.google.com/maps/search/'::text
      || coalesce(k.address, k.postal_code, ''::text) as map_url,
    coalesce(
      s.shift_end_time is not null
      and (current_timestamp at time zone 'Asia/Tokyo') > (
        coalesce(
          s.shift_end_date,
          case
            when s.shift_end_time < s.shift_start_time
              then s.shift_start_date + 1
            else s.shift_start_date
          end
        )::timestamp + s.shift_end_time
      )
      and lower(trim(coalesce(sr.status, ''))) not in ('submitted', 'approved'),
      false
    ) as roster_error_visit_record,
    coalesce(cardinality(actual.months), 0) > 0 as roster_error_actual_record,
    coalesce(actual.months, array[]::text[]) as roster_error_actual_record_months,
    coalesce(
      k.service_kind in ('要介護', '要支援', '障害')
      and coalesce(trim(k.care_consultant::text), '') = '',
      false
    ) as roster_error_care_consultant,
    coalesce(
      sc.idou_f = true
      and (
        coalesce(trim(k.standard_route), '') = ''
        or coalesce(trim(k.standard_trans_ways), '') = ''
        or coalesce(trim(k.standard_purpose), '') = ''
      ),
      false
    ) as roster_error_transport_info,
    coalesce(
      s.service_code = '行動援護'
      and coalesce(trim(k.kodoengo_plan_link), '') = '',
      false
    ) as roster_error_kodoengo_plan
  from public.shift s
  left join public.cs_kaipoke_info k
    on s.kaipoke_cs_id = k.kaipoke_cs_id
  left join public.cs_gender_request g
    on k.gender_request = g.gender_request_id
  left join public.postal_district d
    on left(k.postal_code, 3) = d.postal_code_3
  left join public.shift_service_code sc
    on s.service_code = sc.service_code
  left join public.shift_records sr
    on s.shift_id = sr.shift_id
  left join unsubmitted_actual actual
    on s.kaipoke_cs_id = actual.kaipoke_cs_id
)
select
  base.*,
  (
    base.roster_error_visit_record
    or base.roster_error_actual_record
    or base.roster_error_care_consultant
    or base.roster_error_transport_info
    or base.roster_error_kodoengo_plan
  ) as has_roster_error,
  coalesce(event_alert.alerts, '[]'::jsonb) as shift_event_alerts
from base
left join lateral (
  select jsonb_agg(
    jsonb_build_object(
      'id', task.id,
      'template_id', task.template_id,
      'event_name', task.event_name,
      'memo', task.memo,
      'user_id', task.user_id,
      'kaipoke_cs_id', task.kaipoke_cs_id,
      'due_date', task.due_date
    )
    order by task.due_date, task.event_name, task.created_at, task.id
  ) as alerts
  from active_event_alert_tasks task
  where task.kaipoke_cs_id = base.kaipoke_cs_id
    and task.due_date <= base.shift_date
) event_alert on true;

comment on column public.event_template.shift_alert is
  'trueの場合、未完了のevent_tasksを対象利用者の期日以降のシフト警告として表示する。';
comment on column public.shift_daily_dialog_view.shift_event_alerts is
  '対象利用者が一致し、期日以降でopen/in_progressのシフトアラート対象イベント。';

notify pgrst, 'reload schema';
