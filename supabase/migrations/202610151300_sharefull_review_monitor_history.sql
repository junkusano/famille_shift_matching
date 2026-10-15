create table public.sharefull_review_monitor_history (
  id uuid primary key,
  source_id uuid not null,
  occurred_at timestamptz not null,
  outcome text not null check (outcome in (
    'running', 'skipped_busy', 'no_pending_templates', 'checked', 'status_updated', 'failed'
  )),
  pending_templates integer not null default 0 check (pending_templates >= 0),
  statuses_updated integer not null default 0 check (statuses_updated >= 0),
  publication_jobs_registered integer not null default 0 check (publication_jobs_registered >= 0),
  detail text,
  received_at timestamptz not null default now()
);

create index sharefull_review_monitor_history_occurred_idx
  on public.sharefull_review_monitor_history (occurred_at desc);

alter table public.sharefull_review_monitor_history enable row level security;
revoke all on public.sharefull_review_monitor_history from anon, authenticated;
grant all on public.sharefull_review_monitor_history to service_role;

create function public.prune_sharefull_review_monitor_history() returns void
language sql security definer set search_path=public,pg_temp as $$
  delete from public.sharefull_review_monitor_history
  where id in (
    select id from public.sharefull_review_monitor_history
    order by occurred_at desc, id desc
    offset 500
  );
$$;

revoke all on function public.prune_sharefull_review_monitor_history() from public,anon,authenticated;
grant execute on function public.prune_sharefull_review_monitor_history() to service_role;
