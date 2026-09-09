-- Re-entry recruitment is intentionally kept separate from form_entries:
-- blacklist is a durable preference, while campaign recipients are immutable audit records.
alter table public.form_entries
  add column if not exists reentry_blacklisted boolean not null default false;

create table if not exists public.reentry_recruitment_settings (
  id boolean primary key default true check (id),
  email_subject text not null,
  email_body text not null,
  sms_body text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid null
);

insert into public.reentry_recruitment_settings (id, email_subject, email_body, sms_body)
values (
  true,
  'ファミーユから再応募のご案内',
  '〇〇さん\n\n以前はファミーユで勤務いただきありがとうございました。\n\n現在ファミーユでは、以前勤務されていた方の再応募を歓迎しています。\n\n働き方や勤務できる時間が以前と変わっていても大丈夫です。\nまたファミーユで働いてみたい、少し話を聞いてみたいという場合は、Re-entryページからお申し込みください。\n\n【Re-entryはこちら】\n{{reentry_url}}\n\nファミーユ ヘルパーサービス',
  'ファミーユです。以前勤務された方へ再応募のご案内です。また働いてみたい方はこちら：{{reentry_url}}'
) on conflict (id) do nothing;

create table if not exists public.reentry_campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.form_entries(id),
  campaign_key uuid not null,
  email text null,
  phone text null,
  email_attempted_at timestamptz null,
  email_status text null check (email_status in ('accepted', 'failed', 'not_attempted')),
  email_error text null,
  sms_fallback_sent_at timestamptz null,
  sms_status text null check (sms_status in ('accepted', 'failed', 'not_sent', 'not_attempted')),
  sms_message_sid text null unique,
  sms_error text null,
  successful_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_key, staff_id)
);

create index if not exists reentry_campaign_recipients_staff_success_idx
  on public.reentry_campaign_recipients (staff_id, successful_at desc nulls last);

-- Uses the authoritative users/levels relationship and aggregates shifts once in PostgreSQL.
create or replace view public.reentry_recruitment_candidates as
select
  f.id as staff_id,
  u.user_id,
  concat_ws(' ', f.last_name_kanji, f.first_name_kanji) as staff_name,
  f.address,
  f.email,
  f.phone,
  f.created_at as entry_created_at,
  coalesce(last_shift.last_shift_date, f.created_at::date) as retirement_date,
  case
    when lower(coalesce(u.system_role, '')) in ('manager', 'admin') then 'manager'
    when level.name = '契約社員' then 'contract'
    else 'other'
  end as staff_kind,
  f.reentry_blacklisted,
  last_invitation.last_reentry_invitation_at
from public.form_entries f
join public.users u on u.entry_id = f.id
left join public.levels level on level.id = u.level_id
left join lateral (
  select max(s.shift_start_date)::date as last_shift_date
  from public.shift s
  where u.user_id in (s.staff_01_user_id, s.staff_02_user_id, s.staff_03_user_id)
) last_shift on true
left join lateral (
  select max(r.successful_at) as last_reentry_invitation_at
  from public.reentry_campaign_recipients r
  where r.staff_id = f.id and r.successful_at is not null
) last_invitation on true
where u.status = 'removed_from_lineworks_kaipoke';

grant select on public.reentry_recruitment_candidates to authenticated;
