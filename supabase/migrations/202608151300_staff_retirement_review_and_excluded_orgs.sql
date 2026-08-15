create or replace function public.staff_retirement_review_rows()
returns table (user_id text, staff_name text, status text, lw_userid text, last_shift_date date, hired_at timestamptz)
language sql security definer set search_path = public as $$
  with shifts as (
    select s.shift_start_date::date shift_date, p.staff_user_id from shift_shift_record_view s
    cross join lateral (values (s.staff_01_user_id,true),(s.staff_02_user_id,not coalesce(s.staff_02_attend_flg,false)),(s.staff_03_user_id,not coalesce(s.staff_03_attend_flg,false))) p(staff_user_id,ok)
    where coalesce(s.kaipoke_cs_id,'') not like '99999999%' and coalesce(s.service_code,'') not like '%キャンセル%' and p.ok and p.staff_user_id is not null and s.shift_start_time is not null and s.shift_end_time is not null
  ), last_shift as (select staff_user_id,max(shift_date) last_shift_date from shifts group by staff_user_id)
  select u.user_id, concat_ws(' ',fe.last_name_kanji,fe.first_name_kanji),u.status,u.lw_userid,l.last_shift_date,coalesce(u.entry_date_latest,fe.agreed_at,fe.created_at,u.created_at)::timestamptz
  from users u left join last_shift l on l.staff_user_id=u.user_id left join form_entries fe on fe.id=u.entry_id
  where coalesce(u.org_unit_id,'') not in ('fb9bab81-5f4e-4725-2d34-05240f80a71a','5b26013b-a3d4-42ab-266c-05cad5ab1c10');
$$;
revoke all on function public.staff_retirement_review_rows() from public;
