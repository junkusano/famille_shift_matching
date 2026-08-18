create table if not exists public.rpa_page_snapshots (
  id uuid primary key default gen_random_uuid(),
  service text not null,
  page_type text,
  purpose text,
  page_url text,
  page_path text,
  page_title text,
  body_html text,
  body_text text,
  important_dom jsonb not null default '{}'::jsonb,
  scripts jsonb not null default '[]'::jsonb,
  dom_fingerprint text,
  extension_version text,
  manifest_version text,
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days')
);

create table if not exists public.rpa_diagnostics (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid references public.rpa_page_snapshots(id) on delete set null,
  service text not null,
  operation text not null,
  stage text not null,
  error_name text,
  error_message text,
  error_stack text,
  selector text,
  expected_selector text,
  selector_found boolean,
  action text,
  retry_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  capture_type text not null default 'manual' check (capture_type in ('manual', 'error', 'automatic')),
  created_at timestamptz not null default now()
);

create index if not exists rpa_page_snapshots_latest_idx
  on public.rpa_page_snapshots (service, page_type, captured_at desc);
create index if not exists rpa_page_snapshots_expiry_idx
  on public.rpa_page_snapshots (expires_at);
create index if not exists rpa_diagnostics_lookup_idx
  on public.rpa_diagnostics (service, operation, stage, created_at desc);

alter table public.rpa_page_snapshots enable row level security;
alter table public.rpa_diagnostics enable row level security;
