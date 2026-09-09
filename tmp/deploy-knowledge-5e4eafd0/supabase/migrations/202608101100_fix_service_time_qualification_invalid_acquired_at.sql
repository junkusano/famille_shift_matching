-- attachments.acquired_at には手入力由来の不正な日付が混在しているため、
-- 不正値でダッシュボード全体が失敗しないよう資格判定を安全化する。

create or replace function public.dashboard_service_time_qualification_staff_rows()
returns table (
  year_month text,
  service_date date,
  service_category text,
  total_hours numeric,
  staff_user_id text,
  qualified boolean
)
language sql
stable
as $$
  with qualification_master as (
    select label
    from public.user_doc_master
    where category = 'certificate'
      and is_active = true
      and label in ('介護福祉士', '実務者研修修了')
  ), participating_staff as (
    select
      s.shift_start_date::date as service_date,
      s.service_code,
      participant.staff_user_id,
      case
        when (coalesce(s.shift_end_date, s.shift_start_date)::date + s.shift_end_time::time)
             <= (s.shift_start_date::date + s.shift_start_time::time)
          then extract(epoch from (
            (coalesce(s.shift_end_date, s.shift_start_date)::date + s.shift_end_time::time + interval '1 day')
            - (s.shift_start_date::date + s.shift_start_time::time)
          )) / 3600
        else extract(epoch from (
          (coalesce(s.shift_end_date, s.shift_start_date)::date + s.shift_end_time::time)
          - (s.shift_start_date::date + s.shift_start_time::time)
        )) / 3600
      end::numeric as hours
    from public.shift_shift_record_view s
    cross join lateral (
      values
        (s.staff_01_user_id, true),
        (s.staff_02_user_id, coalesce(s.staff_02_attend_flg, false)),
        (s.staff_03_user_id, coalesce(s.staff_03_attend_flg, false))
    ) as participant(staff_user_id, is_participating)
    where s.shift_start_date >= date '2025-11-01'
      and coalesce(s.kaipoke_cs_id, '') not in (
        '999999999', '9999999998', '9999999996', '9999999994', '9999999980'
      )
      and participant.is_participating
      and participant.staff_user_id is not null
      and s.shift_start_time is not null
      and s.shift_end_time is not null
  ), classified_staff as (
    select
      ps.*,
      u.auth_uid,
      case
        when sc.plan_service_category in ('居宅家事', '居宅身体', '通院等介助')
          then '障害福祉（家事・身体・通院等介助）'
        when sc.plan_service_category = '行動援護' then '行動援護'
        when sc.plan_service_category = '同行援護' then '同行援護'
        when sc.plan_service_category = '重度訪問' then '重度訪問'
        when sc.plan_service_category = '移動支援' then '移動支援'
        when sc.kaipoke_servicek = '要介護' then '訪問介護（要介護）'
        when sc.kaipoke_servicek = '要支援' then '訪問介護（要支援）'
        when sc.kaipoke_servicek = '自費' then '自費'
      end as service_category
    from participating_staff ps
    join public.user_entry_united_view_single u
      on u.user_id = ps.staff_user_id
     and u.org_unit_id is not null
    join public.shift_service_code sc
      on sc.service_code = ps.service_code
  )
  select
    to_char(cs.service_date, 'YYYY-MM'),
    cs.service_date,
    cs.service_category,
    cs.hours,
    cs.staff_user_id,
    exists (
      select 1
      from public.form_entries fe
      cross join lateral jsonb_array_elements(coalesce(fe.attachments, '[]'::jsonb)) attachment(value)
      cross join lateral (
        select case
          when nullif(attachment.value ->> 'acquired_at', '') ~ '^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])'
            then to_date(left(attachment.value ->> 'acquired_at', 10), 'YYYY-MM-DD')
        end as acquired_date
      ) acquired
      join qualification_master qm
        on qm.label = attachment.value ->> 'label'
      where fe.auth_uid = cs.auth_uid
        and attachment.value ->> 'type' in ('資格証明書', 'certificate', 'certification')
        and acquired.acquired_date is not null
        and to_char(acquired.acquired_date, 'YYYY-MM-DD') = left(attachment.value ->> 'acquired_at', 10)
        and acquired.acquired_date <= cs.service_date
    )
  from classified_staff cs
  where cs.service_category is not null
    and cs.hours > 0;
$$;
