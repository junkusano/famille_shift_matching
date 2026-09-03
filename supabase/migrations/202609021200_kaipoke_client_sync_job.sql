-- PADのcsIdUpdateをChrome拡張 + famille-rpa-runnerへ移行するジョブ定義。
begin;

alter table public.rpa_job_definitions
  add column if not exists timeout_ms integer
  check (timeout_ms is null or timeout_ms between 1 and 86400000);

insert into public.rpa_job_definitions (
  name,
  job_type,
  execution_mode,
  trigger_type,
  is_enabled,
  timeout_ms,
  schedule,
  payload
)
select
  'カイポケ利用者情報一括同期',
  'kaipoke.client_sync',
  'famille_rpa',
  'schedule',
  false,
  1800000,
  '{"timezone":"Asia/Tokyo","times":[]}'::jsonb,
  '{"dry_run":false}'::jsonb
where not exists (
  select 1 from public.rpa_job_definitions where job_type = 'kaipoke.client_sync'
);

commit;
