-- Office jobs own their schedule and a single remaining vacancy; they do not
-- borrow care-client IDs or insert artificial rows into the care shift table.
ALTER TABLE public.spot_offer_template_unified
 ADD COLUMN recruitment_kind text NOT NULL DEFAULT 'care',
 ADD CONSTRAINT spot_template_recruitment_kind CHECK (
  recruitment_kind='care' OR (recruitment_kind='office' AND kaipoke_cs_id IS NULL
   AND requires_license IS FALSE AND coalesce(cardinality(required_licenses),0)=0));
ALTER TABLE public.spot_offer_request_table
 ADD COLUMN recruitment_kind text NOT NULL DEFAULT 'care',
 ADD COLUMN office_headcount integer,
 ADD COLUMN office_mail_after timestamptz,
 ADD CONSTRAINT spot_request_recruitment_kind CHECK (
  (recruitment_kind='care' AND office_headcount IS NULL) OR
  (recruitment_kind='office' AND core_id IS NOT NULL AND shift_id IS NULL
   AND kaipoke_cs_id IS NULL AND office_headcount=1 AND office_headcount IS NOT NULL
   AND office_mail_after IS NOT NULL
   AND shift_start_date IS NOT NULL AND shift_start_time IS NOT NULL AND shift_end_time IS NOT NULL));

-- Normal client-side template editors cannot opt an unrelated case into the
-- production scope. Activation/deactivation and vacancy registration are ops.
CREATE FUNCTION public.guard_office_recruitment() RETURNS trigger
 LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF (TG_OP='INSERT' AND NEW.recruitment_kind='office') OR
    (TG_OP='UPDATE' AND NEW.recruitment_kind IS DISTINCT FROM OLD.recruitment_kind) OR
    (TG_TABLE_NAME='spot_offer_request_table' AND
     ((to_jsonb(NEW)->'office_headcount') IS DISTINCT FROM (to_jsonb(OLD)->'office_headcount') OR
      (to_jsonb(NEW)->'office_mail_after') IS DISTINCT FROM (to_jsonb(OLD)->'office_mail_after'))) THEN
  IF current_user NOT IN ('postgres','service_role','supabase_admin') THEN
   RAISE EXCEPTION 'OFFICE_REGISTRATION_REQUIRES_SERVICE_ROLE';
  END IF;
 END IF;
 IF NEW.recruitment_kind='office' AND TG_TABLE_NAME='spot_offer_request_table' THEN
  IF NOT EXISTS (SELECT 1 FROM public.spot_offer_template_unified
   WHERE core_id=NEW.core_id AND recruitment_kind='office' AND requires_license IS FALSE) THEN
   RAISE EXCEPTION 'OFFICE_TEMPLATE_REQUIRED';
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_office_recruitment() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_office_template BEFORE INSERT OR UPDATE ON public.spot_offer_template_unified
 FOR EACH ROW EXECUTE FUNCTION public.guard_office_recruitment();
CREATE TRIGGER guard_office_request BEFORE INSERT OR UPDATE ON public.spot_offer_request_table
 FOR EACH ROW EXECUTE FUNCTION public.guard_office_recruitment();

-- Preserve the existing test schema projection; no test Runner is activated.
DO $$ BEGIN
 IF to_regclass('public.sharefull_rpa_test_spot_offer_template_unified') IS NOT NULL THEN
  ALTER TABLE public.sharefull_rpa_test_spot_offer_template_unified ADD COLUMN recruitment_kind text NOT NULL DEFAULT 'care';
 END IF;
 IF to_regclass('public.sharefull_rpa_test_spot_offer_request_table') IS NOT NULL THEN
  ALTER TABLE public.sharefull_rpa_test_spot_offer_request_table ADD COLUMN recruitment_kind text NOT NULL DEFAULT 'care', ADD COLUMN office_headcount integer, ADD COLUMN office_mail_after timestamptz;
 END IF;
END $$;
