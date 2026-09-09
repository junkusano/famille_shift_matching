-- RLS CANARY rollback: restore the exact 2026-08-30 pre-change browser-role state.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '2min';

ALTER TABLE public.msg_lw_status DISABLE ROW LEVEL SECURITY;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
  ON TABLE public.msg_lw_status TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
  ON TABLE public.msg_lw_status TO authenticated;

COMMIT;
