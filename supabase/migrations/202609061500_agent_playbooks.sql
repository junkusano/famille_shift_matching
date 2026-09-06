begin;

create table if not exists public.agent_playbooks (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  description text,
  category text not null check (category in ('shift', 'lineworks', 'knowledge', 'operations', 'other')),
  room_scope text not null default 'any_room'
    check (room_scope in ('client_room', 'staff_room', 'any_room')),
  trigger_mode text not null default 'lineworks_mention'
    check (trigger_mode in ('lineworks_mention', 'lineworks_phrase', 'scheduled', 'manual')),
  execution_mode text not null default 'native_agent'
    check (execution_mode in ('native_agent', 'dialogflow_legacy', 'scheduled_job')),
  situation text not null check (char_length(situation) between 1 and 2000),
  instructions text not null check (char_length(instructions) between 1 and 5000),
  trigger_examples jsonb not null default '[]'::jsonb
    check (jsonb_typeof(trigger_examples) = 'array'),
  allowed_actions jsonb not null default '[]'::jsonb
    check (jsonb_typeof(allowed_actions) = 'array'),
  context_message_limit smallint not null default 0
    check (context_message_limit between 0 and 50),
  context_minutes smallint not null default 0
    check (context_minutes between 0 and 180),
  confirmation_mode text not null default 'before_write'
    check (confirmation_mode in ('none', 'before_write', 'always')),
  approver_scope text not null default 'requester_only'
    check (approver_scope in ('requester_only', 'requester_or_manager')),
  session_ttl_minutes smallint not null default 10
    check (session_ttl_minutes between 1 and 60),
  is_enabled boolean not null default false,
  is_locked boolean not null default false,
  locked_reason text,
  sort_order integer not null default 100,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agent_playbooks_active_idx
  on public.agent_playbooks (is_enabled, category, sort_order);

create table if not exists public.agent_sessions (
  id uuid primary key default gen_random_uuid(),
  playbook_id uuid references public.agent_playbooks(id) on delete set null,
  channel_id text not null,
  requester_lw_userid text,
  status text not null default 'active'
    check (status in ('active', 'awaiting_input', 'awaiting_confirmation', 'completed', 'cancelled', 'expired', 'failed')),
  state jsonb not null default '{}'::jsonb,
  source_message_ids jsonb not null default '[]'::jsonb,
  pending_action jsonb,
  expires_at timestamptz not null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists agent_sessions_one_active_requester_idx
  on public.agent_sessions (channel_id, requester_lw_userid)
  where status in ('active', 'awaiting_input', 'awaiting_confirmation');

create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  playbook_id uuid references public.agent_playbooks(id) on delete set null,
  session_id uuid references public.agent_sessions(id) on delete set null,
  trigger_source text not null check (trigger_source in ('lineworks_mention', 'lineworks_phrase', 'scheduled', 'manual')),
  status text not null default 'received'
    check (status in ('received', 'matched', 'awaiting_input', 'awaiting_confirmation', 'succeeded', 'skipped', 'blocked', 'failed')),
  action_name text,
  decision_summary jsonb not null default '{}'::jsonb,
  input_summary jsonb not null default '{}'::jsonb,
  output_summary jsonb not null default '{}'::jsonb,
  error_code text,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists agent_runs_history_idx
  on public.agent_runs (created_at desc, playbook_id);

create or replace function public.agent_playbooks_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists agent_playbooks_touch_updated_at on public.agent_playbooks;
create trigger agent_playbooks_touch_updated_at
before update on public.agent_playbooks
for each row execute function public.agent_playbooks_touch_updated_at();

drop trigger if exists agent_sessions_touch_updated_at on public.agent_sessions;
create trigger agent_sessions_touch_updated_at
before update on public.agent_sessions
for each row execute function public.agent_playbooks_touch_updated_at();

alter table public.agent_playbooks enable row level security;
alter table public.agent_sessions enable row level security;
alter table public.agent_runs enable row level security;

revoke all on public.agent_playbooks from anon, authenticated;
revoke all on public.agent_sessions from anon, authenticated;
revoke all on public.agent_runs from anon, authenticated;
revoke all on function public.agent_playbooks_touch_updated_at() from public, anon, authenticated;

-- 旧Dialogflowの途中状態を残さず、退出確認だけを継続対象にする。
update public.dialogflow_pending_shift_requests
set status = 'cancelled', expires_at = now()
where coalesce(intent_name, '') <> 'quit_lw_group'
  and status in ('active', 'confirming', 'pending');

insert into public.agent_playbooks (
  name, description, category, room_scope, trigger_mode, execution_mode,
  situation, instructions, trigger_examples, allowed_actions,
  context_message_limit, context_minutes, confirmation_mode, approver_scope,
  session_ttl_minutes, is_enabled, is_locked, locked_reason, sort_order
)
select
  '定時の未対応リマインド',
  '直近のLINE WORKS会話から未対応と思われる依頼を確認し、定時に知らせます。',
  'operations', 'any_room', 'scheduled', 'scheduled_job',
  '設定済みの定時になったとき',
  '既存の未対応リマインド処理を実行します。会話操作ルールからは変更しません。',
  '["定時実行"]'::jsonb,
  '["lineworks.send_unhandled_reminder"]'::jsonb,
  0, 0, 'none', 'requester_or_manager', 10,
  true, true, '既存の定時処理として保護されています。', 10
where not exists (
  select 1 from public.agent_playbooks where execution_mode = 'scheduled_job' and name = '定時の未対応リマインド'
);

insert into public.agent_playbooks (
  name, description, category, room_scope, trigger_mode, execution_mode,
  situation, instructions, trigger_examples, allowed_actions,
  context_message_limit, context_minutes, confirmation_mode, approver_scope,
  session_ttl_minutes, is_enabled, is_locked, locked_reason, sort_order
)
select
  '自分をこの部屋から退出',
  '依頼者本人を現在のLINE WORKSグループから退出させます。',
  'lineworks', 'client_room', 'lineworks_phrase', 'dialogflow_legacy',
  '本人が、この部屋から自分を退出させてほしいと依頼したとき',
  '退出前に本人へ確認し、OKの場合だけ依頼者本人を退出させます。',
  '["私をこの部屋から退出して", "自分をこの部屋から退出させて"]'::jsonb,
  '["lineworks.leave_self"]'::jsonb,
  0, 0, 'always', 'requester_only', 7,
  true, true, '残すよう指定されたDialogflow処理です。', 20
where not exists (
  select 1 from public.agent_playbooks where execution_mode = 'dialogflow_legacy' and name = '自分をこの部屋から退出'
);

commit;
