-- Test-only listing state. This deliberately stays in a test-prefixed table
-- even though it is hosted by the production Supabase project.
create table public.sharefull_rpa_test_decision_status (
  request_id uuid primary key,
  sharefull_job_id text not null,
  sharefull_order_id text not null,
  decision_state text not null check (decision_state in ('decided','undecided','unknown')),
  last_checked_at timestamptz not null default now()
);
alter table public.sharefull_rpa_test_decision_status enable row level security;
revoke all on public.sharefull_rpa_test_decision_status from public, anon, authenticated;
grant all on public.sharefull_rpa_test_decision_status to service_role;
comment on table public.sharefull_rpa_test_decision_status is
  'Sharefull応募決定状態のRPA検証用。応募者の個人情報は保存しない。';

create or replace function public.complete_sharefull_decision_check(
  p_job_id uuid, p_runner_id text, p_result jsonb,
  p_is_test boolean default false, p_enable_notifications boolean default true
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  j public.rpa_runner_jobs;
  target jsonb;
  observation jsonb;
  request_uuid uuid;
  state text;
  job_id text;
  order_id text;
  notifications jsonb := '[]'::jsonb;
begin
  if not p_is_test or p_enable_notifications then
    raise exception 'This migration enables test-only decision checks with notifications disabled';
  end if;
  select * into j from public.rpa_runner_jobs
    where id=p_job_id and claimed_runner_id=p_runner_id for update;
  if not found then return null; end if;
  if j.status='completed' then return '[]'::jsonb; end if;
  if j.status<>'claimed' or j.job_type<>'sharefull.check_decision_status'
     or jsonb_typeof(j.payload->'targets')<>'array'
     or jsonb_typeof(p_result->'observations')<>'array'
     or jsonb_array_length(j.payload->'targets')<>jsonb_array_length(p_result->'observations') then
    raise exception 'Invalid Sharefull decision status result';
  end if;
  if (select count(distinct value->>'sharefull_job_id')
      from jsonb_array_elements(p_result->'observations') value)
      <> jsonb_array_length(p_result->'observations') then
    raise exception 'Duplicate Sharefull decision observation';
  end if;

  for observation in select value from jsonb_array_elements(p_result->'observations') loop
    state := observation->>'decision_state';
    job_id := observation->>'sharefull_job_id';
    order_id := observation->>'sharefull_order_id';
    if state is null or state not in ('decided','undecided','unknown') then raise exception 'Invalid decision state'; end if;
    select value into target from jsonb_array_elements(j.payload->'targets') value
      where value->>'sharefull_job_id'=job_id
        and value->>'sharefull_order_id'=order_id
      limit 1;
    if target is null then raise exception 'Decision target mismatch'; end if;
    request_uuid := (target->>'spot_offer_request_id')::uuid;
    if p_is_test and not exists (select 1 from public.sharefull_rpa_test_spot_offer_request_table r
      where r.id=request_uuid and r.sharefull_job_id=job_id and r.sharefull_order_id=order_id
        and r.status='募集中' and r.sharefull_status='published') then
      raise exception 'Test decision target no longer matches published listing';
    elsif not p_is_test and not exists (select 1 from public.spot_offer_request_table r
      where r.id=request_uuid and r.sharefull_job_id=job_id and r.sharefull_order_id=order_id
        and r.status='募集中' and r.sharefull_status='published') then
      raise exception 'Decision target no longer matches published listing';
    end if;

    insert into public.sharefull_rpa_test_decision_status
      (request_id,sharefull_job_id,sharefull_order_id,decision_state,last_checked_at)
    values (request_uuid,job_id,order_id,state,now())
    on conflict (request_id) do update set
      sharefull_job_id=excluded.sharefull_job_id,
      sharefull_order_id=excluded.sharefull_order_id,
      decision_state=excluded.decision_state,
      last_checked_at=excluded.last_checked_at;

    target := null;
  end loop;

  update public.rpa_runner_jobs set status='completed',result=p_result,completed_at=now()
    where id=p_job_id and status='claimed';
  return notifications;
end $$;
revoke all on function public.complete_sharefull_decision_check(uuid,text,jsonb,boolean,boolean) from public,anon,authenticated;
grant execute on function public.complete_sharefull_decision_check(uuid,text,jsonb,boolean,boolean) to service_role;
