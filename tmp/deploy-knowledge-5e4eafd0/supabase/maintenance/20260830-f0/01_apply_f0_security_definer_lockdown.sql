-- F0 SECURITY DEFINER lockdown (production, 2026-08-30)
-- Only EXECUTE privileges are changed. Function bodies/search_path/default privileges are unchanged.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

-- batch_reassign_departed_staff_shifts(p_actor_auth_id uuid, p_start_at timestamp without time zone, p_from_user_id text, p_to_user_id text)
REVOKE EXECUTE ON FUNCTION public."batch_reassign_departed_staff_shifts"(p_actor_auth_id uuid, p_start_at timestamp without time zone, p_from_user_id text, p_to_user_id text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public."batch_reassign_departed_staff_shifts"(p_actor_auth_id uuid, p_start_at timestamp without time zone, p_from_user_id text, p_to_user_id text) FROM anon;
REVOKE EXECUTE ON FUNCTION public."batch_reassign_departed_staff_shifts"(p_actor_auth_id uuid, p_start_at timestamp without time zone, p_from_user_id text, p_to_user_id text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public."batch_reassign_departed_staff_shifts"(p_actor_auth_id uuid, p_start_at timestamp without time zone, p_from_user_id text, p_to_user_id text) TO service_role;

-- cm_get_alert_stats()
REVOKE EXECUTE ON FUNCTION public."cm_get_alert_stats"() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public."cm_get_alert_stats"() FROM anon;
GRANT EXECUTE ON FUNCTION public."cm_get_alert_stats"() TO authenticated;
GRANT EXECUTE ON FUNCTION public."cm_get_alert_stats"() TO service_role;

-- cm_resolve_alert_by_reference(p_kaipoke_cs_id text, p_category text, p_reference_id text, p_resolution_note text)
REVOKE EXECUTE ON FUNCTION public."cm_resolve_alert_by_reference"(p_kaipoke_cs_id text, p_category text, p_reference_id text, p_resolution_note text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public."cm_resolve_alert_by_reference"(p_kaipoke_cs_id text, p_category text, p_reference_id text, p_resolution_note text) FROM anon;
REVOKE EXECUTE ON FUNCTION public."cm_resolve_alert_by_reference"(p_kaipoke_cs_id text, p_category text, p_reference_id text, p_resolution_note text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public."cm_resolve_alert_by_reference"(p_kaipoke_cs_id text, p_category text, p_reference_id text, p_resolution_note text) TO service_role;

-- cm_resolve_alerts_by_termination(p_category text, p_resolution_note text)
REVOKE EXECUTE ON FUNCTION public."cm_resolve_alerts_by_termination"(p_category text, p_resolution_note text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public."cm_resolve_alerts_by_termination"(p_category text, p_resolution_note text) FROM anon;
REVOKE EXECUTE ON FUNCTION public."cm_resolve_alerts_by_termination"(p_category text, p_resolution_note text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public."cm_resolve_alerts_by_termination"(p_category text, p_resolution_note text) TO service_role;

-- cron_sync_cs_documents()
REVOKE EXECUTE ON FUNCTION public."cron_sync_cs_documents"() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public."cron_sync_cs_documents"() FROM anon;
REVOKE EXECUTE ON FUNCTION public."cron_sync_cs_documents"() FROM authenticated;
GRANT EXECUTE ON FUNCTION public."cron_sync_cs_documents"() TO service_role;

-- dashboard_service_time_qualification_staff_rows()
REVOKE EXECUTE ON FUNCTION public."dashboard_service_time_qualification_staff_rows"() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public."dashboard_service_time_qualification_staff_rows"() FROM anon;
REVOKE EXECUTE ON FUNCTION public."dashboard_service_time_qualification_staff_rows"() FROM authenticated;
GRANT EXECUTE ON FUNCTION public."dashboard_service_time_qualification_staff_rows"() TO service_role;

-- exec_sql(sql_text text)
REVOKE EXECUTE ON FUNCTION public."exec_sql"(sql_text text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public."exec_sql"(sql_text text) FROM anon;
REVOKE EXECUTE ON FUNCTION public."exec_sql"(sql_text text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public."exec_sql"(sql_text text) TO service_role;

-- get_candidate_clients_multi(p_office_ids bigint[])
REVOKE EXECUTE ON FUNCTION public."get_candidate_clients_multi"(p_office_ids bigint[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public."get_candidate_clients_multi"(p_office_ids bigint[]) FROM anon;
REVOKE EXECUTE ON FUNCTION public."get_candidate_clients_multi"(p_office_ids bigint[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public."get_candidate_clients_multi"(p_office_ids bigint[]) TO service_role;

-- get_foreign_keys(target_schema text, target_table text)
REVOKE EXECUTE ON FUNCTION public."get_foreign_keys"(target_schema text, target_table text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public."get_foreign_keys"(target_schema text, target_table text) FROM anon;
REVOKE EXECUTE ON FUNCTION public."get_foreign_keys"(target_schema text, target_table text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public."get_foreign_keys"(target_schema text, target_table text) TO service_role;

-- get_lw_channel_id(p_group_account text)
REVOKE EXECUTE ON FUNCTION public."get_lw_channel_id"(p_group_account text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public."get_lw_channel_id"(p_group_account text) FROM anon;
REVOKE EXECUTE ON FUNCTION public."get_lw_channel_id"(p_group_account text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public."get_lw_channel_id"(p_group_account text) TO service_role;

-- get_primary_keys(target_schema text, target_table text)
REVOKE EXECUTE ON FUNCTION public."get_primary_keys"(target_schema text, target_table text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public."get_primary_keys"(target_schema text, target_table text) FROM anon;
REVOKE EXECUTE ON FUNCTION public."get_primary_keys"(target_schema text, target_table text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public."get_primary_keys"(target_schema text, target_table text) TO service_role;

-- get_schema_list()
REVOKE EXECUTE ON FUNCTION public."get_schema_list"() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public."get_schema_list"() FROM anon;
REVOKE EXECUTE ON FUNCTION public."get_schema_list"() FROM authenticated;
GRANT EXECUTE ON FUNCTION public."get_schema_list"() TO service_role;

-- get_schema_tables(target_schema text)
REVOKE EXECUTE ON FUNCTION public."get_schema_tables"(target_schema text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public."get_schema_tables"(target_schema text) FROM anon;
REVOKE EXECUTE ON FUNCTION public."get_schema_tables"(target_schema text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public."get_schema_tables"(target_schema text) TO service_role;

-- get_table_columns(target_schema text, target_table text)
REVOKE EXECUTE ON FUNCTION public."get_table_columns"(target_schema text, target_table text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public."get_table_columns"(target_schema text, target_table text) FROM anon;
REVOKE EXECUTE ON FUNCTION public."get_table_columns"(target_schema text, target_table text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public."get_table_columns"(target_schema text, target_table text) TO service_role;

-- read_secret(secret_name text)
REVOKE EXECUTE ON FUNCTION public."read_secret"(secret_name text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public."read_secret"(secret_name text) FROM anon;
REVOKE EXECUTE ON FUNCTION public."read_secret"(secret_name text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public."read_secret"(secret_name text) TO service_role;

-- rebuild_staff_monthly_stats(p_from date, p_to date)
REVOKE EXECUTE ON FUNCTION public."rebuild_staff_monthly_stats"(p_from date, p_to date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public."rebuild_staff_monthly_stats"(p_from date, p_to date) FROM anon;
REVOKE EXECUTE ON FUNCTION public."rebuild_staff_monthly_stats"(p_from date, p_to date) FROM authenticated;
GRANT EXECUTE ON FUNCTION public."rebuild_staff_monthly_stats"(p_from date, p_to date) TO service_role;

-- roster_patch_shift_with_context(p_shift_id bigint, p_date date, p_start time without time zone, p_end time without time zone, p_update_at timestamp without time zone, p_target_col text, p_staff_id text, p_actor_user_id text, p_request_path text)
REVOKE EXECUTE ON FUNCTION public."roster_patch_shift_with_context"(p_shift_id bigint, p_date date, p_start time without time zone, p_end time without time zone, p_update_at timestamp without time zone, p_target_col text, p_staff_id text, p_actor_user_id text, p_request_path text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public."roster_patch_shift_with_context"(p_shift_id bigint, p_date date, p_start time without time zone, p_end time without time zone, p_update_at timestamp without time zone, p_target_col text, p_staff_id text, p_actor_user_id text, p_request_path text) FROM anon;
REVOKE EXECUTE ON FUNCTION public."roster_patch_shift_with_context"(p_shift_id bigint, p_date date, p_start time without time zone, p_end time without time zone, p_update_at timestamp without time zone, p_target_col text, p_staff_id text, p_actor_user_id text, p_request_path text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public."roster_patch_shift_with_context"(p_shift_id bigint, p_date date, p_start time without time zone, p_end time without time zone, p_update_at timestamp without time zone, p_target_col text, p_staff_id text, p_actor_user_id text, p_request_path text) TO service_role;

-- set_audit_context(p_user_id text, p_action text, p_trace_id text)
REVOKE EXECUTE ON FUNCTION public."set_audit_context"(p_user_id text, p_action text, p_trace_id text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public."set_audit_context"(p_user_id text, p_action text, p_trace_id text) FROM anon;
REVOKE EXECUTE ON FUNCTION public."set_audit_context"(p_user_id text, p_action text, p_trace_id text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public."set_audit_context"(p_user_id text, p_action text, p_trace_id text) TO service_role;

-- shift_delete_with_context(p_shift_id bigint, p_actor_user_id text, p_request_path text)
REVOKE EXECUTE ON FUNCTION public."shift_delete_with_context"(p_shift_id bigint, p_actor_user_id text, p_request_path text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public."shift_delete_with_context"(p_shift_id bigint, p_actor_user_id text, p_request_path text) FROM anon;
REVOKE EXECUTE ON FUNCTION public."shift_delete_with_context"(p_shift_id bigint, p_actor_user_id text, p_request_path text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public."shift_delete_with_context"(p_shift_id bigint, p_actor_user_id text, p_request_path text) TO service_role;

-- shift_direct_reassign(p_shift_id bigint, p_from_user_id text, p_to_user_id text, p_actor_auth_id text, p_reason text)
REVOKE EXECUTE ON FUNCTION public."shift_direct_reassign"(p_shift_id bigint, p_from_user_id text, p_to_user_id text, p_actor_auth_id text, p_reason text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public."shift_direct_reassign"(p_shift_id bigint, p_from_user_id text, p_to_user_id text, p_actor_auth_id text, p_reason text) FROM anon;
REVOKE EXECUTE ON FUNCTION public."shift_direct_reassign"(p_shift_id bigint, p_from_user_id text, p_to_user_id text, p_actor_auth_id text, p_reason text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public."shift_direct_reassign"(p_shift_id bigint, p_from_user_id text, p_to_user_id text, p_actor_auth_id text, p_reason text) TO service_role;

-- shift_direct_reassign(p_shift_id bigint, p_from_user_id text, p_to_user_id text, p_actor_auth_id text, p_reason text, p_event_type text, p_penalty_level text)
REVOKE EXECUTE ON FUNCTION public."shift_direct_reassign"(p_shift_id bigint, p_from_user_id text, p_to_user_id text, p_actor_auth_id text, p_reason text, p_event_type text, p_penalty_level text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public."shift_direct_reassign"(p_shift_id bigint, p_from_user_id text, p_to_user_id text, p_actor_auth_id text, p_reason text, p_event_type text, p_penalty_level text) FROM anon;
REVOKE EXECUTE ON FUNCTION public."shift_direct_reassign"(p_shift_id bigint, p_from_user_id text, p_to_user_id text, p_actor_auth_id text, p_reason text, p_event_type text, p_penalty_level text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public."shift_direct_reassign"(p_shift_id bigint, p_from_user_id text, p_to_user_id text, p_actor_auth_id text, p_reason text, p_event_type text, p_penalty_level text) TO service_role;

-- shift_direct_reassign(p_shift_id bigint, p_from_user_id text, p_to_user_id text, p_reason text, p_actor_user_id uuid, p_request_path text, p_event_type text, p_penalty_level text)
REVOKE EXECUTE ON FUNCTION public."shift_direct_reassign"(p_shift_id bigint, p_from_user_id text, p_to_user_id text, p_reason text, p_actor_user_id uuid, p_request_path text, p_event_type text, p_penalty_level text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public."shift_direct_reassign"(p_shift_id bigint, p_from_user_id text, p_to_user_id text, p_reason text, p_actor_user_id uuid, p_request_path text, p_event_type text, p_penalty_level text) FROM anon;
REVOKE EXECUTE ON FUNCTION public."shift_direct_reassign"(p_shift_id bigint, p_from_user_id text, p_to_user_id text, p_reason text, p_actor_user_id uuid, p_request_path text, p_event_type text, p_penalty_level text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public."shift_direct_reassign"(p_shift_id bigint, p_from_user_id text, p_to_user_id text, p_reason text, p_actor_user_id uuid, p_request_path text, p_event_type text, p_penalty_level text) TO service_role;

-- shift_direct_reassign_uuid(p_shift_id uuid, p_from_user_id text, p_to_user_id text, p_actor_auth_id uuid, p_reason text)
REVOKE EXECUTE ON FUNCTION public."shift_direct_reassign_uuid"(p_shift_id uuid, p_from_user_id text, p_to_user_id text, p_actor_auth_id uuid, p_reason text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public."shift_direct_reassign_uuid"(p_shift_id uuid, p_from_user_id text, p_to_user_id text, p_actor_auth_id uuid, p_reason text) FROM anon;
REVOKE EXECUTE ON FUNCTION public."shift_direct_reassign_uuid"(p_shift_id uuid, p_from_user_id text, p_to_user_id text, p_actor_auth_id uuid, p_reason text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public."shift_direct_reassign_uuid"(p_shift_id uuid, p_from_user_id text, p_to_user_id text, p_actor_auth_id uuid, p_reason text) TO service_role;

-- shift_insert_with_context(p_row jsonb, p_actor_user_id text, p_request_path text)
REVOKE EXECUTE ON FUNCTION public."shift_insert_with_context"(p_row jsonb, p_actor_user_id text, p_request_path text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public."shift_insert_with_context"(p_row jsonb, p_actor_user_id text, p_request_path text) FROM anon;
REVOKE EXECUTE ON FUNCTION public."shift_insert_with_context"(p_row jsonb, p_actor_user_id text, p_request_path text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public."shift_insert_with_context"(p_row jsonb, p_actor_user_id text, p_request_path text) TO service_role;

-- shift_update_with_context(p_shift_id bigint, p_patch jsonb, p_actor_user_id text, p_request_path text)
REVOKE EXECUTE ON FUNCTION public."shift_update_with_context"(p_shift_id bigint, p_patch jsonb, p_actor_user_id text, p_request_path text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public."shift_update_with_context"(p_shift_id bigint, p_patch jsonb, p_actor_user_id text, p_request_path text) FROM anon;
REVOKE EXECUTE ON FUNCTION public."shift_update_with_context"(p_shift_id bigint, p_patch jsonb, p_actor_user_id text, p_request_path text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public."shift_update_with_context"(p_shift_id bigint, p_patch jsonb, p_actor_user_id text, p_request_path text) TO service_role;

-- shifts_delete_with_context(p_shift_ids bigint[], p_actor_user_id text, p_request_path text)
REVOKE EXECUTE ON FUNCTION public."shifts_delete_with_context"(p_shift_ids bigint[], p_actor_user_id text, p_request_path text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public."shifts_delete_with_context"(p_shift_ids bigint[], p_actor_user_id text, p_request_path text) FROM anon;
REVOKE EXECUTE ON FUNCTION public."shifts_delete_with_context"(p_shift_ids bigint[], p_actor_user_id text, p_request_path text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public."shifts_delete_with_context"(p_shift_ids bigint[], p_actor_user_id text, p_request_path text) TO service_role;

-- shifts_update_with_context(p_actor_user_id text, p_patch jsonb, p_request_path text, p_shift_id bigint)
REVOKE EXECUTE ON FUNCTION public."shifts_update_with_context"(p_actor_user_id text, p_patch jsonb, p_request_path text, p_shift_id bigint) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public."shifts_update_with_context"(p_actor_user_id text, p_patch jsonb, p_request_path text, p_shift_id bigint) FROM anon;
REVOKE EXECUTE ON FUNCTION public."shifts_update_with_context"(p_actor_user_id text, p_patch jsonb, p_request_path text, p_shift_id bigint) FROM authenticated;
GRANT EXECUTE ON FUNCTION public."shifts_update_with_context"(p_actor_user_id text, p_patch jsonb, p_request_path text, p_shift_id bigint) TO service_role;

-- snapshot_biz_stats_shift_sum(p_year_month text)
REVOKE EXECUTE ON FUNCTION public."snapshot_biz_stats_shift_sum"(p_year_month text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public."snapshot_biz_stats_shift_sum"(p_year_month text) FROM anon;
REVOKE EXECUTE ON FUNCTION public."snapshot_biz_stats_shift_sum"(p_year_month text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public."snapshot_biz_stats_shift_sum"(p_year_month text) TO service_role;

-- staff_retirement_review_rows()
REVOKE EXECUTE ON FUNCTION public."staff_retirement_review_rows"() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public."staff_retirement_review_rows"() FROM anon;
REVOKE EXECUTE ON FUNCTION public."staff_retirement_review_rows"() FROM authenticated;
GRANT EXECUTE ON FUNCTION public."staff_retirement_review_rows"() TO service_role;

-- submit_entry_application(p_submission_id uuid, p_payload jsonb)
REVOKE EXECUTE ON FUNCTION public."submit_entry_application"(p_submission_id uuid, p_payload jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public."submit_entry_application"(p_submission_id uuid, p_payload jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public."submit_entry_application"(p_submission_id uuid, p_payload jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public."submit_entry_application"(p_submission_id uuid, p_payload jsonb) TO service_role;

-- sync_cs_docs_to_kaipoke_documents()
REVOKE EXECUTE ON FUNCTION public."sync_cs_docs_to_kaipoke_documents"() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public."sync_cs_docs_to_kaipoke_documents"() FROM anon;
REVOKE EXECUTE ON FUNCTION public."sync_cs_docs_to_kaipoke_documents"() FROM authenticated;
GRANT EXECUTE ON FUNCTION public."sync_cs_docs_to_kaipoke_documents"() TO service_role;

-- trg_audit_shift_min()
REVOKE EXECUTE ON FUNCTION public."trg_audit_shift_min"() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public."trg_audit_shift_min"() FROM anon;
REVOKE EXECUTE ON FUNCTION public."trg_audit_shift_min"() FROM authenticated;
GRANT EXECUTE ON FUNCTION public."trg_audit_shift_min"() TO service_role;

-- wf_is_admin()
REVOKE EXECUTE ON FUNCTION public."wf_is_admin"() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public."wf_is_admin"() FROM anon;
GRANT EXECUTE ON FUNCTION public."wf_is_admin"() TO authenticated;
GRANT EXECUTE ON FUNCTION public."wf_is_admin"() TO service_role;

-- wf_is_approver()
REVOKE EXECUTE ON FUNCTION public."wf_is_approver"() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public."wf_is_approver"() FROM anon;
GRANT EXECUTE ON FUNCTION public."wf_is_approver"() TO authenticated;
GRANT EXECUTE ON FUNCTION public."wf_is_approver"() TO service_role;

-- wf_my_user_id()
REVOKE EXECUTE ON FUNCTION public."wf_my_user_id"() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public."wf_my_user_id"() FROM anon;
GRANT EXECUTE ON FUNCTION public."wf_my_user_id"() TO authenticated;
GRANT EXECUTE ON FUNCTION public."wf_my_user_id"() TO service_role;

COMMIT;
