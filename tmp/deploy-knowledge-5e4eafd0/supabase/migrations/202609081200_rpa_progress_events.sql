-- Separate from spot synchronization: safe to deploy logging independently.
create table public.rpa_progress_events (
 event_id uuid primary key, job_id uuid references public.rpa_runner_jobs(id) on delete set null,
 run_id uuid not null, attempt integer not null check(attempt between 1 and 100),
 runner_id text references public.rpa_runners(runner_id) on delete set null,
 source text not null check(source in ('runner','extension','api')), code text not null,
 occurred_at timestamptz not null, received_at timestamptz not null default now(),
 version text not null, data jsonb not null default '{}'
);
create index rpa_progress_run on public.rpa_progress_events(run_id,occurred_at);
create index rpa_progress_retention on public.rpa_progress_events(received_at);
alter table public.rpa_progress_events enable row level security;
revoke all on public.rpa_progress_events from anon,authenticated;
grant all on public.rpa_progress_events to service_role;
-- 30-day retention, called by the authenticated ingestion API.
create function public.prune_rpa_progress_events() returns void language sql security definer set search_path=public,pg_temp as $$
 delete from public.rpa_progress_events where received_at < now()-interval '30 days';
$$;
revoke all on function public.prune_rpa_progress_events() from public,anon,authenticated;
grant execute on function public.prune_rpa_progress_events() to service_role;
