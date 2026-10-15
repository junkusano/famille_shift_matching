-- Pseudonymous, first-party recruitment metrics. No applicant IDs, form values,
-- IP addresses, user agents, query strings or full referrers are stored.
create table public.recruitment_journey_events (
  journey_id uuid not null,
  event text not null check (event in ('page_view','cta_click','form_start','validation_error','submit_attempt','submit_error','submit_success','existing_applicant')),
  page text not null check (page in ('myfamille_lp','recruiting_lp','entry')),
  source text not null check (source in ('myfamille_lp','recruiting_lp','shi_on_content','direct_unknown')),
  placement text not null default 'body' check (placement in ('top','bottom','body')),
  created_at timestamptz not null default now(),
  primary key (journey_id,event,page,placement)
);
create index recruitment_journey_events_created_idx on public.recruitment_journey_events(created_at);
alter table public.recruitment_journey_events enable row level security;
revoke all on public.recruitment_journey_events from anon, authenticated;
grant select, insert, delete on public.recruitment_journey_events to service_role;

create function public.recruitment_journey_summary(p_from timestamptz, p_until timestamptz)
returns table(source text, page text, event text, placement text, journeys bigint)
language sql stable security definer set search_path = public
as $$
  select source,page,event,placement,count(distinct journey_id)
  from public.recruitment_journey_events
  where created_at >= p_from and created_at < p_until
  group by source,page,event,placement
  order by source,page,event,placement;
$$;
revoke all on function public.recruitment_journey_summary(timestamptz,timestamptz) from public;
grant execute on function public.recruitment_journey_summary(timestamptz,timestamptz) to service_role;
comment on table public.recruitment_journey_events is '採用導線の段階別計測。30分単位のブラウザ内識別子。本人・応募情報とは結合しない。180日で削除。';
