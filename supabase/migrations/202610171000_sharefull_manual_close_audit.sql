create table public.sharefull_manual_close_audit (
  event_id uuid primary key,
  sharefull_order_id text not null unique
    check (sharefull_order_id ~ '^[1-9][0-9]{0,31}$'),
  sharefull_job_id text not null
    check (sharefull_job_id ~ '^[1-9][0-9]{0,31}$'),
  operator_auth_user_id uuid not null,
  confirmation_source text not null
    check (confirmation_source = 'sharefull_ui_confirmed'),
  received_at timestamptz not null default now()
);

create index sharefull_manual_close_audit_received_idx
  on public.sharefull_manual_close_audit (received_at desc);

alter table public.sharefull_manual_close_audit enable row level security;
revoke all on public.sharefull_manual_close_audit from anon, authenticated;
grant all on public.sharefull_manual_close_audit to service_role;
