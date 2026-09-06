-- WordPressブログ自動化で、アイキャッチと既存カテゴリの自動設定を標準化する。
-- 既存メディアに記事と合う画像がない場合は、OpenAI Image APIで新規生成する。

update public.knowledge_automation_tasks
set
  settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object(
    'wordpress_featured_image', true,
    'wordpress_reuse_media', true,
    'wordpress_auto_category', true,
    'wordpress_category_policy', 'existing-only',
    'wordpress_category_root_slug', 'column',
    'wordpress_media_policy', 'reuse-then-generate',
    'openai_image_model', 'gpt-image-2'
  ),
  updated_at = now()
where task_type = 'wordpress_blog';
