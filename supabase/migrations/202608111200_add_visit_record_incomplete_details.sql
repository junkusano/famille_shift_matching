alter table public.team_monthly_score_summaries
  add column if not exists visit_record_incomplete_details jsonb not null default '[]'::jsonb;

comment on column public.team_monthly_score_summaries.visit_record_incomplete_details is
  '訪問記録の当日未完了として明細表示したシフト、利用者、担当者の一覧。';

notify pgrst, 'reload schema';
