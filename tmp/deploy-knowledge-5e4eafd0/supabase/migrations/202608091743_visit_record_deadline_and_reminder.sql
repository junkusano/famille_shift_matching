-- A deadline miss is immutable: one staff member can receive it once per shift.
-- This partial index deliberately leaves all pre-existing staff_log event types alone.
create unique index if not exists staff_log_visit_record_deadline_miss_unique
  on public.staff_log (staff_id, action_at, action_detail)
  where registered_by = 'cron:visit-record-deadline';

create or replace function public.record_visit_record_deadline_miss(
  p_staff_id uuid,
  p_action_at timestamp without time zone,
  p_action_detail text
) returns void
language sql
as $$
  insert into public.staff_log (staff_id, action_at, action_detail, registered_by)
  values (p_staff_id, p_action_at, p_action_detail, 'cron:visit-record-deadline')
  on conflict do nothing;
$$;

alter table public.staff_monthly_score_summaries
  add column if not exists visit_record_deadline_miss_count integer not null default 0;

-- A reservation is created before the external API call. This deliberately favours
-- at-most-once delivery when Vercel retries a cron invocation.
create table if not exists public.visit_record_daily_reminder_logs (
  reminder_date date primary key,
  attempted_at timestamp with time zone not null default now(),
  sent_at timestamp with time zone null
);
