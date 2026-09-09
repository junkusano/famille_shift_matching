-- Phase E: complex business and legacy tables
-- DRAFT: run only in the maintenance window, after backup/Gate checks.
-- Generated from the 2026-08-24 pre-RLS snapshot.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

ALTER TABLE public."alert_log" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."alert_log" FROM anon, authenticated;

ALTER TABLE public."api_shift_coord_log" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."api_shift_coord_log" FROM anon, authenticated;

ALTER TABLE public."assessments_records" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."assessments_records" FROM anon, authenticated;

ALTER TABLE public."audit_error_log" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."audit_error_log" FROM anon, authenticated;

ALTER TABLE public."audit_log" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."audit_log" FROM anon, authenticated;

ALTER TABLE public."cm_fax_received_offices" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."cm_fax_received_offices" FROM anon, authenticated;

ALTER TABLE public."cm_kaipoke_info" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."cm_kaipoke_info" FROM anon, authenticated;

ALTER TABLE public."cm_kaipoke_other_office" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."cm_kaipoke_other_office" FROM anon, authenticated;

ALTER TABLE public."cm_kaipoke_service_usage" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."cm_kaipoke_service_usage" FROM anon, authenticated;

ALTER TABLE public."cs_docs" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."cs_docs" FROM anon, authenticated;

ALTER TABLE public."cs_kaipoke_info" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."cs_kaipoke_info" FROM anon, authenticated;

ALTER TABLE public."env_variables" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."env_variables" FROM anon, authenticated;

ALTER TABLE public."fax" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."fax" FROM anon, authenticated;

ALTER TABLE public."fax_log" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."fax_log" FROM anon, authenticated;

ALTER TABLE public."form_entries" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."form_entries" FROM anon, authenticated;

ALTER TABLE public."group_lw_channel_info" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."group_lw_channel_info" FROM anon, authenticated;

ALTER TABLE public."groups_lw" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."groups_lw" FROM anon, authenticated;

ALTER TABLE public."groups_lw_temp" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."groups_lw_temp" FROM anon, authenticated;

ALTER TABLE public."orgs" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."orgs" FROM anon, authenticated;

ALTER TABLE public."orgs_temp" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."orgs_temp" FROM anon, authenticated;

ALTER TABLE public."rpa_command_requests" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."rpa_command_requests" FROM anon, authenticated;

ALTER TABLE public."shift" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."shift" FROM anon, authenticated;

ALTER TABLE public."shift_records" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."shift_records" FROM anon, authenticated;

ALTER TABLE public."spot_offer_request_table" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."spot_offer_request_table" FROM anon, authenticated;

ALTER TABLE public."staff_log" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."staff_log" FROM anon, authenticated;

ALTER TABLE public."user_advance_payment_applications" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."user_advance_payment_applications" FROM anon, authenticated;

ALTER TABLE public."users" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."users" FROM anon, authenticated;

ALTER TABLE public."users_lw_temp" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."users_lw_temp" FROM anon, authenticated;

GRANT SELECT, UPDATE ON TABLE public."alert_log" TO authenticated;

GRANT SELECT ON TABLE public."cs_docs" TO authenticated;
DROP POLICY IF EXISTS "rls25_cs_docs_select" ON public."cs_docs";
CREATE POLICY "rls25_cs_docs_select" ON public."cs_docs" FOR SELECT TO authenticated USING (public.rls25_is_active_user());

GRANT UPDATE, SELECT ON TABLE public."cs_kaipoke_info" TO authenticated;
DROP POLICY IF EXISTS "rls25_cs_kaipoke_info_select" ON public."cs_kaipoke_info";
CREATE POLICY "rls25_cs_kaipoke_info_select" ON public."cs_kaipoke_info" FOR SELECT TO authenticated USING (public.rls25_is_active_user());
DROP POLICY IF EXISTS "rls25_cs_kaipoke_info_update" ON public."cs_kaipoke_info";
CREATE POLICY "rls25_cs_kaipoke_info_update" ON public."cs_kaipoke_info" FOR UPDATE TO authenticated USING (public.rls25_is_active_user()) WITH CHECK (public.rls25_is_active_user());

GRANT SELECT ON TABLE public."fax" TO authenticated;
DROP POLICY IF EXISTS "rls25_fax_select" ON public."fax";
CREATE POLICY "rls25_fax_select" ON public."fax" FOR SELECT TO authenticated USING (public.rls25_is_active_user());

GRANT SELECT, UPDATE, DELETE ON TABLE public."form_entries" TO authenticated;
DROP POLICY IF EXISTS "rls25_form_entries_delete" ON public."form_entries";
CREATE POLICY "rls25_form_entries_delete" ON public."form_entries" FOR DELETE TO authenticated USING (((auth_uid = auth.uid()) OR public.rls25_has_role(ARRAY['admin','manager','full'])));
DROP POLICY IF EXISTS "rls25_form_entries_select" ON public."form_entries";
CREATE POLICY "rls25_form_entries_select" ON public."form_entries" FOR SELECT TO authenticated USING (((auth_uid = auth.uid()) OR public.rls25_has_role(ARRAY['admin','manager','full'])));
DROP POLICY IF EXISTS "rls25_form_entries_update" ON public."form_entries";
CREATE POLICY "rls25_form_entries_update" ON public."form_entries" FOR UPDATE TO authenticated USING (((auth_uid = auth.uid()) OR public.rls25_has_role(ARRAY['admin','manager','full']))) WITH CHECK (((auth_uid = auth.uid()) OR public.rls25_has_role(ARRAY['admin','manager','full'])));

GRANT SELECT ON TABLE public."orgs" TO authenticated;
DROP POLICY IF EXISTS "rls25_orgs_select" ON public."orgs";
CREATE POLICY "rls25_orgs_select" ON public."orgs" FOR SELECT TO authenticated USING (public.rls25_is_active_user());

GRANT INSERT, SELECT, UPDATE, DELETE ON TABLE public."rpa_command_requests" TO authenticated;
DROP POLICY IF EXISTS "rls25_rpa_command_requests_delete" ON public."rpa_command_requests";
CREATE POLICY "rls25_rpa_command_requests_delete" ON public."rpa_command_requests" FOR DELETE TO authenticated USING (((requester_id = public.rls25_current_user_id()) OR public.rls25_has_role(ARRAY['admin','manager','full'])));
DROP POLICY IF EXISTS "rls25_rpa_command_requests_insert" ON public."rpa_command_requests";
CREATE POLICY "rls25_rpa_command_requests_insert" ON public."rpa_command_requests" FOR INSERT TO authenticated WITH CHECK (((requester_id = public.rls25_current_user_id()) OR public.rls25_has_role(ARRAY['admin','manager','full'])));
DROP POLICY IF EXISTS "rls25_rpa_command_requests_select" ON public."rpa_command_requests";
CREATE POLICY "rls25_rpa_command_requests_select" ON public."rpa_command_requests" FOR SELECT TO authenticated USING (((requester_id = public.rls25_current_user_id()) OR public.rls25_has_role(ARRAY['admin','manager','full'])));
DROP POLICY IF EXISTS "rls25_rpa_command_requests_update" ON public."rpa_command_requests";
CREATE POLICY "rls25_rpa_command_requests_update" ON public."rpa_command_requests" FOR UPDATE TO authenticated USING (((requester_id = public.rls25_current_user_id()) OR public.rls25_has_role(ARRAY['admin','manager','full']))) WITH CHECK (((requester_id = public.rls25_current_user_id()) OR public.rls25_has_role(ARRAY['admin','manager','full'])));

GRANT SELECT, INSERT ON TABLE public."spot_offer_request_table" TO authenticated;
DROP POLICY IF EXISTS "rls25_spot_offer_request_table_insert" ON public."spot_offer_request_table";
CREATE POLICY "rls25_spot_offer_request_table_insert" ON public."spot_offer_request_table" FOR INSERT TO authenticated WITH CHECK (public.rls25_is_active_user());
DROP POLICY IF EXISTS "rls25_spot_offer_request_table_select" ON public."spot_offer_request_table";
CREATE POLICY "rls25_spot_offer_request_table_select" ON public."spot_offer_request_table" FOR SELECT TO authenticated USING (public.rls25_is_active_user());

GRANT SELECT ON TABLE public."staff_log" TO authenticated;
DROP POLICY IF EXISTS "rls25_staff_log_select" ON public."staff_log";
CREATE POLICY "rls25_staff_log_select" ON public."staff_log" FOR SELECT TO authenticated USING (public.rls25_is_active_user());

GRANT UPDATE, SELECT, INSERT ON TABLE public."user_advance_payment_applications" TO authenticated;
DROP POLICY IF EXISTS "rls25_user_advance_payment_applications_insert" ON public."user_advance_payment_applications";
CREATE POLICY "rls25_user_advance_payment_applications_insert" ON public."user_advance_payment_applications" FOR INSERT TO authenticated WITH CHECK (((user_id = public.rls25_current_user_id()) OR public.rls25_has_role(ARRAY['admin','manager','full'])));
DROP POLICY IF EXISTS "rls25_user_advance_payment_applications_select" ON public."user_advance_payment_applications";
CREATE POLICY "rls25_user_advance_payment_applications_select" ON public."user_advance_payment_applications" FOR SELECT TO authenticated USING (((user_id = public.rls25_current_user_id()) OR public.rls25_has_role(ARRAY['admin','manager','full'])));
DROP POLICY IF EXISTS "rls25_user_advance_payment_applications_update" ON public."user_advance_payment_applications";
CREATE POLICY "rls25_user_advance_payment_applications_update" ON public."user_advance_payment_applications" FOR UPDATE TO authenticated USING (((user_id = public.rls25_current_user_id()) OR public.rls25_has_role(ARRAY['admin','manager','full']))) WITH CHECK (((user_id = public.rls25_current_user_id()) OR public.rls25_has_role(ARRAY['admin','manager','full'])));

GRANT SELECT, UPDATE, INSERT, DELETE ON TABLE public."users" TO authenticated;
DROP POLICY IF EXISTS "rls25_users_delete" ON public."users";
CREATE POLICY "rls25_users_delete" ON public."users" FOR DELETE TO authenticated USING (public.rls25_has_role(ARRAY['admin','manager','full']));
DROP POLICY IF EXISTS "rls25_users_insert" ON public."users";
CREATE POLICY "rls25_users_insert" ON public."users" FOR INSERT TO authenticated WITH CHECK ((auth_user_id = auth.uid()));
DROP POLICY IF EXISTS "rls25_users_select" ON public."users";
CREATE POLICY "rls25_users_select" ON public."users" FOR SELECT TO authenticated USING (((auth_user_id = auth.uid()) OR public.rls25_has_role(ARRAY['admin','manager','full'])));
DROP POLICY IF EXISTS "rls25_users_update" ON public."users";
CREATE POLICY "rls25_users_update" ON public."users" FOR UPDATE TO authenticated USING (((auth_user_id = auth.uid()) OR public.rls25_has_role(ARRAY['admin','manager','full']))) WITH CHECK (((auth_user_id = auth.uid()) OR public.rls25_has_role(ARRAY['admin','manager','full'])));
COMMIT;
