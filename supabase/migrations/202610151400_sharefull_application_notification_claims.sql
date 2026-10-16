-- 応募キャンセルの再処理時にLINE WORKS通知を重複送信しないためのclaim履歴。
ALTER TABLE public.spot_offer_application_events
  ADD COLUMN IF NOT EXISTS notification_claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS notification_error text,
  ADD COLUMN IF NOT EXISTS previous_application_state text,
  ADD COLUMN IF NOT EXISTS cancellation_reason text;

ALTER TABLE IF EXISTS public.sharefull_rpa_test_spot_offer_application_events
  ADD COLUMN IF NOT EXISTS notification_claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS notification_error text,
  ADD COLUMN IF NOT EXISTS cancellation_reason text;

CREATE OR REPLACE FUNCTION public.record_spot_offer_application(
  p_request_id uuid,p_provider text,p_application_key text,p_event_id text,
  p_state text,p_occurred_at timestamptz,p_name text DEFAULT NULL,p_sex text DEFAULT NULL,p_url text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  chosen public.spot_offer_applications;
  active_count integer;
  inserted_count integer;
  previous_state text;
BEGIN
  IF p_state NOT IN ('applied','confirmed','cancelled') OR nullif(p_application_key,'') IS NULL OR nullif(p_event_id,'') IS NULL OR p_occurred_at IS NULL THEN
    RAISE EXCEPTION 'Invalid application event';
  END IF;
  PERFORM 1 FROM public.spot_offer_request_table WHERE id=p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;

  SELECT state INTO previous_state FROM public.spot_offer_applications
   WHERE request_id=p_request_id AND provider=p_provider AND application_key=p_application_key;
  INSERT INTO public.spot_offer_application_events(provider,event_id,request_id,previous_application_state)
  VALUES(p_provider,p_event_id,p_request_id,previous_state) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  IF inserted_count=0 THEN
    SELECT previous_application_state INTO previous_state FROM public.spot_offer_application_events
     WHERE provider=p_provider AND event_id=p_event_id;
    RETURN jsonb_build_object('duplicate',true,'previous_application_state',previous_state);
  END IF;

  INSERT INTO public.spot_offer_applications AS a(request_id,provider,application_key,state,applicant_name,applicant_sex,applicant_control_url,occurred_at)
  VALUES(p_request_id,p_provider,p_application_key,p_state,p_name,p_sex,p_url,p_occurred_at)
  ON CONFLICT(request_id,provider,application_key) DO UPDATE
    SET state=excluded.state,applicant_name=excluded.applicant_name,applicant_sex=excluded.applicant_sex,
        applicant_control_url=excluded.applicant_control_url,occurred_at=excluded.occurred_at
    WHERE excluded.occurred_at > a.occurred_at;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  IF inserted_count=0 THEN RETURN jsonb_build_object('stale',true,'previous_application_state',previous_state); END IF;

  SELECT count(*) INTO active_count FROM public.spot_offer_applications
   WHERE request_id=p_request_id AND state IN ('applied','confirmed');
  SELECT * INTO chosen FROM public.spot_offer_applications
   WHERE request_id=p_request_id AND state IN ('applied','confirmed') ORDER BY occurred_at,provider,application_key LIMIT 1;
  UPDATE public.spot_offer_request_table SET
    status=CASE WHEN active_count>0 THEN '確定' WHEN recruitment_paused THEN '募集なし' ELSE '募集中' END,
    applicant_name=chosen.applicant_name,applicant_sex=chosen.applicant_sex,applicant_control_url=chosen.applicant_control_url,
    applicant_source=chosen.provider,application_state=chosen.state,application_conflict=active_count>1,
    recruitment_revision=recruitment_revision+1,updated_at=now()
   WHERE id=p_request_id;
  RETURN jsonb_build_object('ok',true,'active_count',active_count,'conflict',active_count>1,'previous_application_state',previous_state);
END;
$$;

REVOKE ALL ON FUNCTION public.record_spot_offer_application(uuid,text,text,text,text,timestamptz,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_spot_offer_application(uuid,text,text,text,text,timestamptz,text,text,text) TO service_role;
