-- 2026-10-01以降のチーム成績に、訪問記録の過去未入力と
-- 障害福祉の受給者証・プラン更新未対応の内訳を保存する。

alter table public.team_monthly_score_summaries
  add column if not exists visit_record_past_incomplete_count integer not null default 0,
  add column if not exists visit_record_past_incomplete_details jsonb not null default '[]'::jsonb,
  add column if not exists renewal_incomplete_count integer not null default 0,
  add column if not exists renewal_incomplete_details jsonb not null default '[]'::jsonb,
  add column if not exists renewal_score integer not null default 0;

comment on column public.team_monthly_score_summaries.visit_record_past_incomplete_count is
  '集計時点で未入力のまま残る前月以前の訪問記録件数。2026-10以降は1件-5点。';
comment on column public.team_monthly_score_summaries.visit_record_past_incomplete_details is
  '前月以前から未入力の訪問記録について、利用者・サービス日・担当者を保存した明細。';
comment on column public.team_monthly_score_summaries.renewal_incomplete_count is
  '猶予月末を過ぎても未対応の障害福祉受給者証・プラン・短期目標の利用者件数。';
comment on column public.team_monthly_score_summaries.renewal_incomplete_details is
  '受給者証・プラン・短期目標の期限切れ理由と利用者の明細。介護保険は含まない。';
comment on column public.team_monthly_score_summaries.renewal_score is
  '2026-10以降、更新未対応の利用者1件につき-5点。下限なし。';

notify pgrst, 'reload schema';
