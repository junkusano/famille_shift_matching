-- 月次個人成績の訪問記録締切列を補完し、チーム減点の根拠明細を保存する。

alter table public.staff_monthly_score_summaries
  add column if not exists visit_record_deadline_miss_count integer not null default 0;

alter table public.team_monthly_score_summaries
  add column if not exists jisseki_incomplete_details jsonb not null default '[]'::jsonb,
  add column if not exists visit_record_deadline_miss_details jsonb not null default '[]'::jsonb,
  add column if not exists visit_record_incomplete_details jsonb not null default '[]'::jsonb,
  add column if not exists meeting_incomplete_details jsonb not null default '[]'::jsonb;

comment on column public.team_monthly_score_summaries.jisseki_incomplete_details is
  '実績記録の不備・未回収として減点した利用者、対象月、担当者の明細。';
comment on column public.team_monthly_score_summaries.visit_record_deadline_miss_details is
  '23:43締切未完了として減点したシフト、利用者、提供日、担当者の明細。';
comment on column public.team_monthly_score_summaries.visit_record_incomplete_details is
  '訪問記録の当日未完了として明細表示したシフト、利用者、担当者の一覧。';
comment on column public.team_monthly_score_summaries.meeting_incomplete_details is
  '前月に対象シフトがあり、会議参加・確認がないスタッフの明細。';

notify pgrst, 'reload schema';
