-- 本番・テストで停止理由を分離して保存する監査テーブル。
-- 本番には検査対象の公開本文のみ保存し、利用者レコード全体は保存しない。
CREATE TABLE IF NOT EXISTS public.sharefull_content_policy_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint text NOT NULL UNIQUE,
  core_id text NOT NULL,
  source text NOT NULL,
  sharefull_template_id text,
  template_title text,
  source_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  policy_report jsonb NOT NULL,
  status text NOT NULL DEFAULT 'blocked' CHECK (status = 'blocked'),
  notification_error text,
  notification_claimed_at timestamptz,
  notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sharefull_content_policy_blocks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sharefull_content_policy_blocks FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.sharefull_content_policy_blocks TO service_role;

COMMENT ON TABLE public.sharefull_content_policy_blocks IS
  'Sharefull本番連携で公開本文の事前検査により停止した事実とLINE WORKS通知状態を記録する。';
