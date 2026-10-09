-- Non-blocking findings (automatic brand replacement and flagged recruiting text)
-- are persisted alongside any historical blocked rows.
ALTER TABLE public.sharefull_content_policy_blocks
  DROP CONSTRAINT IF EXISTS sharefull_content_policy_blocks_status_check;
ALTER TABLE public.sharefull_content_policy_blocks
  ADD CONSTRAINT sharefull_content_policy_blocks_status_check
  CHECK (status IN ('blocked', 'recorded'));

ALTER TABLE public.sharefull_rpa_test_content_policy_blocks
  DROP CONSTRAINT IF EXISTS sharefull_rpa_test_content_policy_blocks_status_check;
ALTER TABLE public.sharefull_rpa_test_content_policy_blocks
  ADD CONSTRAINT sharefull_rpa_test_content_policy_blocks_status_check
  CHECK (status IN ('blocked', 'recorded'));

COMMENT ON TABLE public.sharefull_content_policy_blocks IS
  'Sharefull本番連携で検出した公開文面の自動変換・要確認表現・停止事実とLINE WORKS通知状態を記録する。';

COMMENT ON TABLE public.sharefull_rpa_test_content_policy_blocks IS
  'Sharefullテスト連携で検出した公開文面の自動変換・要確認表現・停止事実を記録する。';
