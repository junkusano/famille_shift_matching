-- Sharefullテスト環境で、テンプレート作成を止めた根拠を保存する。
-- 本番のテンプレート・案件テーブルは変更しない。
CREATE TABLE IF NOT EXISTS public.sharefull_rpa_test_content_policy_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint text NOT NULL UNIQUE,
  core_id text NOT NULL,
  source text NOT NULL,
  sharefull_template_id text,
  template_title text,
  source_data jsonb NOT NULL,
  policy_report jsonb NOT NULL,
  status text NOT NULL DEFAULT 'blocked' CHECK (status = 'blocked'),
  notification_error text,
  notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sharefull_rpa_test_content_policy_blocks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sharefull_rpa_test_content_policy_blocks FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.sharefull_rpa_test_content_policy_blocks TO service_role;
