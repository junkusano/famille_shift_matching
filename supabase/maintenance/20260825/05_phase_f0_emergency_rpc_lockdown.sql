-- Phase F0: emergency SECURITY DEFINER anonymous lockdown before table phases
-- DRAFT: run only in the maintenance window, after backup/Gate checks.
-- Generated from the 2026-08-24 pre-RLS snapshot.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

REVOKE EXECUTE ON FUNCTION public."batch_reassign_departed_staff_shifts"(p_actor_auth_id uuid, p_start_at timestamp without time zone, p_from_user_id text, p_to_user_id text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public."cm_get_alert_stats"() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public."cm_resolve_alert_by_reference"(p_kaipoke_cs_id text, p_category text, p_reference_id text, p_resolution_note text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public."cm_resolve_alerts_by_termination"(p_category text, p_resolution_note text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public."cron_sync_cs_documents"() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public."dashboard_service_time_qualification_staff_rows"() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public."exec_sql"(sql_text text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public."get_candidate_clients_multi"(p_office_ids bigint[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public."get_foreign_keys"(target_schema text, target_table text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public."get_lw_channel_id"(p_group_account text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public."get_primary_keys"(target_schema text, target_table text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public."get_schema_list"() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public."get_schema_tables"(target_schema text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public."get_table_columns"(target_schema text, target_table text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public."read_secret"(secret_name text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public."rebuild_staff_monthly_stats"(p_from date, p_to date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public."roster_patch_shift_with_context"(p_shift_id bigint, p_date date, p_start time without time zone, p_end time without time zone, p_update_at timestamp without time zone, p_target_col text, p_staff_id text, p_actor_user_id text, p_request_path text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public."set_audit_context"(p_user_id text, p_action text, p_trace_id text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public."shift_delete_with_context"(p_shift_id bigint, p_actor_user_id text, p_request_path text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public."shift_direct_reassign"(p_shift_id bigint, p_from_user_id text, p_to_user_id text, p_actor_auth_id text, p_reason text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public."shift_direct_reassign"(p_shift_id bigint, p_from_user_id text, p_to_user_id text, p_actor_auth_id text, p_reason text, p_event_type text, p_penalty_level text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public."shift_direct_reassign"(p_shift_id bigint, p_from_user_id text, p_to_user_id text, p_reason text, p_actor_user_id uuid, p_request_path text, p_event_type text, p_penalty_level text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public."shift_direct_reassign_uuid"(p_shift_id uuid, p_from_user_id text, p_to_user_id text, p_actor_auth_id uuid, p_reason text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public."shift_insert_with_context"(p_row jsonb, p_actor_user_id text, p_request_path text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public."shift_update_with_context"(p_shift_id bigint, p_patch jsonb, p_actor_user_id text, p_request_path text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public."shifts_delete_with_context"(p_shift_ids bigint[], p_actor_user_id text, p_request_path text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public."shifts_update_with_context"(p_actor_user_id text, p_patch jsonb, p_request_path text, p_shift_id bigint) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public."snapshot_biz_stats_shift_sum"(p_year_month text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public."staff_retirement_review_rows"() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public."submit_entry_application"(p_submission_id uuid, p_payload jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public."sync_cs_docs_to_kaipoke_documents"() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public."trg_audit_shift_min"() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public."wf_is_admin"() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public."wf_is_approver"() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public."wf_my_user_id"() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public."exec_sql"(sql_text text) FROM authenticated;
COMMIT;
