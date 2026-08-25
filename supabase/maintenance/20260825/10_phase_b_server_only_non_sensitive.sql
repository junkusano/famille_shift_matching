-- Phase B: server-only / unused non-sensitive tables
-- DRAFT: run only in the maintenance window, after backup/Gate checks.
-- Generated from the 2026-08-24 pre-RLS snapshot.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

ALTER TABLE public."cm_select_options" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."cm_select_options" FROM anon, authenticated;

ALTER TABLE public."event_task_required_docs" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."event_task_required_docs" FROM anon, authenticated;

ALTER TABLE public."event_template_required_docs" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."event_template_required_docs" FROM anon, authenticated;

ALTER TABLE public."msg_lw_status" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."msg_lw_status" FROM anon, authenticated;

ALTER TABLE public."service_kinds" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."service_kinds" FROM anon, authenticated;

ALTER TABLE public."shift_record_items" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."shift_record_items" FROM anon, authenticated;

ALTER TABLE public."system_role_master" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."system_role_master" FROM anon, authenticated;
COMMIT;
