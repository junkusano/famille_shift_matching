begin;

create table if not exists public.monitoring_bulk_runs (
  id uuid primary key default gen_random_uuid(),
  target_month text not null check (target_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  period_start date not null,
  period_end date not null,
  evaluation_date date not null,
  event_template_id uuid not null references public.event_template(id),
  status text not null default 'running' check (status in ('running', 'completed', 'failed', 'cancelled')),
  target_count integer not null default 0,
  sent_count integer not null default 0,
  task_count integer not null default 0,
  skipped_count integer not null default 0,
  error_count integer not null default 0,
  last_sent_at timestamptz,
  created_by text not null,
  created_by_name text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_start <= period_end)
);

create table if not exists public.monitoring_bulk_run_items (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.monitoring_bulk_runs(id) on delete cascade,
  client_info_id text not null,
  kaipoke_cs_id text not null,
  client_name text,
  orgunitid text,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'task_created', 'skipped', 'error')),
  monitoring_id uuid references public.client_monitorings(id) on delete set null,
  event_task_id uuid references public.event_tasks(id) on delete set null,
  note text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, client_info_id)
);

create index if not exists monitoring_bulk_runs_started_idx
  on public.monitoring_bulk_runs (started_at desc);
create index if not exists monitoring_bulk_run_items_next_idx
  on public.monitoring_bulk_run_items (run_id, status, created_at);

drop trigger if exists monitoring_bulk_runs_set_updated_at on public.monitoring_bulk_runs;
create trigger monitoring_bulk_runs_set_updated_at
before update on public.monitoring_bulk_runs
for each row execute function public.monitoring_set_updated_at();

drop trigger if exists monitoring_bulk_run_items_set_updated_at on public.monitoring_bulk_run_items;
create trigger monitoring_bulk_run_items_set_updated_at
before update on public.monitoring_bulk_run_items
for each row execute function public.monitoring_set_updated_at();

alter table public.monitoring_bulk_runs enable row level security;
alter table public.monitoring_bulk_run_items enable row level security;

revoke all on public.monitoring_bulk_runs, public.monitoring_bulk_run_items from anon, authenticated;
grant all on public.monitoring_bulk_runs, public.monitoring_bulk_run_items to service_role;
create unique index monitoring_bulk_running_month on public.monitoring_bulk_runs(target_month) where status = 'running';

create function public.claim_monitoring_bulk_item(p_run_id uuid)
returns setof public.monitoring_bulk_run_items
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform 1 from public.monitoring_bulk_runs where id = p_run_id and status = 'running' for update;
  if not found then return; end if;
  -- Never replay interrupted external side effects. Continue with the next client.
  update public.monitoring_bulk_run_items set status = 'error', processed_at = now(),
    note = '処理が中断しました。FAX受付・PDF・イベント履歴を確認してください。自動再送は行いません。'
    where run_id = p_run_id and status = 'processing' and updated_at < now() - interval '10 minutes';
  if exists(select 1 from public.monitoring_bulk_run_items where run_id = p_run_id and status = 'processing') then return; end if;
  return query update public.monitoring_bulk_run_items set status = 'processing'
    where id = (select id from public.monitoring_bulk_run_items where run_id = p_run_id and status = 'pending' order by created_at,id limit 1)
    returning *;
end; $$;
revoke all on function public.claim_monitoring_bulk_item(uuid) from public, anon, authenticated;
grant execute on function public.claim_monitoring_bulk_item(uuid) to service_role;

commit;
