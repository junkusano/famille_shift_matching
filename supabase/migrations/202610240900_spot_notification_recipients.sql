-- 個別受信者は運用DBで管理し、職員IDや本文をコード・共有ログへ保存しない。
create table public.spot_notification_recipients (
  lw_user_id text primary key check (length(lw_user_id) between 1 and 128),
  topics text[] not null check (cardinality(topics)>0 and topics <@ array['sharefull_application','sharefull_content_policy','sharefull_template_review','sharefull_runner_failure']::text[]),
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.spot_notification_deliveries (
  notification_key text not null check (length(notification_key) between 1 and 512),
  destination_type text not null check (destination_type in ('channel','user')),
  destination_id text not null check (length(destination_id) between 1 and 128),
  status text not null default 'pending' check (status in ('pending','sending','sent','uncertain')),
  claimed_at timestamptz,
  sent_at timestamptz,
  error_code text,
  primary key(notification_key,destination_type,destination_id)
);
alter table public.spot_notification_recipients enable row level security;
alter table public.spot_notification_deliveries enable row level security;
revoke all on public.spot_notification_recipients,public.spot_notification_deliveries from public,anon,authenticated;
grant all on public.spot_notification_recipients,public.spot_notification_deliveries to service_role;

create function public.claim_spot_notification_delivery(p_key text,p_type text,p_destination text)
returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.spot_notification_deliveries;
begin
 insert into public.spot_notification_deliveries(notification_key,destination_type,destination_id)
 values(p_key,p_type,p_destination) on conflict do nothing;
 select * into strict d from public.spot_notification_deliveries
 where notification_key=p_key and destination_type=p_type and destination_id=p_destination for update;
 if d.status='sent' then return 'sent'; end if;
 if d.status='uncertain' then return 'uncertain'; end if;
 if d.status='sending' then
   if d.claimed_at < now()-interval '5 minutes' then
     update public.spot_notification_deliveries set status='uncertain',error_code='DELIVERY_OUTCOME_UNKNOWN'
     where notification_key=p_key and destination_type=p_type and destination_id=p_destination;
     return 'uncertain';
   end if;
   return 'busy';
 end if;
 update public.spot_notification_deliveries set status='sending',claimed_at=now(),error_code=null
 where notification_key=p_key and destination_type=p_type and destination_id=p_destination;
 return 'claimed';
end $$;
revoke all on function public.claim_spot_notification_delivery(text,text,text) from public,anon,authenticated;
grant execute on function public.claim_spot_notification_delivery(text,text,text) to service_role;
