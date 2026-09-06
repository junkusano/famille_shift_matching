begin;

create table if not exists public.knowledge_automation_tasks (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  description text,
  task_type text not null check (task_type in (
    'weather_alert',
    'lineworks_knowledge',
    'lesson_reminder',
    'billing_review',
    'wordpress_blog',
    'custom'
  )),
  trigger_type text not null check (trigger_type in ('interval', 'daily', 'monthly', 'event', 'manual')),
  schedule jsonb not null default '{}'::jsonb,
  destination text not null check (destination in (
    'lineworks_board',
    'lineworks_message',
    'kusano_knowledge',
    'lesson_reminder',
    'wordpress_post',
    'manager_notification',
    'none'
  )),
  approval_mode text not null default 'review_required'
    check (approval_mode in ('draft', 'review_required', 'automatic')),
  condition_summary text,
  settings jsonb not null default '{}'::jsonb,
  timezone text not null default 'Asia/Tokyo' check (timezone = 'Asia/Tokyo'),
  privacy_filter_enabled boolean not null default true check (privacy_filter_enabled = true),
  compliance_filter_enabled boolean not null default true check (compliance_filter_enabled = true),
  safety_policy_version text not null default 'common-v1',
  is_enabled boolean not null default false,
  next_run_at timestamptz,
  last_run_at timestamptz,
  last_success_at timestamptz,
  last_result text,
  last_error_at timestamptz,
  last_error_message text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists knowledge_automation_tasks_due_idx
  on public.knowledge_automation_tasks (next_run_at)
  where is_enabled = true and next_run_at is not null;

create table if not exists public.knowledge_automation_runs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.knowledge_automation_tasks(id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'succeeded', 'skipped', 'needs_review', 'blocked', 'failed', 'cancelled')),
  trigger_source text not null default 'schedule'
    check (trigger_source in ('schedule', 'event', 'manual', 'retry')),
  scheduled_for timestamptz,
  idempotency_key text not null,
  safety_result text check (safety_result in ('allowed', 'needs_review', 'blocked')),
  safety_findings jsonb not null default '[]'::jsonb,
  input_summary jsonb not null default '{}'::jsonb,
  output_summary jsonb not null default '{}'::jsonb,
  output_reference text,
  error_code text,
  error_message text,
  claimed_at timestamptz,
  lease_expires_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  unique (task_id, idempotency_key)
);

create index if not exists knowledge_automation_runs_history_idx
  on public.knowledge_automation_runs (task_id, created_at desc);

create index if not exists knowledge_automation_runs_queue_idx
  on public.knowledge_automation_runs (status, created_at)
  where status in ('queued', 'running');

create or replace function public.knowledge_automation_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists knowledge_automation_tasks_touch_updated_at on public.knowledge_automation_tasks;
create trigger knowledge_automation_tasks_touch_updated_at
before update on public.knowledge_automation_tasks
for each row execute function public.knowledge_automation_touch_updated_at();

alter table public.knowledge_automation_tasks enable row level security;
alter table public.knowledge_automation_runs enable row level security;

revoke all on public.knowledge_automation_tasks from anon, authenticated;
revoke all on public.knowledge_automation_runs from anon, authenticated;

commit;
