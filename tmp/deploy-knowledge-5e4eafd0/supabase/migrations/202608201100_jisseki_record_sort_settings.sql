-- 実績記録を地域ごとに整理するための設定。地域名・表示名・並び順はすべてDBで管理する。
create table if not exists public.jisseki_record_sort_municipalities (
  id uuid primary key default gen_random_uuid(),
  municipality text not null unique,
  municipality_display_name text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint jisseki_record_sort_municipalities_name_not_blank check (btrim(municipality) <> ''),
  constraint jisseki_record_sort_municipalities_display_name_not_blank check (btrim(municipality_display_name) <> '')
);

create index if not exists jisseki_record_sort_municipalities_active_order_idx
  on public.jisseki_record_sort_municipalities (is_active, sort_order, municipality);

comment on table public.jisseki_record_sort_municipalities is
  '実績記録票の整理記号と並び順に使用する市町村設定。地域固有の値はここに登録する。';

create or replace function public.set_jisseki_record_sort_municipalities_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_jisseki_record_sort_municipalities_updated_at on public.jisseki_record_sort_municipalities;
create trigger set_jisseki_record_sort_municipalities_updated_at
before update on public.jisseki_record_sort_municipalities
for each row execute function public.set_jisseki_record_sort_municipalities_updated_at();

alter table public.jisseki_record_sort_municipalities enable row level security;
drop policy if exists "authenticated users can read jisseki record sort municipalities" on public.jisseki_record_sort_municipalities;
create policy "authenticated users can read jisseki record sort municipalities"
  on public.jisseki_record_sort_municipalities for select to authenticated using (true);
