-- 2026-10-01正式適用のチーム成績・新バッジ制度。
-- 既存のteam_monthly_score_summariesは旧集計列を残したまま拡張する。

alter table public.staff_monthly_score_summaries
  add column if not exists team_orgunitid text null references public.orgs(orgunitid),
  add column if not exists individual_score integer not null default 0,
  add column if not exists team_score integer not null default 0,
  add column if not exists official_total_score integer not null default 0,
  add column if not exists projected_total_score integer not null default 0,
  add column if not exists projected_medal_rank text not null default 'ブロンズ';

-- Existing months keep their current official score until explicitly recalculated.
update public.staff_monthly_score_summaries
set individual_score = total_score,
    team_score = 0,
    official_total_score = total_score,
    projected_total_score = total_score,
    projected_medal_rank = case
      when total_score >= 170 then 'アダマンタイト'
      when total_score >= 150 then 'オリハルコン'
      when total_score >= 130 then 'ミスリル'
      when total_score >= 110 then 'プラチナ'
      when total_score >= 90 then 'ゴールド'
      when total_score >= 70 then 'シルバー'
      else 'ブロンズ'
    end;

alter table public.team_monthly_score_summaries
  add column if not exists team_name text null,
  add column if not exists service_hours numeric(10,1) not null default 0,
  add column if not exists previous_month_service_hours numeric(10,1) not null default 0,
  add column if not exists jisseki_total_count integer not null default 0,
  add column if not exists jisseki_incomplete_count integer not null default 0,
  add column if not exists visit_record_total_count integer not null default 0,
  add column if not exists visit_record_deadline_miss_count integer not null default 0,
  add column if not exists team_score integer not null default 0;

-- orgunitid is the existing team key. Preserve the existing unique key if present.
create unique index if not exists team_monthly_score_summaries_target_org_unique
  on public.team_monthly_score_summaries(target_month, orgunitid);

-- Replace only CHECK constraints that validate medal_rank values; retain all other checks.
do $$
declare
  constraint_row record;
begin
  for constraint_row in
    select conname
    from pg_constraint
    where conrelid = 'public.staff_monthly_score_summaries'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%medal_rank%'
  loop
    execute format(
      'alter table public.staff_monthly_score_summaries drop constraint %I',
      constraint_row.conname
    );
  end loop;
end $$;

alter table public.staff_monthly_score_summaries
  add constraint staff_monthly_score_summaries_medal_rank_check
    check (medal_rank in ('ブロンズ', 'シルバー', 'ゴールド', 'プラチナ', 'ミスリル', 'オリハルコン', 'アダマンタイト')),
  add constraint staff_monthly_score_summaries_projected_medal_rank_check
    check (projected_medal_rank in ('ブロンズ', 'シルバー', 'ゴールド', 'プラチナ', 'ミスリル', 'オリハルコン', 'アダマンタイト'));

comment on column public.staff_monthly_score_summaries.team_orgunitid is
  '月次集計時点の所属チームスナップショット。再計算時は既存値を優先する。';
comment on column public.staff_monthly_score_summaries.individual_score is
  'チーム成績を含まない個人成績。';
comment on column public.staff_monthly_score_summaries.team_score is
  'team_orgunitidに対応する当月チーム成績。';
comment on column public.staff_monthly_score_summaries.official_total_score is
  'target_month時点で正式適用される総合点。total_scoreと同値。';
comment on column public.staff_monthly_score_summaries.projected_total_score is
  '個人成績とチーム成績を合算した新制度総合点。';
