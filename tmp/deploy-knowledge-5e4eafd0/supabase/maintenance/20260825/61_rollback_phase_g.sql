-- rollback_phase_g: restore uploads bucket public flag
-- DRAFT: run only in the maintenance window, after backup/Gate checks.
-- Generated from the 2026-08-24 pre-RLS snapshot.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

UPDATE storage.buckets SET public = true WHERE id = 'uploads';
COMMIT;
