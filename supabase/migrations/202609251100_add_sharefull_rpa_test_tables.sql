-- Sharefull RPAの検証データを本番の案件・テンプレートから分離する。
-- 既存のタイミーPADやMyFamille画面は、これらのテーブルを参照しない。
CREATE TABLE IF NOT EXISTS public.sharefull_rpa_test_templates
  (LIKE public.spot_offer_template_unified INCLUDING DEFAULTS);

CREATE TABLE IF NOT EXISTS public.sharefull_rpa_test_requests
  (LIKE public.spot_offer_request_table INCLUDING DEFAULTS);

CREATE INDEX IF NOT EXISTS sharefull_rpa_test_templates_core_id_idx
  ON public.sharefull_rpa_test_templates (core_id);

CREATE INDEX IF NOT EXISTS sharefull_rpa_test_requests_core_id_idx
  ON public.sharefull_rpa_test_requests (core_id);

COMMENT ON TABLE public.sharefull_rpa_test_templates IS
  'Sharefull RPA検証用テンプレート。通常のテンプレート作成・タイミーPADから分離する。';

COMMENT ON TABLE public.sharefull_rpa_test_requests IS
  'Sharefull RPA検証用案件。通常の案件掲載・タイミーPADから分離する。';

-- 実行時にだけ、指定利用者の内容を検証用へ複製する。
-- 本番データを自動で複製しないため、運用者が明示的に呼び出す。
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
BEGIN
  DELETE FROM public.sharefull_rpa_test_requests;
  DELETE FROM public.sharefull_rpa_test_templates;

  INSERT INTO public.sharefull_rpa_test_templates
  SELECT *
  FROM public.spot_offer_template_unified
  WHERE kaipoke_cs_id = p_source_kaipoke_cs_id;

  UPDATE public.sharefull_rpa_test_templates
  SET core_id = 'test-' || core_id,
      template_title = CASE WHEN template_title IS NULL THEN NULL ELSE '【テスト】' || template_title END,
      internal_label = CASE WHEN internal_label IS NULL THEN NULL ELSE '【テスト】' || internal_label END,
      work_description = CASE WHEN work_description IS NULL THEN NULL ELSE '【テスト】' || work_description END,
      matching_place_name = CASE WHEN matching_place_name IS NULL THEN NULL ELSE '【テスト】' || matching_place_name END,
      meeting_place = CASE WHEN meeting_place IS NULL THEN NULL ELSE '【テスト】' || meeting_place END,
      meeting_place_banchi = CASE WHEN meeting_place_banchi IS NULL THEN NULL ELSE '【テスト】' || meeting_place_banchi END,
      matching_msg = CASE WHEN matching_msg IS NULL THEN NULL ELSE '【テスト】' || matching_msg END,
      cautions = CASE WHEN cautions IS NULL THEN NULL ELSE '【テスト】' || cautions END,
      work_address = CASE WHEN work_address IS NULL THEN NULL ELSE '【テスト】' || work_address END,
      auto_message = CASE WHEN auto_message IS NULL THEN NULL ELSE '【テスト】' || auto_message END,
      sharefull_template_id = NULL,
      sharefull_template_status = NULL,
      updated_at = now();

  INSERT INTO public.sharefull_rpa_test_requests
  SELECT *
  FROM public.spot_offer_request_table
  WHERE kaipoke_cs_id = p_source_kaipoke_cs_id;

  UPDATE public.sharefull_rpa_test_requests
  SET id = gen_random_uuid(),
      core_id = CASE WHEN core_id IS NULL THEN NULL ELSE 'test-' || core_id END,
      template_title = CASE WHEN template_title IS NULL THEN NULL ELSE '【テスト】' || template_title END,
      taimee_job_id = CASE WHEN taimee_job_id IS NULL THEN 'test-' || id::text ELSE 'test-' || taimee_job_id END,
      sharefull_job_id = NULL,
      sharefull_status = NULL,
      status = '募集中',
      updated_at = now();

  SELECT count(*) INTO template_count FROM public.sharefull_rpa_test_templates;
  SELECT count(*) INTO request_count FROM public.sharefull_rpa_test_requests;
  RETURN jsonb_build_object('templates', template_count, 'requests', request_count);
END;
$$;

REVOKE ALL ON FUNCTION public.seed_sharefull_rpa_test_data(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seed_sharefull_rpa_test_data(text) TO service_role;
