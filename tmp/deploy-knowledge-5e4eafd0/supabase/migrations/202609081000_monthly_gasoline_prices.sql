-- 月別の公的ガソリン単価。
-- 資源エネルギー庁の愛知県・レギュラーガソリン価格を月単位で保存する。
create table if not exists public.monthly_gasoline_prices (
  id uuid primary key default gen_random_uuid(),
  target_month date not null,
  prefecture text not null default '愛知県',
  fuel_type text not null default 'レギュラー',
  price_yen_per_liter numeric(10, 2) not null check (price_yen_per_liter >= 0),
  source_name text not null default '資源エネルギー庁 石油製品価格調査',
  source_url text,
  price_basis text not null default 'monthly_average',
  observed_at date,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (target_month, prefecture, fuel_type)
);

create index if not exists monthly_gasoline_prices_month_idx
  on public.monthly_gasoline_prices (target_month desc);

alter table public.monthly_gasoline_prices enable row level security;

drop policy if exists monthly_gasoline_prices_read on public.monthly_gasoline_prices;
create policy monthly_gasoline_prices_read
  on public.monthly_gasoline_prices
  for select to authenticated
  using (true);

grant select on public.monthly_gasoline_prices to authenticated;
