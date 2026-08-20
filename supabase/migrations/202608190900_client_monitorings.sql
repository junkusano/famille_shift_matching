begin;

create extension if not exists pgcrypto;

create table if not exists public.client_monitorings (
  id uuid primary key default gen_random_uuid(),
  client_info_id text not null,
  kaipoke_cs_id text not null,
  service_type text not null check (service_type in ('care_insurance', 'disability')),
  period_start date not null,
  period_end date not null,
  evaluation_date date not null,
  status text not null default 'draft' check (
    status in ('draft', 'ai_generated', 'confirmed', 'pdf_final', 'fax_sent')
  ),
  assessment_id text,
  plan_id text,
  client_request text not null default '',
  family_request text not null default '',
  issues text not null default '',
  summary text not null default '',
  notable_observations jsonb not null default '[]'::jsonb,
  monitoring_json jsonb not null default '{}'::jsonb,
  office_notice text not null default '',
  generated_by_ai boolean not null default false,
  ai_model text,
  ai_generated_at timestamptz,
  created_by text not null,
  created_by_name text,
  confirmed_by text,
  confirmed_by_name text,
  confirmed_at timestamptz,
  current_pdf_snapshot_id uuid,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_start <= period_end)
);

create table if not exists public.client_monitoring_goals (
  id uuid primary key default gen_random_uuid(),
  monitoring_id uuid not null references public.client_monitorings(id) on delete cascade,
  plan_goal_id text,
  parent_plan_goal_id text,
  goal_type text not null check (goal_type in ('long_term', 'short_term', 'assistance')),
  goal_text text not null,
  evaluation_start date,
  evaluation_end date,
  achievement_status text not null default 'insufficient_evidence' check (
    achievement_status in ('achieved', 'partial', 'not_achieved', 'insufficient_evidence')
  ),
  evaluation_text text not null default '',
  review_required boolean not null default false,
  review_content text not null default '',
  ai_evidence_json jsonb not null default '[]'::jsonb,
  generated_by_ai boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.client_monitoring_pdf_snapshots (
  id uuid primary key default gen_random_uuid(),
  monitoring_id uuid not null references public.client_monitorings(id) on delete restrict,
  version_no integer not null,
  storage_bucket text not null default 'monitoring-pdfs',
  storage_path text not null,
  filename text not null,
  content_hash text not null,
  content_snapshot jsonb not null,
  created_by text not null,
  created_by_name text,
  created_at timestamptz not null default now(),
  unique (monitoring_id, version_no),
  unique (storage_bucket, storage_path)
);

alter table public.client_monitorings
  drop constraint if exists client_monitorings_current_pdf_snapshot_id_fkey;
alter table public.client_monitorings
  add constraint client_monitorings_current_pdf_snapshot_id_fkey
  foreign key (current_pdf_snapshot_id)
  references public.client_monitoring_pdf_snapshots(id)
  on delete set null;

create table if not exists public.monitoring_fax_history (
  id uuid primary key default gen_random_uuid(),
  monitoring_id uuid not null references public.client_monitorings(id) on delete restrict,
  client_info_id text not null,
  kaipoke_cs_id text not null,
  pdf_snapshot_id uuid not null references public.client_monitoring_pdf_snapshots(id) on delete restrict,
  sent_at timestamptz,
  sent_by text not null,
  sent_by_name text,
  fax_number text not null,
  destination_name text not null,
  contact_name text,
  status text not null check (status in ('sending', 'accepted', 'request_failed')),
  external_fax_id text,
  process_key text,
  faximo_result_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.client_monitoring_events (
  id uuid primary key default gen_random_uuid(),
  monitoring_id uuid not null references public.client_monitorings(id) on delete restrict,
  action text not null,
  actor_user_id text not null,
  actor_name text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.monitoring_office_notices (
  id uuid primary key default gen_random_uuid(),
  service_type text check (service_type in ('care_insurance', 'disability')),
  period_start date not null,
  period_end date not null,
  notice text not null,
  is_active boolean not null default true,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_start <= period_end)
);

create index if not exists client_monitorings_client_period_idx
  on public.client_monitorings (client_info_id, period_end desc)
  where is_deleted = false;
create index if not exists client_monitorings_kaipoke_period_idx
  on public.client_monitorings (kaipoke_cs_id, period_end desc)
  where is_deleted = false;
create index if not exists client_monitoring_goals_monitoring_idx
  on public.client_monitoring_goals (monitoring_id, sort_order);
create index if not exists client_monitoring_pdf_snapshots_monitoring_idx
  on public.client_monitoring_pdf_snapshots (monitoring_id, version_no desc);
create index if not exists monitoring_fax_history_monitoring_idx
  on public.monitoring_fax_history (monitoring_id, created_at desc);
create index if not exists client_monitoring_events_monitoring_idx
  on public.client_monitoring_events (monitoring_id, created_at desc);
create index if not exists monitoring_office_notices_period_idx
  on public.monitoring_office_notices (period_start, period_end)
  where is_active = true;

create or replace function public.monitoring_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists client_monitorings_set_updated_at on public.client_monitorings;
create trigger client_monitorings_set_updated_at
before update on public.client_monitorings
for each row execute function public.monitoring_set_updated_at();

drop trigger if exists client_monitoring_goals_set_updated_at on public.client_monitoring_goals;
create trigger client_monitoring_goals_set_updated_at
before update on public.client_monitoring_goals
for each row execute function public.monitoring_set_updated_at();

drop trigger if exists monitoring_fax_history_set_updated_at on public.monitoring_fax_history;
create trigger monitoring_fax_history_set_updated_at
before update on public.monitoring_fax_history
for each row execute function public.monitoring_set_updated_at();

drop trigger if exists monitoring_office_notices_set_updated_at on public.monitoring_office_notices;
create trigger monitoring_office_notices_set_updated_at
before update on public.monitoring_office_notices
for each row execute function public.monitoring_set_updated_at();

alter table public.client_monitorings enable row level security;
alter table public.client_monitoring_goals enable row level security;
alter table public.client_monitoring_pdf_snapshots enable row level security;
alter table public.monitoring_fax_history enable row level security;
alter table public.client_monitoring_events enable row level security;
alter table public.monitoring_office_notices enable row level security;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('monitoring-pdfs', 'monitoring-pdfs', false, 41943040, array['application/pdf'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

commit;
