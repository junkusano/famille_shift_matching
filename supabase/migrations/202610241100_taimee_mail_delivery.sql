ALTER TABLE public.spot_offer_mail_receipts DROP CONSTRAINT spot_offer_mail_receipts_provider_check;
ALTER TABLE public.spot_offer_mail_receipts ADD CONSTRAINT spot_offer_mail_receipts_provider_check CHECK (provider IN ('sharefull','taimee'));
ALTER TABLE public.spot_offer_mail_receipts DROP CONSTRAINT spot_offer_mail_receipts_outcome_check;
ALTER TABLE public.spot_offer_mail_receipts ADD CONSTRAINT spot_offer_mail_receipts_outcome_check CHECK (outcome IN ('queued','cancelled','stale','work_finished','no_target','out_of_scope'));
ALTER TABLE public.spot_offer_mail_receipts ADD COLUMN close_runner_job_id uuid REFERENCES public.rpa_runner_jobs(id) ON DELETE SET NULL;

-- 応募更新と同じ行ロックで、取消と競合した旧確定から停止ジョブを作らない。
CREATE FUNCTION public.apply_taimee_mail_sync(p_request_id uuid,p_application_key text,p_event_id text,p_occurred_at timestamptz,p_state text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.spot_offer_request_table; a public.spot_offer_applications;
 job_id uuid; job_status text; operation_key text;
BEGIN
 SELECT * INTO r FROM public.spot_offer_request_table WHERE id=p_request_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'REQUEST_MISSING'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.spot_offer_application_events WHERE provider='taimee' AND event_id=p_event_id AND request_id=r.id) THEN RAISE EXCEPTION 'EVENT_NOT_RECORDED'; END IF;
 SELECT * INTO a FROM public.spot_offer_applications WHERE request_id=r.id AND provider='taimee' AND application_key=p_application_key;
 IF NOT FOUND OR a.state<>p_state OR a.occurred_at<>p_occurred_at THEN RETURN jsonb_build_object('outcome','stale'); END IF;
 IF p_state='cancelled' THEN
  IF NOT EXISTS (SELECT 1 FROM public.spot_offer_applications WHERE request_id=r.id AND state IN ('applied','confirmed')) THEN
   UPDATE public.rpa_runner_jobs SET status='cancelled' WHERE job_type='sharefull.close_spot_offer' AND status='pending'
    AND payload->>'spot_offer_request_id'=r.id::text AND payload->>'created_from'='/api/rpa/taimee/confirmed';
  END IF;
  -- 担当者・手動停止・締切の確認と再掲載は既存Cron/claimで行う。
  RETURN jsonb_build_object('outcome','cancelled','republication','reconcile_pending');
 END IF;
 IF p_state<>'confirmed' THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;
 IF r.sharefull_job_id IS NULL OR r.sharefull_status='closed' OR EXISTS (SELECT 1 FROM public.spot_offer_applications WHERE request_id=r.id AND provider='sharefull' AND state IN ('applied','confirmed')) THEN RETURN jsonb_build_object('outcome','no_target'); END IF;
 IF nullif(trim(r.sharefull_order_id),'') IS NULL THEN RAISE EXCEPTION 'SHAREFULL_ORDER_MISSING'; END IF;
 operation_key='spot-sync:sharefull:close:'||r.sharefull_order_id||':'||r.recruitment_revision;
 SELECT id,status INTO job_id,job_status FROM public.rpa_runner_jobs WHERE payload->>'sync_operation_key'=operation_key ORDER BY created_at LIMIT 1;
 IF job_id IS NOT NULL AND job_status IN ('failed','cancelled') THEN RAISE EXCEPTION 'CLOSE_JOB_NEEDS_REVIEW'; END IF;
 IF job_id IS NULL THEN
  -- 別応募によるrevision更新があっても同一公開求人の実行待ちは共有する。
  SELECT id INTO job_id FROM public.rpa_runner_jobs WHERE job_type='sharefull.close_spot_offer'
   AND status IN ('pending','claimed') AND payload->>'spot_offer_request_id'=r.id::text
   AND payload->>'sharefull_order_id'=r.sharefull_order_id ORDER BY created_at LIMIT 1;
 END IF;
 IF job_id IS NULL THEN
  IF EXISTS (SELECT 1 FROM public.rpa_runner_jobs WHERE job_type='sharefull.close_spot_offer'
   AND status='failed' AND payload->>'spot_offer_request_id'=r.id::text
   AND payload->>'sharefull_order_id'=r.sharefull_order_id) THEN RAISE EXCEPTION 'CLOSE_JOB_NEEDS_REVIEW'; END IF;
  INSERT INTO public.rpa_runner_jobs(job_type,status,payload) VALUES('sharefull.close_spot_offer','pending',jsonb_build_object(
   'spot_offer_request_id',r.id,'sharefull_order_id',r.sharefull_order_id,'sharefull_job_id',r.sharefull_job_id,
   'sync_operation_key',operation_key,'taimee_event_id',p_event_id,'created_from','/api/rpa/taimee/confirmed')) ON CONFLICT DO NOTHING RETURNING id INTO job_id;
  IF job_id IS NULL THEN SELECT id INTO job_id FROM public.rpa_runner_jobs WHERE payload->>'sync_operation_key'=operation_key AND status IN ('pending','claimed','completed') LIMIT 1; END IF;
 END IF;
 IF job_id IS NULL THEN RAISE EXCEPTION 'CLOSE_JOB_NOT_RECORDED'; END IF;
 RETURN jsonb_build_object('outcome','queued','close_job_id',job_id);
END;
$$;
REVOKE ALL ON FUNCTION public.apply_taimee_mail_sync(uuid,text,text,timestamptz,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_taimee_mail_sync(uuid,text,text,timestamptz,text) TO service_role;
