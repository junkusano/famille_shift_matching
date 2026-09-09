begin;

alter table public.knowledge_automation_tasks
  drop constraint if exists knowledge_automation_tasks_task_type_check;
alter table public.knowledge_automation_tasks
  add constraint knowledge_automation_tasks_task_type_check
  check (task_type in (
    'weather_alert', 'lineworks_knowledge', 'lesson_reminder', 'billing_review',
    'wordpress_blog', 'knowledge_diff', 'custom'
  ));

alter table public.knowledge_automation_tasks
  drop constraint if exists knowledge_automation_tasks_trigger_type_check;
alter table public.knowledge_automation_tasks
  add constraint knowledge_automation_tasks_trigger_type_check
  check (trigger_type in ('interval', 'daily', 'weekly', 'monthly', 'event', 'manual'));

create table public.knowledge_diff_runs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public.knowledge_automation_tasks(id) on delete set null,
  trigger_type text not null check (trigger_type in ('schedule', 'manual')),
  dry_run boolean not null default false,
  status text not null default 'running'
    check (status in ('running', 'succeeded', 'previewed', 'failed')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  from_at timestamptz not null,
  to_at timestamptz not null,
  source_count integer not null default 0 check (source_count >= 0),
  result_count integer not null default 0 check (result_count >= 0),
  input_fingerprint text,
  result_summary jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  check (to_at > from_at),
  check ((status in ('succeeded', 'previewed', 'failed')) = (completed_at is not null))
);

create unique index knowledge_diff_runs_one_active
  on public.knowledge_diff_runs ((true))
  where status = 'running';
create index knowledge_diff_runs_success_history_idx
  on public.knowledge_diff_runs (completed_at desc)
  where status = 'succeeded';

create table public.knowledge_diff_item_sources (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.knowledge_diff_runs(id) on delete cascade,
  diff_knowledge_id uuid not null references public.knowledge_items(id) on delete cascade,
  source_knowledge_id uuid not null references public.knowledge_items(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (diff_knowledge_id <> source_knowledge_id),
  unique (diff_knowledge_id, source_knowledge_id)
);

create index knowledge_diff_item_sources_run_idx
  on public.knowledge_diff_item_sources (run_id, diff_knowledge_id);
create index knowledge_diff_item_sources_source_idx
  on public.knowledge_diff_item_sources (source_knowledge_id, diff_knowledge_id);

alter table public.knowledge_diff_runs enable row level security;
alter table public.knowledge_diff_item_sources enable row level security;
revoke all on public.knowledge_diff_runs from anon, authenticated;
revoke all on public.knowledge_diff_item_sources from anon, authenticated;

insert into public.knowledge_automation_tasks (
  name, description, task_type, trigger_type, schedule, destination, approval_mode,
  condition_summary, settings, is_enabled, next_run_at
)
select
  '週次の差分ナレッジ抽出',
  '前回の正常実行以降に追加・更新されたナレッジを横断し、判断に影響する変化だけを差分ナレッジとして保存します。',
  'knowledge_diff',
  'weekly',
  '{"dayOfWeek":1,"time":"03:30"}'::jsonb,
  'none',
  'review_required',
  '個人情報を含まない現行ナレッジを対象にし、key・deltaなどのAI生成済みナレッジは除外します。',
  '{"operation":"knowledge_diff_extract","initial_lookback_days":7,"max_source_items":200}'::jsonb,
  true,
  now() + interval '7 days'
where not exists (
  select 1
  from public.knowledge_automation_tasks
  where settings ->> 'operation' = 'knowledge_diff_extract'
);

commit;
