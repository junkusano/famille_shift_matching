CREATE TABLE IF NOT EXISTS public.sharefull_template_review_notifications (
  sharefull_template_id text PRIMARY KEY,
  core_id text NOT NULL,
  template_name text NOT NULL,
  template_url text NOT NULL,
  notification_claimed_at timestamptz,
  notified_at timestamptz,
  notification_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sharefull_template_review_notifications_url_check
    CHECK (template_url ~ '^https://client\.sharefull\.com/order_template/[0-9]+$')
);

ALTER TABLE public.sharefull_template_review_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sharefull_template_review_notifications FROM anon, authenticated;

COMMENT ON TABLE public.sharefull_template_review_notifications IS
  'LINE WORKS通知の重複を防ぐSharefull審査待ち通知記録';
