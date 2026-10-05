-- ダッシュボードのサービス時間集計条件を実際の提出書類に合わせる。
--
-- * 看護師をサ責資格者として扱う。
-- * 資格証または実務経験証明書が実際に提出されていないスタッフは母集団から除外する。
-- * 行動援護は実務経験証明書が提出されているスタッフだけを集計する。
-- * 訪問介護と訪問介護（要介護）は「訪問介護」に統合する。

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
security definer
set search_path = public
as $$
  with qualification_master as (
    select label
    from public.user_doc_master
    where category = 'certificate'
      and is_active = true
      and label in ('介護福祉士', '実務者研修修了', '看護師')
  ), submitted_documents as (
    select
      fe.auth_uid,
      bool_or(
        nullif(btrim(attachment.value ->> 'url'), '') is not null
        and attachment.value ->> 'type' in ('資格証明書', '資格証', 'certificate', 'certification')
      ) as has_certificate,
      bool_or(
        nullif(btrim(attachment.value ->> 'url'), '') is not null
        and attachment.value ->> 'label' = '行動援護'
      ) as has_action_certificate,
      bool_or(
        nullif(btrim(attachment.value ->> 'url'), '') is not null
        and (
          attachment.value ->> 'type' = '実務経験証明書'
          or coalesce(attachment.value ->> 'label', '') like '%実務経験証明書%'
        )
      ) as has_experience_certificate
    from public.form_entries fe
    cross join lateral jsonb_array_elements(coalesce(fe.attachments, '[]'::jsonb)) attachment(value)
    where fe.auth_uid is not null
    group by fe.auth_uid
  ), qualification_dates as (
    select
      fe.auth_uid,
      min(acquired.acquired_date) as qualified_from
    from public.form_entries fe
    cross join lateral jsonb_array_elements(coalesce(fe.attachments, '[]'::jsonb)) attachment(value)
    cross join lateral (
      select case
        when nullif(attachment.value ->> 'acquired_at', '')
             ~ '^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])'
          then to_date(left(attachment.value ->> 'acquired_at', 10), 'YYYY-MM-DD')
      end as acquired_date
    ) acquired
    join qualification_master qm
      on qm.label = attachment.value ->> 'label'
    where fe.auth_uid is not null
      and nullif(btrim(attachment.value ->> 'url'), '') is not null
      and attachment.value ->> 'type' in ('資格証明書', '資格証', 'certificate', 'certification')
      and acquired.acquired_date is not null
      and to_char(acquired.acquired_date, 'YYYY-MM-DD')
          = left(attachment.value ->> 'acquired_at', 10)
    group by fe.auth_uid
  ), participating_staff as (
    select
      s.shift_start_date::date as service_date,
      s.kaipoke_cs_id,
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
        (s.staff_02_user_id, not coalesce(s.staff_02_attend_flg, false)),
        (s.staff_03_user_id, not coalesce(s.staff_03_attend_flg, false))
    ) as participant(staff_user_id, is_service_staff)
    where s.shift_start_date >= date '2025-11-01'
      and coalesce(s.kaipoke_cs_id, '') not like '99999999%'
      and coalesce(s.service_code, '') not like '%キャンセル%'
      and participant.is_service_staff
      and participant.staff_user_id is not null
      and s.shift_start_time is not null
      and s.shift_end_time is not null
  ), resolved_service as (
    select
      ps.*,
      coalesce(nullif(btrim(ps.service_code), ''), fallback.service_code) as effective_service_code
    from participating_staff ps
    left join lateral (
      select s2.service_code
      from public.shift_shift_record_view s2
      join public.shift_service_code sc2
        on sc2.service_code = s2.service_code
      where nullif(btrim(ps.service_code), '') is null
        and s2.kaipoke_cs_id = ps.kaipoke_cs_id
        and nullif(btrim(s2.service_code), '') is not null
        and s2.service_code not like '%キャンセル%'
        and (
          sc2.plan_service_category in (
            '居宅家事', '居宅身体', '通院等介助', '行動援護',
            '同行援護', '重度訪問', '移動支援'
          )
          or sc2.kaipoke_servicek in ('訪問介護', '要介護', '要支援', '自費')
        )
      order by
        abs(s2.shift_start_date::date - ps.service_date),
        case when s2.shift_start_date::date <= ps.service_date then 0 else 1 end,
        s2.shift_start_date desc
      limit 1
    ) fallback on true
  ), classified_staff as (
    select
      ps.*,
      qd.qualified_from,
      coalesce(sd.has_certificate, false) as has_certificate,
      coalesce(sd.has_action_certificate, false) as has_action_certificate,
      coalesce(sd.has_experience_certificate, false) as has_experience_certificate,
      case
        when sc.plan_service_category in ('居宅家事', '居宅身体', '通院等介助')
          then '障害福祉（家事・身体・通院等介助）'
        when sc.plan_service_category = '行動援護' then '行動援護'
        when sc.plan_service_category = '同行援護' then '同行援護'
        when sc.plan_service_category = '重度訪問' then '重度訪問'
        when sc.plan_service_category = '移動支援' then '移動支援'
        when sc.kaipoke_servicek in ('訪問介護', '要介護') then '訪問介護'
        when sc.kaipoke_servicek = '要支援' then '訪問介護（要支援）'
        when sc.kaipoke_servicek = '自費' then '自費'
      end as service_category
    from resolved_service ps
    join public.user_entry_united_view_single u
      on u.user_id = ps.staff_user_id
     and u.org_unit_id is not null
    join public.shift_service_code sc
      on sc.service_code = ps.effective_service_code
    left join qualification_dates qd
      on qd.auth_uid = u.auth_uid
    left join submitted_documents sd
      on sd.auth_uid = u.auth_uid
  )
  select
    to_char(cs.service_date, 'YYYY-MM'),
    cs.service_date,
    cs.service_category,
    cs.hours,
    cs.staff_user_id,
    coalesce((
      cs.qualified_from <= cs.service_date
      and not (
        cs.service_category = '行動援護'
        and (not cs.has_action_certificate or not cs.has_experience_certificate)
      )
    ), false)
  from classified_staff cs
  where cs.service_category is not null
    and cs.hours > 0
    and (cs.has_certificate or cs.has_experience_certificate)
    and not (
      cs.service_category = '行動援護'
      and (not cs.has_action_certificate or not cs.has_experience_certificate)
    );
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
      when '訪問介護' then 6
      when '訪問介護（要支援）' then 7
      when '自費' then 8
    end as category_order
  from public.dashboard_service_time_qualification_staff_rows()
  where year_month <= to_char(current_date + interval '1 month', 'YYYY-MM')
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
  round(coalesce(qualified_service_hours, 0), 2) as qualified_service_hours,
  round(100 * coalesce(qualified_service_hours, 0) / nullif(total_service_hours, 0), 1) as qualified_ratio,
  case
    when 100 * coalesce(qualified_service_hours, 0) / nullif(total_service_hours, 0) >= 50
      then '基準クリア'
    else '要確認'
  end as threshold_status,
  category_order
from rows_with_total;

create or replace view public.dashboard_service_time_qualification_monthly_view as
select
  year_month,
  total_service_hours,
  qualified_service_hours,
  qualified_ratio,
  threshold_status
from public.dashboard_service_time_qualification_breakdown_view
where category_order = 9;

create or replace view public.dashboard_service_time_qualification_staff_detail_view as
with staff_hours as (
  select
    year_month,
    service_category,
    staff_user_id,
    sum(total_hours) as total_service_hours,
    coalesce(sum(total_hours) filter (where qualified), 0) as qualified_service_hours
  from public.dashboard_service_time_qualification_staff_rows()
  where year_month <= to_char(current_date + interval '1 month', 'YYYY-MM')
  group by year_month, service_category, staff_user_id
), qualification_rows as (
  select
    fe.auth_uid,
    attachment.value ->> 'label' as qualification_name,
    acquired.acquired_date
  from public.form_entries fe
  cross join lateral jsonb_array_elements(coalesce(fe.attachments, '[]'::jsonb)) attachment(value)
  cross join lateral (
    select case
      when nullif(attachment.value ->> 'acquired_at', '')
           ~ '^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])'
        then to_date(left(attachment.value ->> 'acquired_at', 10), 'YYYY-MM-DD')
    end as acquired_date
  ) acquired
  join public.user_doc_master qm
    on qm.category = 'certificate'
   and qm.is_active = true
   and qm.label = attachment.value ->> 'label'
   and qm.label in ('介護福祉士', '実務者研修修了', '看護師')
  where fe.auth_uid is not null
    and nullif(btrim(attachment.value ->> 'url'), '') is not null
    and attachment.value ->> 'type' in ('資格証明書', '資格証', 'certificate', 'certification')
), qualification_info as (
  select
    auth_uid,
    string_agg(
      qualification_name || '（' || coalesce(to_char(acquired_date, 'YYYY-MM-DD'), '取得日未設定') || '）',
      ' / '
      order by acquired_date nulls last, qualification_name
    ) as qualifications,
    min(acquired_date) as qualification_from
  from qualification_rows
  group by auth_uid
)
select
  sh.year_month,
  sh.service_category,
  sh.staff_user_id,
  concat_ws('', u.last_name_kanji, u.first_name_kanji) as staff_name,
  coalesce(qi.qualifications, '対象資格なし') as qualifications,
  qi.qualification_from,
  round(sh.total_service_hours, 2) as total_service_hours,
  round(sh.qualified_service_hours, 2) as qualified_service_hours,
  round(100 * sh.qualified_service_hours / nullif(sh.total_service_hours, 0), 1) as qualified_ratio,
  case
    when sh.qualified_service_hours > 0 then 'サ責資格者時間あり'
    else '対象外'
  end as qualification_status
from staff_hours sh
join public.user_entry_united_view_single u
  on u.user_id = sh.staff_user_id
left join qualification_info qi
  on qi.auth_uid = u.auth_uid;

alter view public.dashboard_service_time_qualification_staff_detail_view
  set (security_invoker = false);
