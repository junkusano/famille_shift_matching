-- 公式サイトの集計データを、個人単位ではなく内部ナレッジとして毎日取得する。
-- 認証情報はknowledge_sources.configへ保存しない。

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
  default_category,
  default_privacy_level,
  default_publishability,
  config
)
values
  (
    'google-analytics-website',
    'google_analytics',
    'google_analytics',
    'Google Analytics（公式サイト）',
    'www.shi-on.netのアクセス数・利用者数・閲覧数・上位ページを毎日取得します。個人単位のデータは保存しません。',
    'https://analytics.google.com/analytics/web/',
    false,
    'daily',
    '{"time":"07:10"}'::jsonb,
    'Asia/Tokyo',
    'Web・広報',
    1,
    'internal_only',
    '{"propertyId":"","lookbackDays":28,"siteUrl":"https://www.shi-on.net/","credentialSecretName":"google_service_account_key"}'::jsonb
  ),
  (
    'microsoft-clarity-website',
    'microsoft_clarity',
    'microsoft_clarity',
    'Microsoft Clarity（公式サイト）',
    'www.shi-on.netの直近3日間の行動傾向・上位ページ・Rage Click等を毎日取得します。個別セッションや録画は保存しません。',
    'https://clarity.microsoft.com/',
    false,
    'daily',
    '{"time":"07:20"}'::jsonb,
    'Asia/Tokyo',
    'Web・広報',
    1,
    'internal_only',
    '{"numOfDays":3,"dimensions":["URL"],"siteUrl":"https://www.shi-on.net/","tokenSecretName":"clarity_data_export_api_token"}'::jsonb
  )
on conflict (source_key) do update set
  source_type = excluded.source_type,
  connector_key = excluded.connector_key,
  name = excluded.name,
  description = excluded.description,
  source_url = excluded.source_url,
  schedule = excluded.schedule,
  timezone = excluded.timezone,
  default_category = excluded.default_category,
  default_privacy_level = excluded.default_privacy_level,
  default_publishability = excluded.default_publishability,
  config = excluded.config || public.knowledge_sources.config,
  updated_at = now();

insert into public.knowledge_source_checkpoints (source_id)
select id
from public.knowledge_sources
where source_key in ('google-analytics-website', 'microsoft-clarity-website')
on conflict (source_id) do nothing;
