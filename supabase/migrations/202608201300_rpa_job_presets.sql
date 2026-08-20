create table if not exists public.rpa_job_presets (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('kaitek', 'ucare')),
  label text not null,
  office_name text,
  office_id text,
  template_name text,
  template_id text,
  recruiting_id text,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, label)
);

create index if not exists rpa_job_presets_lookup_idx
  on public.rpa_job_presets (provider, is_enabled, label);

alter table public.rpa_job_presets enable row level security;

comment on table public.rpa_job_presets is 'RPAがラベルから外部サービスの事業所・テンプレート・求人IDを解決するための設定';
comment on column public.rpa_job_presets.label is 'RPA画面に表示する人間向けラベル';
comment on column public.rpa_job_presets.recruiting_id is 'RPA内部で使用する外部求人ID。画面には表示しない';
