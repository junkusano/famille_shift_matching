-- Dashboard: サービス時間 × 介護福祉士・実務者研修修了者比率
--
-- 集計の母データは既存のチーム別サービス時間実績と同じ
-- shift_shift_record_view と、参加スタッフ（staff_01 / attend_flg が true の staff_02, 03）である。
-- この view は削除済みシフトを除いた既存のシフト記録 view を起点にする。

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
      -- 既存のチーム別集計と同じテスト利用者除外。
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
      join qualification_master qm
        on qm.label = attachment.value ->> 'label'
      where fe.auth_uid = cs.auth_uid
        and attachment.value ->> 'type' in ('資格証明書', 'certificate', 'certification')
        -- acquired_at は資格証明書の取得・交付日として portal で扱っている日付。
        and nullif(attachment.value ->> 'acquired_at', '') is not null
        and (attachment.value ->> 'acquired_at')::timestamptz::date <= cs.service_date
    )
  from classified_staff cs
  where cs.service_category is not null
    and cs.hours > 0;
$$;

create or replace view public.dashboard_service_time_qualification_breakdown_view as
with category_totals as (
  select
    year_month,
    service_category,
    sum(total_hours) as total_service_hours,
    sum(total_hours) filter (where qualified) as qualified_service_hours,
    case service_category
      when '障害福祉（家事・身体・通院等介助）' then 1
      when '行動援護' then 2
      when '同行援護' then 3
      when '重度訪問' then 4
      when '移動支援' then 5
      when '訪問介護（要介護）' then 6
      when '訪問介護（要支援）' then 7
      when '自費' then 8
    end as category_order
  from public.dashboard_service_time_qualification_staff_rows()
  group by year_month, service_category
), rows_with_total as (
  select * from category_totals
  union all
  select
    year_month,
    '合計',
    sum(total_service_hours),
    sum(qualified_service_hours),
    9
  from category_totals
  group by year_month
)
select
  year_month,
  service_category,
  round(total_service_hours, 2) as total_service_hours,
  round(qualified_service_hours, 2) as qualified_service_hours,
  round(100 * qualified_service_hours / nullif(total_service_hours, 0), 1) as qualified_ratio,
  case
    when 100 * qualified_service_hours / nullif(total_service_hours, 0) >= 50 then '基準クリア'
    else '要確認'
  end as threshold_status,
  category_order
from rows_with_total;

create or replace view public.dashboard_service_time_qualification_monthly_view as
select
  year_month,
  round(sum(total_service_hours), 2) as total_service_hours,
  round(sum(qualified_service_hours), 2) as qualified_service_hours,
  round(100 * sum(qualified_service_hours) / nullif(sum(total_service_hours), 0), 1) as qualified_ratio,
  case
    when 100 * sum(qualified_service_hours) / nullif(sum(total_service_hours), 0) >= 50
      then '基準クリア'
    else '要確認'
  end as threshold_status
from public.dashboard_service_time_qualification_breakdown_view
where category_order = 9
group by year_month;

comment on function public.dashboard_service_time_qualification_staff_rows() is
  '既存のチーム別サービス時間と同じシフト・参加者定義で、資格取得日をサービス日と比較するスタッフ別母データ。';
