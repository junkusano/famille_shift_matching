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
  'kusano-thought-log',
  'conversation',
  'google_sheets',
  '草野思考ログ',
  '草野思考ナレッジDBの思考ログ。ブログでは非公開の編集視点としてのみ使用する。',
  'https://docs.google.com/spreadsheets/d/1-uWKp4OTYdotXyWSm-P-yJOmnGd3epdg7_0oy3yr3mA/edit',
  true,
  'daily',
  '{"time":"06:30"}'::jsonb,
  'Asia/Tokyo',
  now(),
  '草野思考',
  1,
  'internal_only',
  '{"spreadsheetId":"1-uWKp4OTYdotXyWSm-P-yJOmnGd3epdg7_0oy3yr3mA","sheets":[{"name":"思考ログ","headerRow":1}],"mode":"thought_log","maxRows":2000}'::jsonb
)
on conflict (source_key) do update set
  connector_key = excluded.connector_key,
  name = excluded.name,
  description = excluded.description,
  source_url = excluded.source_url,
  enabled = true,
  sync_frequency = excluded.sync_frequency,
  schedule = excluded.schedule,
  timezone = excluded.timezone,
  next_run_at = coalesce(public.knowledge_sources.next_run_at, now()),
  default_category = excluded.default_category,
  default_privacy_level = excluded.default_privacy_level,
  default_publishability = excluded.default_publishability,
  config = excluded.config,
  updated_at = now();

update public.knowledge_source_objects as objects
set processing_status = 'ignored',
    updated_at = now()
from public.knowledge_sources as sources
where objects.source_id = sources.id
  and sources.source_key = 'external-rss'
  and objects.object_type = 'sheet_article';

insert into public.knowledge_source_checkpoints (source_id, cursor, cursor_version, updated_at)
select id, '{}'::jsonb, 0, now()
from public.knowledge_sources
where source_key in ('external-rss', 'kusano-thought-log')
on conflict (source_id) do update set
  cursor = '{}'::jsonb,
  cursor_version = public.knowledge_source_checkpoints.cursor_version + 1,
  updated_at = now();

update public.knowledge_automation_tasks
set description = '直近の外部ニュース・公式発表を起点に、関連する草野思考ログの独自論点を一つ組み合わせ、読者に新しい視点が残る経営コラムを作る。草野ナレッジ等の内部URLは記事へ掲載しない。',
    condition_summary = '具体的な外部公開情報と記事化候補「高」の草野思考が結び付く場合だけ作成する。監視先だけ、一般論だけ、公開可能な外部根拠がない場合は作成しない。',
    settings = coalesce(settings, '{}'::jsonb) || '{"article_policy_version":"geo-editorial-v2","public_sources_only":true,"internal_knowledge_links":false,"require_original_viewpoint":true,"allow_external_ai_context":false}'::jsonb,
    updated_at = now()
where task_type = 'wordpress_blog';

commit;
