-- 日次シフト表の既存Viewへ、不備判定を追加する。
-- 既存列と1シフト1行の粒度は維持し、利用者単位の実績未提出月は先に集約する。
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
  ) as has_roster_error
from base;

comment on column public.shift_daily_dialog_view.roster_error_visit_record is
  'サービス終了後もsubmitted/approvedの訪問記録がないシフト。';
comment on column public.shift_daily_dialog_view.roster_error_actual_record is
  '締切対象となる過去月に実績記録の提出未チェックがある利用者。';
comment on column public.shift_daily_dialog_view.roster_error_actual_record_months is
  '実績記録の提出未チェック月（YYYY-MM、昇順、重複なし）。';
comment on column public.shift_daily_dialog_view.roster_error_care_consultant is
  '対象利用者のケアマネ・相談員情報が未設定。';
comment on column public.shift_daily_dialog_view.roster_error_transport_info is
  '移動系サービスで経路・手段・目的のいずれかが未設定。';
comment on column public.shift_daily_dialog_view.roster_error_kodoengo_plan is
  '行動援護でサービス計画書兼記録リンクが未設定。';
comment on column public.shift_daily_dialog_view.has_roster_error is
  '日次シフト表で可視化する不備が1件以上ある。';

notify pgrst, 'reload schema';
