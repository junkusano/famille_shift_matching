-- チーム成績に会議参加を追加する。
-- 会議点は基礎10点から、前月会議の不参加・未確認1名につき1点減点する。

alter table public.team_monthly_score_summaries
  add column if not exists meeting_member_count integer not null default 0,
  add column if not exists meeting_attended_count integer not null default 0,
  add column if not exists meeting_incomplete_count integer not null default 0,
  add column if not exists meeting_score integer not null default 0;

comment on column public.team_monthly_score_summaries.meeting_member_count is
  'チーム成績の対象となる会議参加メンバー数。';
comment on column public.team_monthly_score_summaries.meeting_attended_count is
  '前月会議の参加・確認済み人数。';
comment on column public.team_monthly_score_summaries.meeting_incomplete_count is
  '前月会議の不参加・未確認人数。';
comment on column public.team_monthly_score_summaries.meeting_score is
  '会議チーム点。基礎10点から不参加・未確認1名につき1点減点。';
