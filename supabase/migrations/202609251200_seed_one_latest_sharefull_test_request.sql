-- Sharefull RPAの初回検証は、指定利用者の最も未来の案件1件だけを使う。
CREATE OR REPLACE FUNCTION public.seed_sharefull_rpa_test_data(
  p_source_kaipoke_cs_id text DEFAULT '12782561'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  template_count integer;
  request_count integer;
  v_source_request_id uuid;
  v_source_core_id uuid;
  v_source_date date;
  v_date_delta integer;
BEGIN
  SELECT id, core_id, shift_start_date::date
    INTO v_source_request_id, v_source_core_id, v_source_date
    FROM public.spot_offer_request_table
   WHERE kaipoke_cs_id = p_source_kaipoke_cs_id
   ORDER BY shift_start_date DESC NULLS LAST,
            start_at DESC NULLS LAST,
            id DESC
   LIMIT 1;

  IF v_source_request_id IS NULL OR v_source_date IS NULL THEN
    RETURN jsonb_build_object('templates', 0, 'requests', 0, 'applications', 0, 'warning', 'source records not found');
  END IF;

  -- テスト実行日の翌日を初日にする。
  v_date_delta := (current_date + 1) - v_source_date;

  DELETE FROM public.sharefull_rpa_test_spot_offer_application_events;
  DELETE FROM public.sharefull_rpa_test_spot_offer_applications;
  DELETE FROM public.sharefull_rpa_test_spot_offer_request_table;
  DELETE FROM public.sharefull_rpa_test_spot_offer_template_unified;

  INSERT INTO public.sharefull_rpa_test_spot_offer_template_unified
  SELECT *
    FROM public.spot_offer_template_unified
   WHERE kaipoke_cs_id = p_source_kaipoke_cs_id
     AND core_id IS NOT DISTINCT FROM v_source_core_id;

  UPDATE public.sharefull_rpa_test_spot_offer_template_unified
     SET template_title = CASE WHEN template_title IS NULL THEN NULL ELSE '【テスト】' || template_title END,
         internal_label = CASE WHEN internal_label IS NULL THEN NULL ELSE '【テスト】' || internal_label END,
         work_description = CASE WHEN work_description IS NULL THEN NULL ELSE '【テスト】' || work_description END,
         matching_place_name = CASE WHEN matching_place_name IS NULL THEN NULL ELSE '【テスト】' || matching_place_name END,
         meeting_place = CASE WHEN meeting_place IS NULL THEN NULL ELSE '【テスト】' || meeting_place END,
         meeting_place_banchi = CASE WHEN meeting_place_banchi IS NULL THEN NULL ELSE '【テスト】' || meeting_place_banchi END,
         matching_msg = CASE WHEN matching_msg IS NULL THEN NULL ELSE '【テスト】' || matching_msg END,
         cautions = CASE WHEN cautions IS NULL THEN NULL ELSE '【テスト】' || cautions END,
         work_address = CASE WHEN work_address IS NULL THEN NULL ELSE '【テスト】' || work_address END,
         auto_message = CASE WHEN auto_message IS NULL THEN NULL ELSE '【テスト】' || auto_message END,
         start_at = CASE WHEN start_at IS NULL THEN NULL ELSE start_at + make_interval(days => v_date_delta) END,
         end_at = CASE WHEN end_at IS NULL THEN NULL ELSE end_at + make_interval(days => v_date_delta) END,
         sharefull_template_id = NULL,
         sharefull_template_status = NULL,
         updated_at = now();

  INSERT INTO public.sharefull_rpa_test_spot_offer_request_table
  SELECT *
    FROM public.spot_offer_request_table
   WHERE id = v_source_request_id;

  UPDATE public.sharefull_rpa_test_spot_offer_request_table
     SET id = gen_random_uuid(),
         template_title = CASE WHEN template_title IS NULL THEN NULL ELSE '【テスト】' || template_title END,
         shift_start_date = shift_start_date::date + v_date_delta,
         start_at = CASE WHEN start_at IS NULL THEN NULL ELSE start_at + make_interval(days => v_date_delta) END,
         end_at = CASE WHEN end_at IS NULL THEN NULL ELSE end_at + make_interval(days => v_date_delta) END,
         taimee_job_id = CASE WHEN taimee_job_id IS NULL THEN 'test-' || id::text ELSE 'test-' || taimee_job_id END,
         sharefull_job_id = NULL,
         sharefull_order_id = NULL,
         sharefull_status = NULL,
         sharefull_sync_error = NULL,
         status = '募集中',
         updated_at = now();

  SELECT count(*) INTO template_count
    FROM public.sharefull_rpa_test_spot_offer_template_unified;
  SELECT count(*) INTO request_count
    FROM public.sharefull_rpa_test_spot_offer_request_table;

  RETURN jsonb_build_object(
    'templates', template_count,
    'requests', request_count,
    'applications', 0,
    'date_delta_days', v_date_delta,
    'first_test_date', current_date + 1,
    'selection', 'latest_shift_start_date'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.seed_sharefull_rpa_test_data(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seed_sharefull_rpa_test_data(text) TO service_role;
