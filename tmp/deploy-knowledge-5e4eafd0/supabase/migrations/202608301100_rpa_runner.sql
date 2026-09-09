-- Node.js Runner用のジョブ運行基盤。トークンの平文は保存しない。
create extension if not exists pgcrypto;

create table if not exists public.rpa_runners (
  runner_id text primary key check (runner_id ~ '^[A-Za-z0-9_-]{3,80}$'),
  runner_name text not null check (char_length(runner_name) between 1 and 100),
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  is_active boolean not null default true,
  last_heartbeat_at timestamptz,
  last_status text check (last_status in ('online', 'busy')),
  current_job_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rpa_runner_jobs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null check (job_type ~ '^[a-z][a-z0-9._-]{0,100}$'),
  payload jsonb not null default '{}'::jsonb,
  timeout_ms integer check (timeout_ms is null or timeout_ms between 1 and 86400000),
  status text not null default 'pending' check (status in ('pending', 'claimed', 'completed', 'failed', 'cancelled')),
  target_runner_id text references public.rpa_runners(runner_id),
  claimed_runner_id text references public.rpa_runners(runner_id),
  claimed_at timestamptz,
  completed_at timestamptz,
  result jsonb,
  error_code text,
  error_type text,
  error_message text,
  error_debug jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rpa_runner_jobs_claim_idx
  on public.rpa_runner_jobs (status, target_runner_id, created_at)
  where status = 'pending';
create index if not exists rpa_runner_jobs_history_idx
  on public.rpa_runner_jobs (created_at desc);

create or replace function public.rpa_runner_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists rpa_runners_set_updated_at on public.rpa_runners;
create trigger rpa_runners_set_updated_at before update on public.rpa_runners
for each row execute function public.rpa_runner_set_updated_at();

drop trigger if exists rpa_runner_jobs_set_updated_at on public.rpa_runner_jobs;
create trigger rpa_runner_jobs_set_updated_at before update on public.rpa_runner_jobs
for each row execute function public.rpa_runner_set_updated_at();

-- SKIP LOCKEDにより複数Runnerからの同時claimでも同じジョブを返さない。
create or replace function public.claim_rpa_runner_job(p_runner_id text)
returns table (id uuid, job_type text, payload jsonb, timeout_ms integer)
language plpgsql
as $$
begin
  return query
  with claimed as (
    update public.rpa_runner_jobs as job
       set status = 'claimed', claimed_runner_id = p_runner_id, claimed_at = now()
     where job.id = (
       select candidate.id
         from public.rpa_runner_jobs as candidate
        where candidate.status = 'pending'
          and (candidate.target_runner_id is null or candidate.target_runner_id = p_runner_id)
        order by candidate.created_at asc
        for update skip locked
        limit 1
     )
     returning job.id, job.job_type, job.payload, job.timeout_ms
  )
  select claimed.id, claimed.job_type, claimed.payload, claimed.timeout_ms from claimed;
end;
$$;

alter table public.rpa_runners enable row level security;
alter table public.rpa_runner_jobs enable row level security;
revoke all on public.rpa_runners, public.rpa_runner_jobs from anon, authenticated;
revoke all on function public.claim_rpa_runner_job(text) from public, anon, authenticated;
