-- RLS CANARY: public.msg_lw_status only
-- No data mutation. No policy is created because the table is server-only.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '2min';

ALTER TABLE public.msg_lw_status ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.msg_lw_status FROM anon, authenticated;

COMMIT;
