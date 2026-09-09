-- タイミー向けSMSのTwilio配信結果を後から照会するための履歴。
-- service role経由の管理APIだけがアクセスするため、RLSは有効化したままPolicyは追加しない。
create table if not exists public.taimee_sms_send_logs (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid not null references public.taimee_applicants(id) on delete cascade,
  taimee_user_id text not null,
  recipient_phone text not null,
  message_body text not null,
  twilio_message_sid text unique,
  twilio_status text not null default 'queued',
  twilio_error_code text,
  twilio_error_message text,
  sent_at timestamp with time zone not null default now(),
  checked_at timestamp with time zone,
  excluded_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create index if not exists idx_taimee_sms_send_logs_pending
  on public.taimee_sms_send_logs (twilio_status, sent_at desc)
  where excluded_at is null;

create index if not exists idx_taimee_sms_send_logs_applicant
  on public.taimee_sms_send_logs (applicant_id, sent_at desc);

alter table public.taimee_sms_send_logs enable row level security;
