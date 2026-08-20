-- Google Maps の道路距離を、住所ハッシュ単位で再利用するための永続キャッシュ。
create table if not exists public.google_maps_distance_cache (
  id uuid primary key default gen_random_uuid(),
  origin_address text not null,
  destination_address text not null,
  origin_address_hash text not null,
  destination_address_hash text not null,
  distance_meters integer,
  duration_seconds integer,
  status text not null default 'pending' check (status in ('pending', 'success', 'error')),
  last_error text,
  calculated_at timestamptz,
  retry_after timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (origin_address_hash, destination_address_hash)
);

create table if not exists public.manager_distance_segments (
  id uuid primary key default gen_random_uuid(),
  shift_id bigint not null,
  staff_user_id text not null,
  segment_date date not null,
  segment_kind text not null default 'home_to_client',
  origin_address text not null,
  destination_address text not null,
  origin_address_hash text not null,
  destination_address_hash text not null,
  distance_cache_id uuid references public.google_maps_distance_cache(id),
  status text not null default 'pending' check (status in ('pending', 'success', 'error')),
  distance_meters integer,
  duration_seconds integer,
  last_error text,
  calculated_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (shift_id, staff_user_id, segment_kind)
);

create table if not exists public.google_maps_distance_cron_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  trigger_type text not null check (trigger_type in ('cron', 'manual')),
  status text not null default 'running' check (status in ('running', 'success', 'partial', 'failed')),
  target_shift_count integer not null default 0,
  target_segment_count integer not null default 0,
  cache_hit_count integer not null default 0,
  google_maps_request_count integer not null default 0,
  success_count integer not null default 0,
  failure_count integer not null default 0,
  recalculated_staff_count integer not null default 0,
  skipped_by_limit_count integer not null default 0,
  processing_time_ms integer,
  error_message text,
  created_by text
);

create index if not exists manager_distance_segments_date_idx
  on public.manager_distance_segments (segment_date, staff_user_id);
create index if not exists manager_distance_segments_status_idx
  on public.manager_distance_segments (status, updated_at);
create index if not exists google_maps_distance_cron_runs_started_idx
  on public.google_maps_distance_cron_runs (started_at desc);

-- 既存ビューは bigint 型のため変更せず、Google Maps距離専用ビューを追加する。
do $$
begin
  if to_regclass('public.manager_monthly_google_maps_distance_view') is null then
    execute $view$
      create view public.manager_monthly_google_maps_distance_view as
      select
        date_trunc('month', s.segment_date)::date as target_month,
        s.staff_user_id as user_id,
        concat_ws(' ', fe.last_name_kanji, fe.first_name_kanji) as staff_name,
        count(distinct s.segment_date)::integer as work_day_count,
        count(*)::integer as movement_segment_count,
        round((sum(s.distance_meters)::numeric / 1000), 1) as monthly_distance_index,
        max(s.calculated_at) as last_updated_at
      from public.manager_distance_segments s
      left join public.users u on u.user_id = s.staff_user_id
      left join public.form_entries fe on fe.id = u.entry_id
      where s.status = 'success' and s.distance_meters is not null
      group by date_trunc('month', s.segment_date)::date, s.staff_user_id,
        concat_ws(' ', fe.last_name_kanji, fe.first_name_kanji)
    $view$;
  end if;
end $$;

grant select on public.manager_monthly_google_maps_distance_view to authenticated;

alter table public.google_maps_distance_cache enable row level security;
alter table public.manager_distance_segments enable row level security;
alter table public.google_maps_distance_cron_runs enable row level security;

drop policy if exists google_maps_distance_cache_read on public.google_maps_distance_cache;
create policy google_maps_distance_cache_read on public.google_maps_distance_cache
  for select to authenticated using (true);
drop policy if exists manager_distance_segments_read on public.manager_distance_segments;
create policy manager_distance_segments_read on public.manager_distance_segments
  for select to authenticated using (true);
drop policy if exists google_maps_distance_cron_runs_read on public.google_maps_distance_cron_runs;
create policy google_maps_distance_cron_runs_read on public.google_maps_distance_cron_runs
  for select to authenticated using (true);
