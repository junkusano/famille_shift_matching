-- Phase D: authenticated/browser tables and existing RLS grant hardening
-- DRAFT: run only in the maintenance window, after backup/Gate checks.
-- Generated from the 2026-08-24 pre-RLS snapshot.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

ALTER TABLE public."cs_kaipoke_time_adjustability" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."cs_kaipoke_time_adjustability" FROM anon, authenticated;

ALTER TABLE public."employee_training_goals" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."employee_training_goals" FROM anon, authenticated;

ALTER TABLE public."expense_reimbursements" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."expense_reimbursements" FROM anon, authenticated;

ALTER TABLE public."levels" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."levels" FROM anon, authenticated;

ALTER TABLE public."org_icons" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."org_icons" FROM anon, authenticated;

ALTER TABLE public."org_icons_category" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."org_icons_category" FROM anon, authenticated;

ALTER TABLE public."parking_cs_places" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."parking_cs_places" FROM anon, authenticated;

ALTER TABLE public."postal_district" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."postal_district" FROM anon, authenticated;

ALTER TABLE public."rpa_command_args" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."rpa_command_args" FROM anon, authenticated;

ALTER TABLE public."rpa_command_kind" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."rpa_command_kind" FROM anon, authenticated;

ALTER TABLE public."rpa_command_request_status" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."rpa_command_request_status" FROM anon, authenticated;

ALTER TABLE public."rpa_command_templates" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."rpa_command_templates" FROM anon, authenticated;

ALTER TABLE public."rpa_command_type" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."rpa_command_type" FROM anon, authenticated;

ALTER TABLE public."shift_record_category_l" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."shift_record_category_l" FROM anon, authenticated;

ALTER TABLE public."shift_record_category_s" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."shift_record_category_s" FROM anon, authenticated;

ALTER TABLE public."shift_record_item_defs" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."shift_record_item_defs" FROM anon, authenticated;

ALTER TABLE public."shift_wishes" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."shift_wishes" FROM anon, authenticated;

ALTER TABLE public."user_doc_master" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."user_doc_master" FROM anon, authenticated;

ALTER TABLE public."user_ojt_record" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."user_ojt_record" FROM anon, authenticated;

ALTER TABLE public."user_status_master" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."user_status_master" FROM anon, authenticated;

ALTER TABLE public."wf_request_type" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."wf_request_type" FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.rls25_is_active_user() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$ SELECT EXISTS (SELECT 1 FROM public.users u WHERE u.auth_user_id = auth.uid() AND COALESCE(u.status, '') <> 'removed_from_lineworks_kaipoke') $$;
CREATE OR REPLACE FUNCTION public.rls25_current_user_id() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$ SELECT u.user_id FROM public.users u WHERE u.auth_user_id = auth.uid() LIMIT 1 $$;
CREATE OR REPLACE FUNCTION public.rls25_has_role(allowed text[]) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$ SELECT EXISTS (SELECT 1 FROM public.users u WHERE u.auth_user_id = auth.uid() AND lower(COALESCE(u.system_role, '')) = ANY(allowed)) $$;
REVOKE ALL ON FUNCTION public.rls25_is_active_user() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rls25_current_user_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rls25_has_role(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rls25_is_active_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.rls25_current_user_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.rls25_has_role(text[]) TO authenticated;

GRANT SELECT ON TABLE public."cs_kaipoke_time_adjustability" TO authenticated;
DROP POLICY IF EXISTS "rls25_cs_kaipoke_time_adjustability_select" ON public."cs_kaipoke_time_adjustability";
CREATE POLICY "rls25_cs_kaipoke_time_adjustability_select" ON public."cs_kaipoke_time_adjustability" FOR SELECT TO authenticated USING (public.rls25_is_active_user());

GRANT SELECT ON TABLE public."employee_training_goals" TO authenticated;
DROP POLICY IF EXISTS "rls25_employee_training_goals_select" ON public."employee_training_goals";
CREATE POLICY "rls25_employee_training_goals_select" ON public."employee_training_goals" FOR SELECT TO authenticated USING (public.rls25_is_active_user());

GRANT INSERT ON TABLE public."expense_reimbursements" TO authenticated;
DROP POLICY IF EXISTS "rls25_expense_reimbursements_insert" ON public."expense_reimbursements";
CREATE POLICY "rls25_expense_reimbursements_insert" ON public."expense_reimbursements" FOR INSERT TO authenticated WITH CHECK (public.rls25_is_active_user());

GRANT SELECT ON TABLE public."levels" TO authenticated;
DROP POLICY IF EXISTS "rls25_levels_select" ON public."levels";
CREATE POLICY "rls25_levels_select" ON public."levels" FOR SELECT TO authenticated USING (public.rls25_is_active_user());

GRANT SELECT, DELETE ON TABLE public."org_icons" TO authenticated;
DROP POLICY IF EXISTS "rls25_org_icons_delete" ON public."org_icons";
CREATE POLICY "rls25_org_icons_delete" ON public."org_icons" FOR DELETE TO authenticated USING (public.rls25_is_active_user());
DROP POLICY IF EXISTS "rls25_org_icons_select" ON public."org_icons";
CREATE POLICY "rls25_org_icons_select" ON public."org_icons" FOR SELECT TO authenticated USING (public.rls25_is_active_user());

GRANT SELECT ON TABLE public."org_icons_category" TO authenticated;
DROP POLICY IF EXISTS "rls25_org_icons_category_select" ON public."org_icons_category";
CREATE POLICY "rls25_org_icons_category_select" ON public."org_icons_category" FOR SELECT TO authenticated USING (public.rls25_is_active_user());

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."parking_cs_places" TO authenticated;
DROP POLICY IF EXISTS "rls25_parking_cs_places_delete" ON public."parking_cs_places";
CREATE POLICY "rls25_parking_cs_places_delete" ON public."parking_cs_places" FOR DELETE TO authenticated USING (public.rls25_is_active_user());
DROP POLICY IF EXISTS "rls25_parking_cs_places_insert" ON public."parking_cs_places";
CREATE POLICY "rls25_parking_cs_places_insert" ON public."parking_cs_places" FOR INSERT TO authenticated WITH CHECK (public.rls25_is_active_user());
DROP POLICY IF EXISTS "rls25_parking_cs_places_select" ON public."parking_cs_places";
CREATE POLICY "rls25_parking_cs_places_select" ON public."parking_cs_places" FOR SELECT TO authenticated USING (public.rls25_is_active_user());
DROP POLICY IF EXISTS "rls25_parking_cs_places_update" ON public."parking_cs_places";
CREATE POLICY "rls25_parking_cs_places_update" ON public."parking_cs_places" FOR UPDATE TO authenticated USING (public.rls25_is_active_user()) WITH CHECK (public.rls25_is_active_user());

GRANT SELECT ON TABLE public."postal_district" TO authenticated;
DROP POLICY IF EXISTS "rls25_postal_district_select" ON public."postal_district";
CREATE POLICY "rls25_postal_district_select" ON public."postal_district" FOR SELECT TO authenticated USING (public.rls25_is_active_user());

GRANT SELECT, UPDATE, DELETE, INSERT ON TABLE public."rpa_command_args" TO authenticated;
DROP POLICY IF EXISTS "rls25_rpa_command_args_delete" ON public."rpa_command_args";
CREATE POLICY "rls25_rpa_command_args_delete" ON public."rpa_command_args" FOR DELETE TO authenticated USING (public.rls25_is_active_user());
DROP POLICY IF EXISTS "rls25_rpa_command_args_insert" ON public."rpa_command_args";
CREATE POLICY "rls25_rpa_command_args_insert" ON public."rpa_command_args" FOR INSERT TO authenticated WITH CHECK (public.rls25_is_active_user());
DROP POLICY IF EXISTS "rls25_rpa_command_args_select" ON public."rpa_command_args";
CREATE POLICY "rls25_rpa_command_args_select" ON public."rpa_command_args" FOR SELECT TO authenticated USING (public.rls25_is_active_user());
DROP POLICY IF EXISTS "rls25_rpa_command_args_update" ON public."rpa_command_args";
CREATE POLICY "rls25_rpa_command_args_update" ON public."rpa_command_args" FOR UPDATE TO authenticated USING (public.rls25_is_active_user()) WITH CHECK (public.rls25_is_active_user());

GRANT SELECT ON TABLE public."rpa_command_kind" TO authenticated;
DROP POLICY IF EXISTS "rls25_rpa_command_kind_select" ON public."rpa_command_kind";
CREATE POLICY "rls25_rpa_command_kind_select" ON public."rpa_command_kind" FOR SELECT TO authenticated USING (public.rls25_is_active_user());

GRANT SELECT, INSERT ON TABLE public."rpa_command_request_status" TO authenticated;
DROP POLICY IF EXISTS "rls25_rpa_command_request_status_insert" ON public."rpa_command_request_status";
CREATE POLICY "rls25_rpa_command_request_status_insert" ON public."rpa_command_request_status" FOR INSERT TO authenticated WITH CHECK (public.rls25_is_active_user());
DROP POLICY IF EXISTS "rls25_rpa_command_request_status_select" ON public."rpa_command_request_status";
CREATE POLICY "rls25_rpa_command_request_status_select" ON public."rpa_command_request_status" FOR SELECT TO authenticated USING (public.rls25_is_active_user());

GRANT SELECT, INSERT, DELETE, UPDATE ON TABLE public."rpa_command_templates" TO authenticated;
DROP POLICY IF EXISTS "rls25_rpa_command_templates_delete" ON public."rpa_command_templates";
CREATE POLICY "rls25_rpa_command_templates_delete" ON public."rpa_command_templates" FOR DELETE TO authenticated USING (public.rls25_is_active_user());
DROP POLICY IF EXISTS "rls25_rpa_command_templates_insert" ON public."rpa_command_templates";
CREATE POLICY "rls25_rpa_command_templates_insert" ON public."rpa_command_templates" FOR INSERT TO authenticated WITH CHECK (public.rls25_is_active_user());
DROP POLICY IF EXISTS "rls25_rpa_command_templates_select" ON public."rpa_command_templates";
CREATE POLICY "rls25_rpa_command_templates_select" ON public."rpa_command_templates" FOR SELECT TO authenticated USING (public.rls25_is_active_user());
DROP POLICY IF EXISTS "rls25_rpa_command_templates_update" ON public."rpa_command_templates";
CREATE POLICY "rls25_rpa_command_templates_update" ON public."rpa_command_templates" FOR UPDATE TO authenticated USING (public.rls25_is_active_user()) WITH CHECK (public.rls25_is_active_user());

GRANT SELECT, UPDATE ON TABLE public."rpa_command_type" TO authenticated;
DROP POLICY IF EXISTS "rls25_rpa_command_type_select" ON public."rpa_command_type";
CREATE POLICY "rls25_rpa_command_type_select" ON public."rpa_command_type" FOR SELECT TO authenticated USING (public.rls25_is_active_user());
DROP POLICY IF EXISTS "rls25_rpa_command_type_update" ON public."rpa_command_type";
CREATE POLICY "rls25_rpa_command_type_update" ON public."rpa_command_type" FOR UPDATE TO authenticated USING (public.rls25_is_active_user()) WITH CHECK (public.rls25_is_active_user());

GRANT SELECT ON TABLE public."shift_record_category_l" TO authenticated;
DROP POLICY IF EXISTS "rls25_shift_record_category_l_select" ON public."shift_record_category_l";
CREATE POLICY "rls25_shift_record_category_l_select" ON public."shift_record_category_l" FOR SELECT TO authenticated USING (public.rls25_is_active_user());

GRANT SELECT ON TABLE public."shift_record_category_s" TO authenticated;
DROP POLICY IF EXISTS "rls25_shift_record_category_s_select" ON public."shift_record_category_s";
CREATE POLICY "rls25_shift_record_category_s_select" ON public."shift_record_category_s" FOR SELECT TO authenticated USING (public.rls25_is_active_user());

GRANT SELECT ON TABLE public."shift_record_item_defs" TO authenticated;
DROP POLICY IF EXISTS "rls25_shift_record_item_defs_select" ON public."shift_record_item_defs";
CREATE POLICY "rls25_shift_record_item_defs_select" ON public."shift_record_item_defs" FOR SELECT TO authenticated USING (public.rls25_is_active_user());

GRANT INSERT ON TABLE public."shift_wishes" TO authenticated;
DROP POLICY IF EXISTS "rls25_shift_wishes_insert" ON public."shift_wishes";
CREATE POLICY "rls25_shift_wishes_insert" ON public."shift_wishes" FOR INSERT TO authenticated WITH CHECK (((user_id = public.rls25_current_user_id()) OR public.rls25_has_role(ARRAY['admin','manager','full'])));

GRANT SELECT ON TABLE public."user_doc_master" TO authenticated;
DROP POLICY IF EXISTS "rls25_user_doc_master_select" ON public."user_doc_master";
CREATE POLICY "rls25_user_doc_master_select" ON public."user_doc_master" FOR SELECT TO authenticated USING (public.rls25_is_active_user());
GRANT SELECT ON TABLE public."user_doc_master" TO anon;
DROP POLICY IF EXISTS "rls25_user_doc_master_public_certificate_select" ON public."user_doc_master";
CREATE POLICY "rls25_user_doc_master_public_certificate_select" ON public."user_doc_master" FOR SELECT TO anon USING (is_active = true AND category = 'certificate');

GRANT SELECT, INSERT ON TABLE public."user_ojt_record" TO authenticated;
DROP POLICY IF EXISTS "rls25_user_ojt_record_insert" ON public."user_ojt_record";
CREATE POLICY "rls25_user_ojt_record_insert" ON public."user_ojt_record" FOR INSERT TO authenticated WITH CHECK (public.rls25_is_active_user());
DROP POLICY IF EXISTS "rls25_user_ojt_record_select" ON public."user_ojt_record";
CREATE POLICY "rls25_user_ojt_record_select" ON public."user_ojt_record" FOR SELECT TO authenticated USING (public.rls25_is_active_user());

GRANT SELECT ON TABLE public."user_status_master" TO authenticated;
DROP POLICY IF EXISTS "rls25_user_status_master_select" ON public."user_status_master";
CREATE POLICY "rls25_user_status_master_select" ON public."user_status_master" FOR SELECT TO authenticated USING (public.rls25_is_active_user());

GRANT SELECT ON TABLE public."wf_request_type" TO authenticated;
DROP POLICY IF EXISTS "rls25_wf_request_type_select" ON public."wf_request_type";
CREATE POLICY "rls25_wf_request_type_select" ON public."wf_request_type" FOR SELECT TO authenticated USING (public.rls25_is_active_user());

-- Existing RLS-enabled tables: remove broad grants and restore only policy-backed operations.
REVOKE ALL PRIVILEGES ON TABLE public."bento_pickup_locations" FROM anon, authenticated;
GRANT SELECT, UPDATE ON TABLE public."bento_pickup_locations" TO authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."bento_survey_menus" FROM anon, authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public."bento_survey_menus" TO authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."bento_survey_responses" FROM anon, authenticated;
GRANT SELECT, UPDATE ON TABLE public."bento_survey_responses" TO authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."bento_surveys" FROM anon, authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public."bento_surveys" TO authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."client_monitoring_events" FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."client_monitoring_goals" FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."client_monitoring_pdf_snapshots" FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."client_monitorings" FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."cm_alert_batch_runs" FROM anon, authenticated;
GRANT INSERT, SELECT, UPDATE ON TABLE public."cm_alert_batch_runs" TO authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."cm_alerts" FROM anon, authenticated;
GRANT INSERT, SELECT, UPDATE ON TABLE public."cm_alerts" TO authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."cm_document_types" FROM anon, authenticated;
GRANT SELECT ON TABLE public."cm_document_types" TO authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."cm_fax_extracted_data" FROM anon, authenticated;
GRANT SELECT, UPDATE ON TABLE public."cm_fax_extracted_data" TO authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."cm_fax_ocr_results" FROM anon, authenticated;
GRANT SELECT ON TABLE public."cm_fax_ocr_results" TO authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."cm_fax_office_patterns" FROM anon, authenticated;
GRANT SELECT ON TABLE public."cm_fax_office_patterns" TO authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."cm_fax_pages" FROM anon, authenticated;
GRANT INSERT, SELECT, UPDATE ON TABLE public."cm_fax_pages" TO authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."cm_fax_received" FROM anon, authenticated;
GRANT SELECT, UPDATE ON TABLE public."cm_fax_received" TO authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."cm_fax_text_patterns" FROM anon, authenticated;
GRANT SELECT ON TABLE public."cm_fax_text_patterns" TO authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."cm_job_queues" FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."cm_job_types" FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."cm_plaud_sum_processing" FROM anon, authenticated;
GRANT SELECT ON TABLE public."cm_plaud_sum_processing" TO authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."cm_rpa_api_keys" FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."cm_rpa_credentials" FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."entry_attachments" FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."external_expense_claims" FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."google_maps_distance_cache" FROM anon, authenticated;
GRANT SELECT ON TABLE public."google_maps_distance_cache" TO authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."google_maps_distance_cron_runs" FROM anon, authenticated;
GRANT SELECT ON TABLE public."google_maps_distance_cron_runs" TO authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."holiday_master" FROM anon, authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public."holiday_master" TO authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."holiday_shift_action" FROM anon, authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public."holiday_shift_action" TO authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."jisseki_forms" FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."jisseki_record_sort_municipalities" FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."lw_channels" FROM anon, authenticated;
GRANT SELECT ON TABLE public."lw_channels" TO authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."manager_distance_segments" FROM anon, authenticated;
GRANT SELECT ON TABLE public."manager_distance_segments" TO authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."monitoring_fax_history" FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."monitoring_office_notices" FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."phone" FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."plan_long_term_goals" FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."plan_service_short_term_goals" FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."plan_short_term_goals" FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."recording_transcripts" FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."reentry_campaign_recipients" FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."reentry_recruitment_settings" FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."regular_shift_requests" FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."rpa_diagnostics" FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."rpa_job_presets" FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."rpa_page_snapshots" FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."sms_send_logs" FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."staff_monthly_score_summaries" FROM anon, authenticated;
GRANT SELECT ON TABLE public."staff_monthly_score_summaries" TO authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."staff_monthly_stats" FROM anon, authenticated;
GRANT SELECT ON TABLE public."staff_monthly_stats" TO authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."taimee_applicant_documents" FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."taimee_applicant_jobs" FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."taimee_applicants" FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."taimee_job_schedules" FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."taimee_job_settings" FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."taimee_sms_logs" FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."taimee_sms_send_logs" FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."taimee_work_histories" FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."taimee_workers" FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."training_goal_catalog" FROM anon, authenticated;
GRANT SELECT ON TABLE public."training_goal_catalog" TO authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."training_goal_master" FROM anon, authenticated;
GRANT SELECT ON TABLE public."training_goal_master" TO authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."user_notification_determination" FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."user_org_exception" FROM anon, authenticated;
DROP POLICY IF EXISTS "rls25_user_org_exception_select" ON public."user_org_exception";
CREATE POLICY "rls25_user_org_exception_select" ON public."user_org_exception" FOR SELECT TO authenticated USING (public.rls25_is_active_user());
GRANT SELECT ON TABLE public."user_org_exception" TO authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."user_salary_monthly" FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."visit_record_daily_reminder_logs" FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."wf_approval_step" FROM anon, authenticated;
GRANT SELECT, UPDATE ON TABLE public."wf_approval_step" TO authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."wf_request" FROM anon, authenticated;
GRANT INSERT, SELECT, UPDATE ON TABLE public."wf_request" TO authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."wf_request_attachment" FROM anon, authenticated;
GRANT DELETE, INSERT, SELECT ON TABLE public."wf_request_attachment" TO authenticated;
COMMIT;
