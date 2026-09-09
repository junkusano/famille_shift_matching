-- 共通駐車場所・ピックアップ表示を追加する。
alter table public.parking_cs_places
  add column if not exists is_pickup boolean not null default false;

-- 特定の利用者に属さない共通駐車場所を許可する。
alter table public.parking_cs_places
  alter column kaipoke_cs_id drop not null;
