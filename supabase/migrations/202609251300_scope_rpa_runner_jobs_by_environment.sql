-- Runner環境ごとにジョブ取得範囲を分離する。
-- 既存Runnerはenvironment未指定のためproductionとして動作する。
alter table public.rpa_runners
  add column if not exists environment text not null default 'production'
  check (environment in ('production', 'test'));

create index if not exists rpa_runners_environment_idx
  on public.rpa_runners (environment, is_active);

create or replace function public.claim_rpa_runner_job(
  p_runner_id text,
  p_runner_environment text
)
returns table (id uuid, job_type text, payload jsonb, timeout_ms integer)
language plpgsql
as $$
begin
  if p_runner_environment not in ('production', 'test') then
    raise exception 'Invalid runner environment';
  end if;

  return query
  with claimed as (
    update public.rpa_runner_jobs as job
       set status = 'claimed', claimed_runner_id = p_runner_id, claimed_at = now()
     where job.id = (
       select candidate.id
         from public.rpa_runner_jobs as candidate
        where candidate.status = 'pending'
          and (candidate.target_runner_id is null or candidate.target_runner_id = p_runner_id)
          and case p_runner_environment
            when 'test' then candidate.payload->>'rpa_mode' = 'test'
            when 'production' then coalesce(candidate.payload->>'rpa_mode', 'production') <> 'test'
          end
        order by candidate.created_at asc
        for update skip locked
        limit 1
     )
     returning job.id, job.job_type, job.payload, job.timeout_ms
  )
  select claimed.id, claimed.job_type, claimed.payload, claimed.timeout_ms from claimed;
end;
$$;

-- 既存の直接呼び出しは本番スコープとして維持する。
create or replace function public.claim_rpa_runner_job(p_runner_id text)
returns table (id uuid, job_type text, payload jsonb, timeout_ms integer)
language sql
as $$
  select * from public.claim_rpa_runner_job(p_runner_id, 'production');
$$;

revoke all on function public.claim_rpa_runner_job(text, text) from public, anon, authenticated;
revoke all on function public.claim_rpa_runner_job(text) from public, anon, authenticated;
grant execute on function public.claim_rpa_runner_job(text, text) to service_role;
grant execute on function public.claim_rpa_runner_job(text) to service_role;
