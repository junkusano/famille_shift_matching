-- チーム実績・訪問記録は、不備数によって0点未満になり得る。
-- 既存テーブルに残っている下限0のCHECK制約を、新制度の計算規則へ合わせる。

do $$
declare
  constraint_row record;
begin
  for constraint_row in
    select conname
    from pg_constraint
    where conrelid = 'public.team_monthly_score_summaries'::regclass
      and contype = 'c'
      and (
        pg_get_constraintdef(oid) ilike '%jisseki_score%'
        or pg_get_constraintdef(oid) ilike '%visit_record_score%'
        or pg_get_constraintdef(oid) ilike '%meeting_score%'
        or pg_get_constraintdef(oid) ilike '%team_score%'
        or pg_get_constraintdef(oid) ilike '%total_score%'
      )
  loop
    execute format(
      'alter table public.team_monthly_score_summaries drop constraint %I',
      constraint_row.conname
    );
  end loop;
end $$;

alter table public.team_monthly_score_summaries
  add constraint team_monthly_score_summaries_jisseki_score_chk
    check (jisseki_score <= 20),
  add constraint team_monthly_score_summaries_visit_record_score_chk
    check (visit_record_score <= 20),
  add constraint team_monthly_score_summaries_meeting_score_chk
    check (meeting_score <= 10),
  add constraint team_monthly_score_summaries_team_score_chk
    check (team_score <= 70),
  add constraint team_monthly_score_summaries_total_score_chk
    check (total_score <= 70);

comment on column public.team_monthly_score_summaries.jisseki_score is
  '20点から不備・未完了1件につき1点減点。下限なし。';
comment on column public.team_monthly_score_summaries.visit_record_score is
  '20点から23:43締切未完了サービス1件につき1点減点。下限なし。';
comment on column public.team_monthly_score_summaries.meeting_score is
  '10点から不参加・未確認1名につき1点減点。下限なし。';
comment on column public.team_monthly_score_summaries.team_score is
  'サービス時間・実績記録・訪問記録・会議の合計。下限なし、上限70点。';
