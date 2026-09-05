-- REVIEW DRAFT ONLY
-- ファミーユ Knowledge Engine v0.1
-- このファイルは supabase/migrations 配下ではなく、Supabaseには未適用。
-- 実装時には本番catalog・RLS・Vault RPCを再確認してからmigrationへ変換する。

begin;

create table public.knowledge_integrations (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider ~ '^[a-z][a-z0-9._-]{0,100}$'),
  status text not null default 'disconnected'
    check (status in ('disconnected', 'connecting', 'connected', 'refresh_required', 'error')),
  provider_account_id text,
  provider_account_name text,
  access_token_secret_id uuid,
  refresh_token_secret_id uuid,
  token_storage text not null default 'aes_gcm'
    check (token_storage in ('aes_gcm', 'vault')),
  access_token_encrypted text,
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  scopes text[] not null default '{}'::text[],
  metadata jsonb not null default '{}'::jsonb,
  last_connected_at timestamptz,
  last_refreshed_at timestamptz,
  last_tested_at timestamptz,
  last_error_at timestamptz,
  last_error_code text,
  last_error_message text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    status <> 'connected'
    or (
      provider_account_id is not null
      and (
        access_token_secret_id is not null
        or access_token_encrypted is not null
      )
    )
  )
);

comment on column public.knowledge_integrations.access_token_secret_id is
  'Supabase Vault等のSecret ID。アクセストークン本文を保存しない。';
comment on column public.knowledge_integrations.refresh_token_secret_id is
  'Supabase Vault等のSecret ID。リフレッシュトークン本文を保存しない。';
comment on column public.knowledge_integrations.access_token_encrypted is
  'AES-256-GCM暗号化envelope。平文tokenを保存しない。';
comment on column public.knowledge_integrations.refresh_token_encrypted is
  'AES-256-GCM暗号化envelope。平文tokenを保存しない。';

create unique index knowledge_integrations_provider_account_unique
  on public.knowledge_integrations (provider, provider_account_id)
  where provider_account_id is not null;

create table public.integration_oauth_states (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider ~ '^[a-z][a-z0-9._-]{0,100}$'),
  state_hash text not null unique,
  initiated_by uuid not null references auth.users(id) on delete cascade,
  return_path text,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  check (return_path is null or return_path like '/portal/%')
);

create index integration_oauth_states_expiry_idx
  on public.integration_oauth_states (expires_at)
  where consumed_at is null;

create table public.knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique
    check (source_key ~ '^[a-z][a-z0-9._-]{0,150}$'),
  source_type text not null
    check (source_type ~ '^[a-z][a-z0-9._-]{0,100}$'),
  connector_key text not null
    check (connector_key ~ '^[a-z][a-z0-9._-]{0,100}$'),
  name text not null,
  description text,
  source_url text,
  drive_url text,
  integration_id uuid references public.knowledge_integrations(id) on delete set null,
  enabled boolean not null default false,
  sync_frequency text not null default 'manual'
    check (sync_frequency in ('manual', 'hourly', 'daily', 'weekly', 'monthly')),
  schedule jsonb not null default '{}'::jsonb,
  timezone text not null default 'Asia/Tokyo',
  next_run_at timestamptz,
  default_category text,
  default_privacy_level integer not null default 1
    check (default_privacy_level between 0 and 3),
  default_publishability text not null default 'internal_only'
    check (default_publishability in ('public', 'anonymize', 'internal_only', 'never_publish')),
  config jsonb not null default '{}'::jsonb,
  last_run_at timestamptz,
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error_code text,
  last_error_message text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (default_publishability <> 'public' or default_privacy_level = 0)
);

comment on column public.knowledge_sources.config is
  'Sheet ID、repository、branch、対象範囲等。OAuth token、API key、秘密鍵は保存禁止。';

create index knowledge_sources_due_idx
  on public.knowledge_sources (next_run_at)
  where enabled = true and sync_frequency <> 'manual';

create table public.knowledge_source_checkpoints (
  source_id uuid primary key references public.knowledge_sources(id) on delete cascade,
  cursor jsonb not null default '{}'::jsonb,
  cursor_version bigint not null default 0 check (cursor_version >= 0),
  last_success_at timestamptz,
  last_object_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.knowledge_source_objects (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.knowledge_sources(id) on delete restrict,
  external_id text not null,
  object_type text not null check (object_type ~ '^[a-z][a-z0-9._-]{0,100}$'),
  source_revision text not null default '',
  title text,
  safe_excerpt text,
  source_url text,
  drive_url text,
  occurred_at timestamptz,
  period_start date,
  period_end date,
  content_hash text not null,
  locator jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  privacy_level integer not null check (privacy_level between 0 and 3),
  publishability text not null
    check (publishability in ('public', 'anonymize', 'internal_only', 'never_publish')),
  processing_status text not null default 'indexed'
    check (processing_status in ('indexed', 'ignored', 'needs_review', 'promoted', 'error')),
  contains_personal_data boolean not null default false,
  supersedes_id uuid references public.knowledge_source_objects(id) on delete set null,
  is_current boolean not null default true,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end is null or period_start is null or period_end >= period_start),
  check (publishability <> 'public' or privacy_level = 0),
  check (not contains_personal_data or publishability <> 'public'),
  unique (source_id, external_id, source_revision)
);

comment on column public.knowledge_source_objects.safe_excerpt is
  'privacy判定後に安全と確認した短い抜粋のみ。原文・コード全文・FAX OCR全文は保存しない。';

create unique index knowledge_source_objects_current_unique
  on public.knowledge_source_objects (source_id, external_id)
  where is_current = true;
create index knowledge_source_objects_source_occurred_idx
  on public.knowledge_source_objects (source_id, occurred_at desc);
create index knowledge_source_objects_hash_idx
  on public.knowledge_source_objects (source_id, content_hash);

create table public.knowledge_items (
  id uuid primary key default gen_random_uuid(),
  knowledge_key text not null check (length(btrim(knowledge_key)) between 1 and 300),
  primary_source_id uuid references public.knowledge_sources(id) on delete set null,
  knowledge_type text not null
    check (knowledge_type ~ '^[a-z][a-z0-9._-]{0,100}$'),
  title text not null,
  summary text not null,
  content text,
  source_url text,
  drive_url text,
  occurred_at timestamptz,
  period_start date,
  period_end date,
  category text,
  tags text[] not null default '{}'::text[],
  importance integer not null default 3 check (importance between 1 and 5),
  confidence numeric(4,3) check (confidence between 0 and 1),
  related_people jsonb not null default '[]'::jsonb,
  related_departments text[] not null default '{}'::text[],
  related_services text[] not null default '{}'::text[],
  privacy_level integer not null default 1 check (privacy_level between 0 and 3),
  publishability text not null default 'internal_only'
    check (publishability in ('public', 'anonymize', 'internal_only', 'never_publish')),
  public_summary text,
  allowed_audiences text[] not null default array['manager', 'admin']::text[],
  contains_personal_data boolean not null default false,
  redaction_status text not null default 'not_required'
    check (redaction_status in ('not_required', 'required', 'in_progress', 'completed', 'rejected')),
  review_status text not null default 'draft'
    check (review_status in ('draft', 'needs_review', 'approved', 'rejected', 'superseded')),
  authorship text not null default 'source'
    check (authorship in ('source', 'ai', 'human', 'hybrid')),
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified', 'partially_verified', 'verified', 'disputed')),
  version integer not null default 1 check (version >= 1),
  is_current boolean not null default true,
  parent_knowledge_id uuid references public.knowledge_items(id) on delete set null,
  supersedes_id uuid references public.knowledge_items(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end is null or period_start is null or period_end >= period_start),
  check (publishability <> 'public' or privacy_level = 0),
  check (not contains_personal_data or publishability <> 'public'),
  check (review_status <> 'approved' or (approved_by is not null and approved_at is not null)),
  unique (knowledge_key, version),
  check (
    publishability <> 'public'
    or (
      review_status = 'approved'
      and contains_personal_data = false
      and nullif(btrim(public_summary), '') is not null
      and approved_by is not null
      and approved_at is not null
    )
  )
);

create unique index knowledge_items_current_key_unique
  on public.knowledge_items (knowledge_key)
  where is_current = true;
create index knowledge_items_filter_idx
  on public.knowledge_items (review_status, privacy_level, publishability, occurred_at desc);
create index knowledge_items_type_idx
  on public.knowledge_items (knowledge_type, category, occurred_at desc);
create index knowledge_items_tags_idx
  on public.knowledge_items using gin (tags);

create table public.knowledge_evidence_links (
  id uuid primary key default gen_random_uuid(),
  knowledge_item_id uuid not null references public.knowledge_items(id) on delete cascade,
  source_object_id uuid not null references public.knowledge_source_objects(id) on delete restrict,
  relation_type text not null default 'supports'
    check (relation_type in ('supports', 'contradicts', 'context', 'derived_from', 'supersedes')),
  evidence_note text,
  cited_location jsonb not null default '{}'::jsonb,
  confidence numeric(4,3) check (confidence between 0 and 1),
  created_at timestamptz not null default now(),
  unique (knowledge_item_id, source_object_id, relation_type)
);

create index knowledge_evidence_source_object_idx
  on public.knowledge_evidence_links (source_object_id, knowledge_item_id);

create table public.knowledge_relations (
  id uuid primary key default gen_random_uuid(),
  from_knowledge_id uuid not null references public.knowledge_items(id) on delete cascade,
  to_knowledge_id uuid not null references public.knowledge_items(id) on delete cascade,
  relation_type text not null
    check (relation_type in ('related', 'supports', 'contradicts', 'causes', 'influences', 'supersedes')),
  confidence numeric(4,3) check (confidence between 0 and 1),
  authorship text not null default 'ai'
    check (authorship in ('ai', 'human', 'hybrid')),
  manually_verified boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (from_knowledge_id <> to_knowledge_id),
  unique (from_knowledge_id, to_knowledge_id, relation_type)
);

create index knowledge_relations_reverse_idx
  on public.knowledge_relations (to_knowledge_id, relation_type);

create table public.knowledge_metric_snapshots (
  id uuid primary key default gen_random_uuid(),
  source_object_id uuid not null references public.knowledge_source_objects(id) on delete restrict,
  dedupe_key text not null unique,
  metric_key text not null check (metric_key ~ '^[a-z][a-z0-9._-]{0,150}$'),
  period_start date not null,
  period_end date not null,
  department text,
  service text,
  value numeric not null,
  unit text not null,
  dimensions jsonb not null default '{}'::jsonb,
  calculation_version text not null,
  privacy_level integer not null default 2 check (privacy_level between 0 and 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end >= period_start)
);

create index knowledge_metric_period_idx
  on public.knowledge_metric_snapshots (metric_key, period_start desc, department, service);

create table public.knowledge_code_artifacts (
  id uuid primary key default gen_random_uuid(),
  source_object_id uuid not null unique
    references public.knowledge_source_objects(id) on delete cascade,
  knowledge_item_id uuid references public.knowledge_items(id) on delete set null,
  repository text not null,
  branch text not null,
  path text not null,
  commit_sha text not null,
  file_url text not null,
  language text,
  component text,
  feature text,
  architectural_role text,
  summary text not null,
  related_tables text[] not null default '{}'::text[],
  related_api_routes text[] not null default '{}'::text[],
  security_relevance text[] not null default '{}'::text[],
  analysis_confidence numeric(4,3) check (analysis_confidence between 0 and 1),
  manually_verified boolean not null default false,
  last_analyzed_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (repository, commit_sha, path)
);

create index knowledge_code_component_idx
  on public.knowledge_code_artifacts (repository, component, feature);
create index knowledge_code_related_tables_idx
  on public.knowledge_code_artifacts using gin (related_tables);
create index knowledge_code_related_routes_idx
  on public.knowledge_code_artifacts using gin (related_api_routes);

create table public.knowledge_sync_runs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.knowledge_sources(id) on delete restrict,
  job_type text not null
    check (job_type in ('incremental', 'manual', 'dry_run', 'initial_scan', 'backfill', 'rebuild_summary', 'oauth_test')),
  trigger_type text not null
    check (trigger_type in ('cron', 'manual', 'system')),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'succeeded', 'failed', 'partial', 'skipped', 'cancelled')),
  dry_run boolean not null default false,
  checkpoint_version_before bigint not null default 0 check (checkpoint_version_before >= 0),
  cursor_before jsonb not null default '{}'::jsonb,
  cursor_after jsonb,
  processed integer not null default 0 check (processed >= 0),
  created_count integer not null default 0 check (created_count >= 0),
  updated_count integer not null default 0 check (updated_count >= 0),
  skipped_count integer not null default 0 check (skipped_count >= 0),
  summarized_count integer not null default 0 check (summarized_count >= 0),
  error_code text,
  error_message text,
  input_summary jsonb not null default '{}'::jsonb,
  output_summary jsonb not null default '{}'::jsonb,
  lock_token uuid not null default gen_random_uuid(),
  lease_expires_at timestamptz,
  started_by uuid references auth.users(id) on delete set null,
  started_at timestamptz,
  finished_at timestamptz,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  created_at timestamptz not null default now(),
  check (job_type <> 'dry_run' or dry_run = true),
  check (status not in ('succeeded', 'failed', 'partial', 'skipped', 'cancelled') or finished_at is not null)
);

create unique index knowledge_sync_runs_one_active_per_source
  on public.knowledge_sync_runs (source_id)
  where status in ('queued', 'running');
create index knowledge_sync_runs_history_idx
  on public.knowledge_sync_runs (source_id, created_at desc);
create index knowledge_sync_runs_status_idx
  on public.knowledge_sync_runs (status, created_at desc);

create function public.knowledge_touch_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.knowledge_touch_updated_at() from public, anon, authenticated;

create trigger knowledge_integrations_touch_updated_at
before update on public.knowledge_integrations
for each row execute function public.knowledge_touch_updated_at();

create trigger knowledge_sources_touch_updated_at
before update on public.knowledge_sources
for each row execute function public.knowledge_touch_updated_at();

create trigger knowledge_source_checkpoints_touch_updated_at
before update on public.knowledge_source_checkpoints
for each row execute function public.knowledge_touch_updated_at();

create trigger knowledge_source_objects_touch_updated_at
before update on public.knowledge_source_objects
for each row execute function public.knowledge_touch_updated_at();

create trigger knowledge_items_touch_updated_at
before update on public.knowledge_items
for each row execute function public.knowledge_touch_updated_at();

create trigger knowledge_metric_snapshots_touch_updated_at
before update on public.knowledge_metric_snapshots
for each row execute function public.knowledge_touch_updated_at();

create trigger knowledge_code_artifacts_touch_updated_at
before update on public.knowledge_code_artifacts
for each row execute function public.knowledge_touch_updated_at();

alter table public.knowledge_integrations enable row level security;
alter table public.integration_oauth_states enable row level security;
alter table public.knowledge_sources enable row level security;
alter table public.knowledge_source_checkpoints enable row level security;
alter table public.knowledge_source_objects enable row level security;
alter table public.knowledge_items enable row level security;
alter table public.knowledge_evidence_links enable row level security;
alter table public.knowledge_relations enable row level security;
alter table public.knowledge_metric_snapshots enable row level security;
alter table public.knowledge_code_artifacts enable row level security;
alter table public.knowledge_sync_runs enable row level security;

revoke all on public.knowledge_integrations from anon, authenticated;
revoke all on public.integration_oauth_states from anon, authenticated;
revoke all on public.knowledge_sources from anon, authenticated;
revoke all on public.knowledge_source_checkpoints from anon, authenticated;
revoke all on public.knowledge_source_objects from anon, authenticated;
revoke all on public.knowledge_items from anon, authenticated;
revoke all on public.knowledge_evidence_links from anon, authenticated;
revoke all on public.knowledge_relations from anon, authenticated;
revoke all on public.knowledge_metric_snapshots from anon, authenticated;
revoke all on public.knowledge_code_artifacts from anon, authenticated;
revoke all on public.knowledge_sync_runs from anon, authenticated;

-- 方針:
-- 1. v0.1ではブラウザからSupabaseへ直接アクセスさせない。
-- 2. adminを検証したserver routeだけがservice roleで操作する。
-- 3. service role限定の同期claim/finalize RPCは実装migrationで別途追加する。
-- 4. 本レビューSQLにはseed、OAuth token、既存データbackfillを含めない。

rollback;
