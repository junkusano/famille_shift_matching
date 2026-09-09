-- 媒体は行で追加する。ジモティ等の追加で応募者カラムを増やさない。
create table if not exists public.spot_offer_providers (
  code text primary key check (code ~ '^[a-z][a-z0-9_-]*$'),
  display_name text not null
);
insert into public.spot_offer_providers values ('taimee','タイミー'),('sharefull','シェアフル'),('jmty','ジモティ') on conflict do nothing;
alter table public.spot_offer_providers enable row level security;
grant select on public.spot_offer_providers to authenticated;
create policy spot_provider_read on public.spot_offer_providers for select to authenticated using (true);

alter table public.spot_offer_request_table
  add column if not exists sharefull_order_id text,
  add column if not exists applicant_source text,
  add column if not exists application_state text,
  add column if not exists application_conflict boolean not null default false,
  add column if not exists recruitment_paused boolean not null default false,
  add column if not exists recruitment_revision bigint not null default 0,
  add column if not exists sharefull_sync_error text;

create table public.spot_offer_applications (
  request_id uuid not null references public.spot_offer_request_table(id) on delete cascade,
  provider text not null references public.spot_offer_providers(code),
  application_key text not null,
  state text not null check (state in ('applied','confirmed','cancelled')),
  applicant_name text, applicant_sex text, applicant_control_url text,
  occurred_at timestamptz not null,
  primary key(request_id,provider,application_key)
);
create table public.spot_offer_application_events (
  provider text not null references public.spot_offer_providers(code),
  event_id text not null,
  request_id uuid not null references public.spot_offer_request_table(id) on delete cascade,
  received_at timestamptz not null default now(),
  primary key(provider,event_id)
);
alter table public.spot_offer_applications enable row level security;
alter table public.spot_offer_application_events enable row level security;
-- 応募情報は既存の認証付きシフトビューを通して公開する。
revoke all on public.spot_offer_applications,public.spot_offer_application_events from anon,authenticated;
grant all on public.spot_offer_applications,public.spot_offer_application_events,public.spot_offer_providers to service_role;

-- 既存の確定はタイミー由来。名前等を変更せずバックフィルする。
insert into public.spot_offer_applications(request_id,provider,application_key,state,applicant_name,applicant_sex,applicant_control_url,occurred_at)
select id,'taimee','legacy','confirmed',applicant_name,applicant_sex,applicant_control_url,coalesce(updated_at,created_at,now())
from public.spot_offer_request_table where status='確定';
update public.spot_offer_request_table set applicant_source='taimee',application_state='confirmed' where status='確定';

create function public.record_spot_offer_application(
  p_request_id uuid,p_provider text,p_application_key text,p_event_id text,
  p_state text,p_occurred_at timestamptz,p_name text default null,p_sex text default null,p_url text default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare chosen public.spot_offer_applications; active_count integer; inserted_count integer;
begin
  if p_state not in ('applied','confirmed','cancelled') or nullif(p_application_key,'') is null or nullif(p_event_id,'') is null or p_occurred_at is null then raise exception 'Invalid application event'; end if;
  perform 1 from public.spot_offer_request_table where id=p_request_id for update;
  if not found then raise exception 'Request not found'; end if;
  insert into public.spot_offer_application_events(provider,event_id,request_id) values(p_provider,p_event_id,p_request_id) on conflict do nothing;
  get diagnostics inserted_count = row_count;
  if inserted_count=0 then return jsonb_build_object('duplicate',true); end if;
  insert into public.spot_offer_applications as a(request_id,provider,application_key,state,applicant_name,applicant_sex,applicant_control_url,occurred_at)
  values(p_request_id,p_provider,p_application_key,p_state,p_name,p_sex,p_url,p_occurred_at)
  on conflict(request_id,provider,application_key) do update set state=excluded.state,applicant_name=excluded.applicant_name,applicant_sex=excluded.applicant_sex,applicant_control_url=excluded.applicant_control_url,occurred_at=excluded.occurred_at
  where excluded.occurred_at > a.occurred_at;
  get diagnostics inserted_count = row_count;
  if inserted_count=0 then return jsonb_build_object('stale',true); end if;
  select count(*) into active_count from public.spot_offer_applications where request_id=p_request_id and state in ('applied','confirmed');
  select * into chosen from public.spot_offer_applications where request_id=p_request_id and state in ('applied','confirmed') order by occurred_at,provider,application_key limit 1;
  update public.spot_offer_request_table set
    status=case when active_count>0 then '確定' when recruitment_paused then '募集なし' else '募集中' end,
    applicant_name=chosen.applicant_name,applicant_sex=chosen.applicant_sex,applicant_control_url=chosen.applicant_control_url,
    applicant_source=chosen.provider,application_state=chosen.state,application_conflict=active_count>1,
    recruitment_revision=recruitment_revision+1,updated_at=now()
  where id=p_request_id;
  return jsonb_build_object('ok',true,'active_count',active_count,'conflict',active_count>1);
end $$;
revoke all on function public.record_spot_offer_application(uuid,text,text,text,text,timestamptz,text,text,text) from public,anon,authenticated;
grant execute on function public.record_spot_offer_application(uuid,text,text,text,text,timestamptz,text,text,text) to service_role;

-- PADの停止結果が共通statusを募集なしにしても、他媒体の応募を消さない。
create function public.protect_spot_application_projection() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare chosen public.spot_offer_applications; n integer;
begin
  select count(*) into n from public.spot_offer_applications where request_id=new.id and state in ('applied','confirmed');
  if n>0 then
    select * into chosen from public.spot_offer_applications where request_id=new.id and state in ('applied','confirmed') order by occurred_at,provider,application_key limit 1;
    new.status='確定';new.applicant_name=chosen.applicant_name;new.applicant_sex=chosen.applicant_sex;new.applicant_control_url=chosen.applicant_control_url;
    new.applicant_source=chosen.provider;new.application_state=chosen.state;new.application_conflict=n>1;
  end if;
  return new;
end $$;
create trigger protect_spot_application_projection before update on public.spot_offer_request_table for each row execute function public.protect_spot_application_projection();
revoke all on function public.protect_spot_application_projection() from public,anon,authenticated;

-- 同時に走るCronでも同じ指示を二重登録しない。既存ジョブには影響させない。
create unique index rpa_spot_sync_runner_operation on public.rpa_runner_jobs((payload->>'sync_operation_key')) where payload->>'sync_operation_key' is not null;
create unique index rpa_spot_sync_pad_operation on public.rpa_command_requests((request_details->>'sync_operation_key')) where request_details->>'sync_operation_key' is not null;
create table public.spot_offer_publication_history (
 request_id uuid not null references public.spot_offer_request_table(id) on delete cascade,
 provider text not null references public.spot_offer_providers(code),
 job_id text not null, management_id text, state text not null,
 updated_at timestamptz not null default now(),
 primary key(request_id,provider,job_id)
);
alter table public.spot_offer_publication_history enable row level security;
revoke all on public.spot_offer_publication_history from anon,authenticated;
grant all on public.spot_offer_publication_history to service_role;
create function public.complete_sharefull_sync_job(p_job_id uuid,p_runner_id text,p_result jsonb)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare j public.rpa_runner_jobs; v_request_id uuid; v_job_id text; v_order_id text;
begin
 select * into j from public.rpa_runner_jobs where id=p_job_id and claimed_runner_id=p_runner_id for update;
 if not found then return false; end if;
 if j.status='completed' then return true; end if;
 if j.status<>'claimed' or j.job_type not in ('sharefull.create_spot_offer','sharefull.close_spot_offer') then return false; end if;
 v_request_id=(j.payload->>'spot_offer_request_id')::uuid;
 v_job_id=p_result->>'sharefull_job_id'; v_order_id=p_result->>'sharefull_order_id';
 if j.job_type='sharefull.close_spot_offer' then
   if p_result->>'closed' is distinct from 'true' or v_job_id is distinct from j.payload->>'sharefull_job_id' or v_order_id is distinct from j.payload->>'sharefull_order_id' then raise exception 'Close identity mismatch'; end if;
   insert into public.spot_offer_publication_history values(v_request_id,'sharefull',v_job_id,v_order_id,'closed',now()) on conflict(request_id,provider,job_id) do update set state='closed',updated_at=now();
   update public.spot_offer_request_table set sharefull_status='closed',sharefull_sync_error=null where id=v_request_id and sharefull_job_id=v_job_id and sharefull_order_id=v_order_id;
 elsif j.payload->>'execution_mode'='publish' then
   if v_job_id is null or v_job_id !~ '^[0-9]+$' then raise exception 'Published job ID missing'; end if;
   insert into public.spot_offer_publication_history values(v_request_id,'sharefull',v_job_id,v_order_id,'published',now()) on conflict(request_id,provider,job_id) do update set management_id=excluded.management_id,state='published',updated_at=now();
   update public.spot_offer_request_table set sharefull_job_id=v_job_id,sharefull_order_id=v_order_id,sharefull_status='published',sharefull_sync_error=case when v_order_id is null then 'URL管理番号が未取得です' else null end
     where id=v_request_id and (sharefull_job_id is null or sharefull_job_id=v_job_id);
   if not found then raise exception 'A different publication already exists'; end if;
 end if;
 update public.rpa_runner_jobs set status='completed',result=p_result,completed_at=now() where id=p_job_id;
 return true;
end $$;
revoke all on function public.complete_sharefull_sync_job(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.complete_sharefull_sync_job(uuid,text,jsonb) to service_role;
-- 元のカラム順・型・既存のフィルターを保ち、表示情報を末尾に追加する。
do $$
declare definition text;
begin
 select pg_get_viewdef('public.shift_self_coordinate_card_view2'::regclass,true) into definition;
 if position('s.applicant_control_url' in definition)=0 then raise exception 'Unexpected shift view definition'; end if;
 definition=regexp_replace(definition,'s.applicant_control_url\s+FROM','s.applicant_control_url, s.applicant_source, s.application_state, s.application_conflict FROM');
 execute 'create or replace view public.shift_self_coordinate_card_view2 as ' || definition;
end $$;
