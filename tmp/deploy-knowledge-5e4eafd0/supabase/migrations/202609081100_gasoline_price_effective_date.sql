-- 距離更新時点で適用する最新の公的ガソリン価格。
create table if not exists public.monthly_gasoline_prices (
  id uuid primary key default gen_random_uuid(),
  target_month date not null,
  prefecture text not null default '愛知県',
  fuel_type text not null default 'レギュラー',
  price_yen_per_liter numeric(10, 2) not null check (price_yen_per_liter >= 0),
  source_name text not null default '資源エネルギー庁 石油製品価格調査',
  source_url text,
  price_basis text not null default 'latest_official_weekly_price_at_distance_update',
  observed_at date,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (target_month, prefecture, fuel_type)
);

alter table public.monthly_gasoline_prices
  add column if not exists price_date date;

update public.monthly_gasoline_prices
set price_date = coalesce(price_date, target_month)
where price_date is null;

alter table public.monthly_gasoline_prices
  alter column price_date set not null;

create index if not exists monthly_gasoline_prices_price_date_idx
  on public.monthly_gasoline_prices (price_date desc);

alter table public.monthly_gasoline_prices enable row level security;

drop policy if exists monthly_gasoline_prices_read on public.monthly_gasoline_prices;
create policy monthly_gasoline_prices_read
  on public.monthly_gasoline_prices
  for select to authenticated
  using (true);

grant select on public.monthly_gasoline_prices to authenticated;
