-- 会社向けの産業医意見（就業上の措置等）。本人画面には表示しない。
alter table public.wf_request
  add column if not exists health_check_company_opinion text;

comment on column public.wf_request.health_check_company_opinion is
  'Occupational physician opinion for company-side work accommodations; never shown to the applicant.';
