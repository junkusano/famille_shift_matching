-- service_roleからのみRunner APIがclaim関数を実行する。
grant execute on function public.claim_rpa_runner_job(text) to service_role;
