-- モニタリングは、有効なメールアドレスがFAX電話帳にあればメールのみで送付できる。
alter table public.monitoring_fax_history
  alter column fax_number drop not null;

alter table public.monitoring_fax_history
  add column if not exists delivery_method text not null default 'fax'
    check (delivery_method in ('fax', 'email')),
  add column if not exists email_address text;
