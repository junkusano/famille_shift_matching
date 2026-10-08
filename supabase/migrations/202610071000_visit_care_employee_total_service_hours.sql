-- サービス区分別・サ責資格者サービス時間比率の訪問介護分を調整する。
--
-- 社長・アシスタントマネジャー以上（既存の system_role が admin / manager）については、
-- 訪問介護の「総サービス時間」に他サービスの時間も含める。
-- 他サービス区分の集計は従来どおり各サービス単独とし、林淳之さんは訪問介護に含めない。
-- 資格者時間は訪問介護の実時間だけを分子に残す。

create or replace view public.dashboard_service_time_qualification_breakdown_view as
with source_rows as (
  select
    rows.year_month,
    rows.service_date,
    rows.service_category,
    rows.total_hours,
    rows.staff_user_id,
    rows.qualified,
    concat_ws('', staff.last_name_kanji, staff.first_name_kanji) as staff_name,
    lower(coalesce(staff.system_role, '')) in ('admin', 'manager') as is_employee,
    concat_ws('', staff.last_name_kanji, staff.first_name_kanji) = '林淳之' as is_hayashi
  from public.dashboard_service_time_qualification_staff_rows() rows
  join public.user_entry_united_view_single staff
    on staff.user_id = rows.staff_user_id
), adjusted_rows as (
  -- 林さんは訪問介護の元データも訪問介護集計から除外する。
  select
    year_month,
    service_category,
    total_hours,
    qualified
  from source_rows
  where not (service_category = '訪問介護' and is_hayashi)

  union all

  -- 社員の訪問介護以外の時間を、訪問介護の総時間へ加算する。
  -- qualified=false とし、資格者時間の分子は訪問介護の実時間だけに限定する。
  select
    year_month,
    '訪問介護' as service_category,
    total_hours,
    false as qualified
  from source_rows
  where is_employee
    and not is_hayashi
    and service_category <> '訪問介護'
), category_totals as (
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
  from adjusted_rows
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

create or replace view public.dashboard_service_time_qualification_staff_detail_view as
with source_rows as (
  select
    rows.year_month,
    rows.service_date,
    rows.service_category,
    rows.total_hours,
    rows.staff_user_id,
    rows.qualified,
    concat_ws('', staff.last_name_kanji, staff.first_name_kanji) as staff_name,
    lower(coalesce(staff.system_role, '')) in ('admin', 'manager') as is_employee,
    concat_ws('', staff.last_name_kanji, staff.first_name_kanji) = '林淳之' as is_hayashi
  from public.dashboard_service_time_qualification_staff_rows() rows
  join public.user_entry_united_view_single staff
    on staff.user_id = rows.staff_user_id
), adjusted_rows as (
  select year_month, service_category, total_hours, staff_user_id, qualified
  from source_rows
  where not (service_category = '訪問介護' and is_hayashi)
  union all
  select year_month, '訪問介護', total_hours, staff_user_id, false
  from source_rows
  where is_employee
    and not is_hayashi
    and service_category <> '訪問介護'
), staff_hours as (
  select
    year_month,
    service_category,
    staff_user_id,
    sum(total_hours) as total_service_hours,
    coalesce(sum(total_hours) filter (where qualified), 0) as qualified_service_hours
  from adjusted_rows
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

alter view public.dashboard_service_time_qualification_breakdown_view
  set (security_invoker = false);

alter view public.dashboard_service_time_qualification_staff_detail_view
  set (security_invoker = false);
