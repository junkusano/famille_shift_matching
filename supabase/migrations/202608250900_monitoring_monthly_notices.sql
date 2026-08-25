begin;

create table if not exists public.monitoring_monthly_notices (
  id uuid primary key default gen_random_uuid(),
  service_type text not null default 'care_insurance' check (
    service_type in ('care_insurance', 'disability')
  ),
  year_month text not null check (
    year_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
  ),
  body text not null default '',
  created_by text not null,
  updated_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (service_type, year_month)
);

drop trigger if exists monitoring_monthly_notices_set_updated_at
  on public.monitoring_monthly_notices;
create trigger monitoring_monthly_notices_set_updated_at
before update on public.monitoring_monthly_notices
for each row execute function public.monitoring_set_updated_at();

alter table public.monitoring_monthly_notices enable row level security;

comment on table public.monitoring_monthly_notices is
  'モニタリングの「事業所より」に使う月別共通お知らせ。ブラウザからの直接操作は許可せず、権限確認済みのサーバーAPI経由で操作する。';
comment on column public.monitoring_monthly_notices.year_month is '対象年月（YYYY-MM）';

commit;
