-- Sharefull RPAの検証データを、本番案件・テンプレート・応募情報から分離する。
-- タイミーPADと通常のMyFamille画面は、これらのテーブルを参照しない。

CREATE TABLE IF NOT EXISTS public.sharefull_rpa_test_spot_offer_template_unified
  (LIKE public.spot_offer_template_unified INCLUDING DEFAULTS);

CREATE TABLE IF NOT EXISTS public.sharefull_rpa_test_spot_offer_request_table
  (LIKE public.spot_offer_request_table INCLUDING DEFAULTS);

CREATE TABLE IF NOT EXISTS public.sharefull_rpa_test_spot_offer_applications (
  request_id uuid NOT NULL REFERENCES public.sharefull_rpa_test_spot_offer_request_table(id) ON DELETE CASCADE,
  provider text NOT NULL,
  application_key text NOT NULL,
  state text NOT NULL CHECK (state IN ('applied', 'confirmed', 'cancelled')),
  applicant_name text,
  applicant_sex text,
  applicant_control_url text,
  occurred_at timestamptz NOT NULL,
  PRIMARY KEY (request_id, provider, application_key)
);

CREATE TABLE IF NOT EXISTS public.sharefull_rpa_test_spot_offer_application_events (
  provider text NOT NULL,
  event_id text NOT NULL,
  request_id uuid NOT NULL REFERENCES public.sharefull_rpa_test_spot_offer_request_table(id) ON DELETE CASCADE,
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, event_id)
);

CREATE INDEX IF NOT EXISTS sharefull_rpa_test_spot_offer_template_core_id_idx
  ON public.sharefull_rpa_test_spot_offer_template_unified (core_id);

CREATE INDEX IF NOT EXISTS sharefull_rpa_test_spot_offer_request_core_id_idx
  ON public.sharefull_rpa_test_spot_offer_request_table (core_id);

ALTER TABLE public.sharefull_rpa_test_spot_offer_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sharefull_rpa_test_spot_offer_application_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sharefull_rpa_test_spot_offer_applications,
  public.sharefull_rpa_test_spot_offer_application_events FROM anon, authenticated;
GRANT ALL ON public.sharefull_rpa_test_spot_offer_applications,
  public.sharefull_rpa_test_spot_offer_application_events TO service_role;

COMMENT ON TABLE public.sharefull_rpa_test_spot_offer_template_unified IS
  'Sharefull RPA検証用テンプレート。本番のspot_offer_template_unifiedから分離。';

COMMENT ON TABLE public.sharefull_rpa_test_spot_offer_request_table IS
  'Sharefull RPA検証用案件。本番のspot_offer_request_tableとタイミーPADから分離。';

COMMENT ON TABLE public.sharefull_rpa_test_spot_offer_applications IS
  'Sharefull RPA検証用応募。本番のspot_offer_applicationsから分離。';

COMMENT ON TABLE public.sharefull_rpa_test_spot_offer_application_events IS
  'Sharefull RPA検証用応募イベントの重複防止履歴。';

-- 指定利用者の本番データを、明示的に呼び出したときだけ検証用へコピーする。
-- コピー先は毎回リセットするため、実行中のテストジョブがない状態で実行する。
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
  v_source_min_date date;
  v_date_delta integer;
BEGIN
  SELECT min(shift_start_date::date)
    INTO v_source_min_date
    FROM public.spot_offer_request_table
   WHERE kaipoke_cs_id = p_source_kaipoke_cs_id;

  IF v_source_min_date IS NULL THEN
    RETURN jsonb_build_object('templates', 0, 'requests', 0, 'applications', 0, 'warning', 'source records not found');
  END IF;

  -- テスト実行日の翌日を最初の日付にし、元データの日付間隔は維持する。
  v_date_delta := (current_date + 1) - v_source_min_date;

  DELETE FROM public.sharefull_rpa_test_spot_offer_application_events;
  DELETE FROM public.sharefull_rpa_test_spot_offer_applications;
  DELETE FROM public.sharefull_rpa_test_spot_offer_request_table;
  DELETE FROM public.sharefull_rpa_test_spot_offer_template_unified;

  INSERT INTO public.sharefull_rpa_test_spot_offer_template_unified
  SELECT *
    FROM public.spot_offer_template_unified
   WHERE kaipoke_cs_id = p_source_kaipoke_cs_id;

  UPDATE public.sharefull_rpa_test_spot_offer_template_unified
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
         start_at = CASE WHEN start_at IS NULL THEN NULL ELSE start_at + make_interval(days => v_date_delta) END,
         end_at = CASE WHEN end_at IS NULL THEN NULL ELSE end_at + make_interval(days => v_date_delta) END,
         sharefull_template_id = NULL,
         sharefull_template_status = NULL,
         updated_at = now();

  INSERT INTO public.sharefull_rpa_test_spot_offer_request_table
  SELECT *
    FROM public.spot_offer_request_table
   WHERE kaipoke_cs_id = p_source_kaipoke_cs_id;

  UPDATE public.sharefull_rpa_test_spot_offer_request_table
     SET id = gen_random_uuid(),
         core_id = CASE WHEN core_id IS NULL THEN NULL ELSE 'test-' || core_id END,
         template_title = CASE WHEN template_title IS NULL THEN NULL ELSE '【テスト】' || template_title END,
         shift_start_date = CASE WHEN shift_start_date IS NULL THEN NULL ELSE (shift_start_date::date + v_date_delta) END,
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
    'first_test_date', current_date + 1
  );
END;
$$;

-- テスト用応募を明示的に登録するための入口。
CREATE OR REPLACE FUNCTION public.record_sharefull_rpa_test_application(
  p_request_id uuid,
  p_provider text,
  p_application_key text,
  p_event_id text,
  p_state text,
  p_occurred_at timestamptz,
  p_name text DEFAULT NULL,
  p_sex text DEFAULT NULL,
  p_url text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  active_count integer;
BEGIN
  IF p_state NOT IN ('applied', 'confirmed', 'cancelled')
     OR nullif(p_application_key, '') IS NULL
     OR nullif(p_event_id, '') IS NULL
     OR p_occurred_at IS NULL THEN
    RAISE EXCEPTION 'Invalid test application event';
  END IF;

  PERFORM 1
    FROM public.sharefull_rpa_test_spot_offer_request_table
   WHERE id = p_request_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Test request not found';
  END IF;

  INSERT INTO public.sharefull_rpa_test_spot_offer_application_events(provider, event_id, request_id)
  VALUES (p_provider, p_event_id, p_request_id)
  ON CONFLICT DO NOTHING;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('duplicate', true);
  END IF;

  INSERT INTO public.sharefull_rpa_test_spot_offer_applications(
    request_id, provider, application_key, state, applicant_name,
    applicant_sex, applicant_control_url, occurred_at
  ) VALUES (
    p_request_id, p_provider, p_application_key, p_state, p_name,
    p_sex, p_url, p_occurred_at
  )
  ON CONFLICT (request_id, provider, application_key) DO UPDATE
     SET state = excluded.state,
         applicant_name = excluded.applicant_name,
         applicant_sex = excluded.applicant_sex,
         applicant_control_url = excluded.applicant_control_url,
         occurred_at = excluded.occurred_at
   WHERE excluded.occurred_at > sharefull_rpa_test_spot_offer_applications.occurred_at;

  SELECT count(*)
    INTO active_count
    FROM public.sharefull_rpa_test_spot_offer_applications
   WHERE request_id = p_request_id
     AND state IN ('applied', 'confirmed');

  UPDATE public.sharefull_rpa_test_spot_offer_request_table
     SET status = CASE WHEN active_count > 0 THEN '確定' ELSE '募集中' END,
         applicant_source = CASE WHEN active_count > 0 THEN p_provider ELSE NULL END,
         application_state = CASE WHEN active_count > 0 THEN p_state ELSE NULL END,
         application_conflict = active_count > 1,
         updated_at = now()
   WHERE id = p_request_id;

  RETURN jsonb_build_object('ok', true, 'active_count', active_count, 'conflict', active_count > 1);
END;
$$;

REVOKE ALL ON FUNCTION public.seed_sharefull_rpa_test_data(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_sharefull_rpa_test_application(uuid, text, text, text, text, timestamptz, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seed_sharefull_rpa_test_data(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_sharefull_rpa_test_application(uuid, text, text, text, text, timestamptz, text, text, text) TO service_role;
