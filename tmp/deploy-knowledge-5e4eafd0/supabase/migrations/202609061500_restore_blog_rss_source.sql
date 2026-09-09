begin;

insert into public.knowledge_sources (
  source_key,
  source_type,
  connector_key,
  name,
  description,
  source_url,
  enabled,
  sync_frequency,
  schedule,
  timezone,
  next_run_at,
  default_category,
  default_privacy_level,
  default_publishability,
  config
) values (
  'external-rss',
  'rss',
  'google_sheets',
  'RSS・外部情報',
  '草野思考ナレッジDBのRSS管理シート',
  'https://docs.google.com/spreadsheets/d/1-uWKp4OTYdotXyWSm-P-yJOmnGd3epdg7_0oy3yr3mA/edit?gid=24681012',
  true,
  'hourly',
  '{}'::jsonb,
  'Asia/Tokyo',
  now(),
  '外部情報',
  0,
  'public',
  '{"spreadsheetId":"1-uWKp4OTYdotXyWSm-P-yJOmnGd3epdg7_0oy3yr3mA","sheets":[{"name":"RSS","headerRow":1}],"mode":"rss_index","maxRows":5000}'::jsonb
)
on conflict (source_key) do update set
  connector_key = excluded.connector_key,
  name = excluded.name,
  description = excluded.description,
  source_url = excluded.source_url,
  enabled = true,
  sync_frequency = excluded.sync_frequency,
  timezone = excluded.timezone,
  next_run_at = coalesce(public.knowledge_sources.next_run_at, now()),
  default_category = excluded.default_category,
  default_privacy_level = excluded.default_privacy_level,
  default_publishability = excluded.default_publishability,
  config = excluded.config,
  updated_at = now();

commit;
