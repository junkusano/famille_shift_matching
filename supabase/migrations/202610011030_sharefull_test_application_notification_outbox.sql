-- LINE WORKS送信状態をテスト応募イベントに保持し、失敗時の再試行と重複通知抑止を行う。
ALTER TABLE public.sharefull_rpa_test_spot_offer_application_events
  ADD COLUMN IF NOT EXISTS notification_claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS notification_error text;

COMMENT ON COLUMN public.sharefull_rpa_test_spot_offer_application_events.notification_claimed_at IS
  'LINE WORKS通知の短期claim。送信失敗時に解除して再試行する。';
COMMENT ON COLUMN public.sharefull_rpa_test_spot_offer_application_events.notified_at IS
  'LINE WORKS通知の成功時刻。';
COMMENT ON COLUMN public.sharefull_rpa_test_spot_offer_application_events.notification_error IS
  '直近のLINE WORKS通知失敗理由。認証情報は記録しない。';
