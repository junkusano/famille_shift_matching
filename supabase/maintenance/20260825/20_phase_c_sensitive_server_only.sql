-- Phase C: sensitive server-only tables
-- DRAFT: run only in the maintenance window, after backup/Gate checks.
-- Generated from the 2026-08-24 pre-RLS snapshot.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

ALTER TABLE public."_tmp_restore_documents" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."_tmp_restore_documents" FROM anon, authenticated;

ALTER TABLE public."biz_stats_defect_sum" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."biz_stats_defect_sum" FROM anon, authenticated;

ALTER TABLE public."biz_stats_shift_sum" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."biz_stats_shift_sum" FROM anon, authenticated;

ALTER TABLE public."cm_contract_consents" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."cm_contract_consents" FROM anon, authenticated;

ALTER TABLE public."cm_contract_document_signers" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."cm_contract_document_signers" FROM anon, authenticated;

ALTER TABLE public."cm_contract_documents" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."cm_contract_documents" FROM anon, authenticated;

ALTER TABLE public."cm_contract_form_data" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."cm_contract_form_data" FROM anon, authenticated;

ALTER TABLE public."cm_contract_templates" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."cm_contract_templates" FROM anon, authenticated;

ALTER TABLE public."cm_contract_verification_documents" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."cm_contract_verification_documents" FROM anon, authenticated;

ALTER TABLE public."cm_contract_verification_methods" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."cm_contract_verification_methods" FROM anon, authenticated;

ALTER TABLE public."cm_contract_webhook_logs" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."cm_contract_webhook_logs" FROM anon, authenticated;

ALTER TABLE public."cm_contracts" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."cm_contracts" FROM anon, authenticated;

ALTER TABLE public."cm_fax_client_link" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."cm_fax_client_link" FROM anon, authenticated;

ALTER TABLE public."cm_fax_document_clients" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."cm_fax_document_clients" FROM anon, authenticated;

ALTER TABLE public."cm_fax_document_pages" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."cm_fax_document_pages" FROM anon, authenticated;

ALTER TABLE public."cm_fax_documents" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."cm_fax_documents" FROM anon, authenticated;

ALTER TABLE public."cm_fax_sender_patterns" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."cm_fax_sender_patterns" FROM anon, authenticated;

ALTER TABLE public."cm_job_items" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."cm_job_items" FROM anon, authenticated;

ALTER TABLE public."cm_jobs" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."cm_jobs" FROM anon, authenticated;

ALTER TABLE public."cm_kaipoke_benefit_limit" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."cm_kaipoke_benefit_limit" FROM anon, authenticated;

ALTER TABLE public."cm_kaipoke_insurance" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."cm_kaipoke_insurance" FROM anon, authenticated;

ALTER TABLE public."cm_kaipoke_support_office" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."cm_kaipoke_support_office" FROM anon, authenticated;

ALTER TABLE public."cm_local_fax_phonebook" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."cm_local_fax_phonebook" FROM anon, authenticated;

ALTER TABLE public."cm_own_office" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."cm_own_office" FROM anon, authenticated;

ALTER TABLE public."cm_plaud_mgmt_history" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."cm_plaud_mgmt_history" FROM anon, authenticated;

ALTER TABLE public."cm_plaud_mgmt_templates" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."cm_plaud_mgmt_templates" FROM anon, authenticated;

ALTER TABLE public."cm_plaud_mgmt_transcriptions" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."cm_plaud_mgmt_transcriptions" FROM anon, authenticated;

ALTER TABLE public."cm_plaud_sum" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."cm_plaud_sum" FROM anon, authenticated;

ALTER TABLE public."cm_plaud_transcriptions" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."cm_plaud_transcriptions" FROM anon, authenticated;

ALTER TABLE public."cm_prompt_templates" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."cm_prompt_templates" FROM anon, authenticated;

ALTER TABLE public."cm_rpa_logs" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."cm_rpa_logs" FROM anon, authenticated;

ALTER TABLE public."cm_scheduled_job_runs" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."cm_scheduled_job_runs" FROM anon, authenticated;

ALTER TABLE public."cs_gender_request" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."cs_gender_request" FROM anon, authenticated;

ALTER TABLE public."cs_kaipoke_info_documents_snapshots" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."cs_kaipoke_info_documents_snapshots" FROM anon, authenticated;

ALTER TABLE public."cs_kaipoke_insurance_info" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."cs_kaipoke_insurance_info" FROM anon, authenticated;

ALTER TABLE public."dialogflow_pending_shift_requests" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."dialogflow_pending_shift_requests" FROM anon, authenticated;

ALTER TABLE public."disability_check" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."disability_check" FROM anon, authenticated;

ALTER TABLE public."end_at" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."end_at" FROM anon, authenticated;

ALTER TABLE public."event_tasks" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."event_tasks" FROM anon, authenticated;

ALTER TABLE public."event_template" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."event_template" FROM anon, authenticated;

ALTER TABLE public."google_calendar_events" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."google_calendar_events" FROM anon, authenticated;

ALTER TABLE public."google_calendar_user_links" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."google_calendar_user_links" FROM anon, authenticated;

ALTER TABLE public."insurance_unit_amount" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."insurance_unit_amount" FROM anon, authenticated;

ALTER TABLE public."levels_temp" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."levels_temp" FROM anon, authenticated;

ALTER TABLE public."login_lineworks_otp" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."login_lineworks_otp" FROM anon, authenticated;

ALTER TABLE public."login_trusted_devices" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."login_trusted_devices" FROM anon, authenticated;

ALTER TABLE public."monthly_meeting_attendance" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."monthly_meeting_attendance" FROM anon, authenticated;

ALTER TABLE public."msg_lw_analysis_log" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."msg_lw_analysis_log" FROM anon, authenticated;

ALTER TABLE public."msg_lw_log" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."msg_lw_log" FROM anon, authenticated;

ALTER TABLE public."plan_services" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."plan_services" FROM anon, authenticated;

ALTER TABLE public."plans" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."plans" FROM anon, authenticated;

ALTER TABLE public."positions" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."positions" FROM anon, authenticated;

ALTER TABLE public."positions_temp" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."positions_temp" FROM anon, authenticated;

ALTER TABLE public."shift_assign_log" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."shift_assign_log" FROM anon, authenticated;

ALTER TABLE public."shift_service_code" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."shift_service_code" FROM anon, authenticated;

ALTER TABLE public."shift_temp" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."shift_temp" FROM anon, authenticated;

ALTER TABLE public."shift_weekly_template" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."shift_weekly_template" FROM anon, authenticated;

ALTER TABLE public."spot_offer_template_unified" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."spot_offer_template_unified" FROM anon, authenticated;

ALTER TABLE public."taimee_employees_monthly" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."taimee_employees_monthly" FROM anon, authenticated;

ALTER TABLE public."team_monthly_score_summaries" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."team_monthly_score_summaries" FROM anon, authenticated;

ALTER TABLE public."xxxtest_spot_offer_template_unified" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."xxxtest_spot_offer_template_unified" FROM anon, authenticated;
COMMIT;
