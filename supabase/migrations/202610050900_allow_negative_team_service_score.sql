-- October team scoring allows service-hour decreases to produce a negative score.
-- Remove the legacy non-negative constraint before recalculating October summaries.
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
        conname ilike '%service%score%'
        or pg_get_constraintdef(oid) ilike '%service_hours_score%'
      )
  loop
    execute format(
      'alter table public.team_monthly_score_summaries drop constraint %I',
      constraint_row.conname
    );
  end loop;
end $$;

alter table public.team_monthly_score_summaries
  add constraint team_monthly_score_summaries_service_hours_score_chk
    check (service_hours_score <= 20);

comment on column public.team_monthly_score_summaries.service_hours_score is
  '10月以降はサービス時間の増減を10時間あたり1点で反映し、減少分は下限なしとする。';
