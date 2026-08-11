-- 障害サービス受給者証の更新が自治体都合などで翌月に間に合わない場合の
-- 一時的なペナルティ除外。通知処理が翌々月の1日以降に自動解除する。
alter table public.cs_kaipoke_info
  add column if not exists shogai_jukyusha_penalty_exempt boolean not null default false,
  add column if not exists shogai_jukyusha_penalty_exempt_at timestamptz null;

comment on column public.cs_kaipoke_info.shogai_jukyusha_penalty_exempt is
  '障害受給者証の更新翌月ペナルティを一時的に除外するフラグ。翌々月に通知cronが自動解除する。';
