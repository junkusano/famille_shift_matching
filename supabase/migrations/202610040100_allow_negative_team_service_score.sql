-- 2026-10-01以降のサービス時間点は、前月比がマイナスなら負点になり得る。
-- 旧制度の下限0チェックを、新制度の「上限20点・下限なし」に合わせる。

alter table public.team_monthly_score_summaries
  drop constraint if exists team_monthly_score_summaries_service_score_chk;

alter table public.team_monthly_score_summaries
  add constraint team_monthly_score_summaries_service_score_chk
    check (service_hours_score <= 20);

comment on column public.team_monthly_score_summaries.service_hours_score is
  '前月比10時間につき1点。プラス側は20点上限、マイナス側は下限なし。';

notify pgrst, 'reload schema';
