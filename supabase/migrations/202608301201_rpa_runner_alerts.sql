-- RPA失敗の詳細とLINE WORKS通知の抑制状態。トークンやCookieは保存しない。
alter table public.rpa_runner_jobs
  add column if not exists error_category text,
  add column if not exists retry_count integer not null default 0 check (retry_count between 0 and 100),
  add column if not exists failed_at timestamptz,
  add column if not exists error_fingerprint text,
  add column if not exists lineworks_notified_at timestamptz;

create table if not exists public.rpa_runner_alerts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references public.rpa_runner_jobs(id) on delete cascade,
  runner_id text not null references public.rpa_runners(runner_id),
  job_type text not null,
  error_category text not null,
  error_code text not null,
  fingerprint text not null,
  summary text not null,
  retry_count integer not null default 0,
  notified_at timestamptz,
  notification_error text,
  suppressed_by_alert_id uuid references public.rpa_runner_alerts(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists rpa_runner_alerts_fingerprint_active_idx
  on public.rpa_runner_alerts (fingerprint, notified_at desc)
  where resolved_at is null and notified_at is not null;

alter table public.rpa_runner_alerts enable row level security;
revoke all on public.rpa_runner_alerts from anon, authenticated;
