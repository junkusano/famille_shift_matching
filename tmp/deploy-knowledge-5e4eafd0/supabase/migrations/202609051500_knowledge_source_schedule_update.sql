begin;

-- 請求管理表はキャッシュ管理にも使うため、毎週日曜の定期確認へ変更する。
update public.knowledge_sources
set
  sync_frequency = 'weekly',
  schedule = '{"dayOfWeek":0,"time":"07:00"}'::jsonb,
  next_run_at = null,
  updated_at = now()
where source_key = 'billing-management';

-- Money ForwardはOAuth接続後に日次確認を開始する。未接続の間は有効化しない。
update public.knowledge_sources
set
  sync_frequency = 'daily',
  schedule = '{"time":"07:15"}'::jsonb,
  next_run_at = null,
  updated_at = now()
where source_key = 'moneyforward-accounting';

commit;
