-- 既存「チーム別サービス時間実績」の母集団へ合わせる。
-- attend_flg=true は同行者なので除外し、false/null の実働スタッフを加算する。
-- 空サービスコードは既存総時間には含まれるため、同一利用者の最寄りの
-- 有効サービスコードを使って8区分へ分類する。

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
      and label in ('介護福祉士', '実務者研修修了')
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
      and attachment.value ->> 'type' in ('資格証明書', 'certificate', 'certification')
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
          or sc2.kaipoke_servicek in ('要介護', '要支援', '自費')
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
    from resolved_service ps
    join public.user_entry_united_view_single u
      on u.user_id = ps.staff_user_id
     and u.org_unit_id is not null
    join public.shift_service_code sc
      on sc.service_code = ps.effective_service_code
    left join qualification_dates qd
      on qd.auth_uid = u.auth_uid
  )
  select
    to_char(cs.service_date, 'YYYY-MM'),
    cs.service_date,
    cs.service_category,
    cs.hours,
    cs.staff_user_id,
    coalesce(cs.qualified_from <= cs.service_date, false)
  from classified_staff cs
  where cs.service_category is not null
    and cs.hours > 0;
$$;
