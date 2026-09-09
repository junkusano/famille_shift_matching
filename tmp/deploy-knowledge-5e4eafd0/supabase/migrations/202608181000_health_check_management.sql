-- Health-check facts stay on the workflow request because the workflow is the source record.
-- New metadata is separate for the two independent review workflows.
alter table public.wf_request
  add column if not exists health_check_occupational_physician_checked boolean not null default false,
  add column if not exists health_check_occupational_physician_checked_at timestamptz,
  add column if not exists health_check_occupational_physician_checked_by text,
  add column if not exists health_check_admin_checked boolean not null default false,
  add column if not exists health_check_admin_checked_at timestamptz,
  add column if not exists health_check_admin_checked_by text;

comment on column public.wf_request.health_check_occupational_physician_checked is 'Independent occupational physician review flag for health-check workflow requests.';
comment on column public.wf_request.health_check_admin_checked is 'Independent administrative review flag for health-check workflow requests.';

create index if not exists wf_request_health_check_applicant_status_idx
  on public.wf_request (request_type_id, applicant_user_id, status);
