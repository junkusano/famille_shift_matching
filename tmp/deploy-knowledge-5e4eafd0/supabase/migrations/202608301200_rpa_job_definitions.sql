-- Runnerが実行する定時ジョブ定義。ブラウザ操作手順は保存しない。
begin;

create table if not exists public.rpa_job_definitions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  job_type text not null check (job_type ~ '^[a-z][a-z0-9._-]{0,100}$'),
  execution_mode text not null default 'famille_rpa' check (execution_mode = 'famille_rpa'),
  trigger_type text not null default 'schedule' check (trigger_type in ('schedule', 'manual')),
  is_enabled boolean not null default true,
  schedule jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  last_generated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.rpa_runner_jobs
  add column if not exists job_definition_id uuid references public.rpa_job_definitions(id),
  add column if not exists scheduled_for timestamptz;

create unique index if not exists rpa_runner_jobs_definition_schedule_unique
  on public.rpa_runner_jobs (job_definition_id, scheduled_for)
  where job_definition_id is not null and scheduled_for is not null;

drop trigger if exists rpa_job_definitions_set_updated_at on public.rpa_job_definitions;
create trigger rpa_job_definitions_set_updated_at before update on public.rpa_job_definitions
for each row execute function public.rpa_runner_set_updated_at();

alter table public.rpa_job_definitions enable row level security;
revoke all on public.rpa_job_definitions from anon, authenticated;

insert into public.rpa_job_definitions (name, job_type, execution_mode, trigger_type, is_enabled, schedule, payload)
select
  'タイミー勤務者フォロー SMS一斉送信',
  'taimee.daily_worker_follow_sms',
  'famille_rpa',
  'schedule',
  false,
  '{"timezone":"Asia/Tokyo","times":["10:00"]}'::jsonb,
  '{"client_id":"263546","days":[0,-1,-2],"dry_run":false}'::jsonb
where not exists (select 1 from public.rpa_job_definitions where job_type = 'taimee.daily_worker_follow_sms');

commit;
