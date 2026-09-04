-- 健康診断管理からの差し戻し履歴を保存する。
alter table public.wf_request
  add column if not exists health_check_occupational_physician_required boolean not null default false,
  add column if not exists health_check_rejection_reason text,
  add column if not exists health_check_rejected_at timestamptz,
  add column if not exists health_check_rejected_by text;

comment on column public.wf_request.health_check_rejection_reason is
  'Reason why a health-check result was sent back for correction.';
