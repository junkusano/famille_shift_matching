-- Gmailの処理済みラベルとは独立した、認証済みAPI受領と後続処理の記録。
CREATE TABLE public.spot_offer_mail_receipts (
  provider text NOT NULL CHECK (provider = 'sharefull'),
  event_id text NOT NULL,
  event_kind text NOT NULL CHECK (event_kind IN ('confirmed','cancelled')),
  payload_hash text NOT NULL,
  order_id text,
  job_id text,
  occurred_at timestamptz NOT NULL,
  request_id uuid REFERENCES public.spot_offer_request_table(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received','retry','completed','ignored')),
  error_code text,
  outcome text CHECK (outcome IN ('queued','cancelled','stale','work_finished')),
  close_request_id uuid REFERENCES public.rpa_command_requests(id) ON DELETE SET NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  last_attempt_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  PRIMARY KEY (provider,event_id)
);
ALTER TABLE public.spot_offer_mail_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.spot_offer_mail_receipts FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.spot_offer_mail_receipts TO service_role;
CREATE INDEX spot_offer_mail_receipts_retry ON public.spot_offer_mail_receipts(status,last_attempt_at)
 WHERE status IN ('received','retry');

-- approved/doneも含め、同じメールによる停止指示は生涯一件にする。
CREATE UNIQUE INDEX sharefull_mail_close_operation
 ON public.rpa_command_requests ((request_details->>'sync_operation_key'))
 WHERE request_details->>'created_from' = '/api/rpa/sharefull/confirmed'
 AND request_details->>'sync_operation_key' IS NOT NULL;

-- 応募更新RPCと同じ案件行をロックし、最新状態確認と停止指示登録を不可分にする。
CREATE FUNCTION public.enqueue_sharefull_confirmation_close(
 p_request_id uuid,p_application_key text,p_event_id text,p_occurred_at timestamptz,
 p_requester_id uuid,p_payload jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.spot_offer_request_table; a public.spot_offer_applications;
 command_id uuid; operation_key text; payload jsonb;
BEGIN
 SELECT * INTO r FROM public.spot_offer_request_table WHERE id=p_request_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.spot_offer_application_events
   WHERE provider='sharefull' AND event_id=p_event_id AND request_id=r.id) THEN
  RAISE EXCEPTION 'Application event was not recorded';
 END IF;
 SELECT * INTO a FROM public.spot_offer_applications
 WHERE request_id=r.id AND provider='sharefull' AND application_key=p_application_key;
 IF NOT FOUND OR a.state<>'confirmed' OR a.occurred_at<>p_occurred_at THEN
  RETURN jsonb_build_object('outcome','stale');
 END IF;
 IF nullif(trim(r.taimee_job_id),'') IS NULL THEN
  RETURN jsonb_build_object('outcome','target_missing');
 END IF;
 operation_key='spot-sync:taimee:close:'||r.taimee_job_id||':sharefull-confirmed:'||p_event_id;
 payload=p_payload || jsonb_build_object(
  'command','close_job','action','withdraw_taimee_job','reason','other_application',
  'created_from','/api/rpa/sharefull/confirmed','sync_operation_key',operation_key,
  'taimee_job_id',r.taimee_job_id,'sharefull_application_key',p_application_key,
  'spot_offer_request',coalesce(p_payload->'spot_offer_request','{}'::jsonb) ||
    jsonb_build_object('id',r.id,'taimee_job_id',r.taimee_job_id));
 INSERT INTO public.rpa_command_requests(template_id,requester_id,approver_id,approved_at,status,request_details)
 VALUES('fbd64ab4-a7a3-40b7-a718-61d6fac39525',p_requester_id,p_requester_id,now(),'approved',payload)
 ON CONFLICT DO NOTHING RETURNING id INTO command_id;
 IF command_id IS NULL THEN
  SELECT id INTO command_id FROM public.rpa_command_requests
  WHERE request_details->>'sync_operation_key'=operation_key;
 END IF;
 IF command_id IS NULL THEN RAISE EXCEPTION 'Close command was not persisted'; END IF;
 RETURN jsonb_build_object('outcome','queued','close_request_id',command_id);
END $$;
REVOKE ALL ON FUNCTION public.enqueue_sharefull_confirmation_close(uuid,text,text,timestamptz,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_sharefull_confirmation_close(uuid,text,text,timestamptz,uuid,jsonb) TO service_role;

-- 後着キャンセルでは、まだ実行していない同応募のメール起点停止指示を取り消す。
CREATE FUNCTION public.cancel_pending_sharefull_mail_close()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.provider='sharefull' AND NEW.state='cancelled' THEN
  UPDATE public.rpa_command_requests SET status='cancelled',updated_at=now()
  WHERE request_details->>'created_from'='/api/rpa/sharefull/confirmed'
   AND request_details->'spot_offer_request'->>'id'=NEW.request_id::text
   AND request_details->>'sharefull_application_key'=NEW.application_key
   AND status IN ('approved','waiting_approval','pending');
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER cancel_pending_sharefull_mail_close AFTER INSERT OR UPDATE OF state ON public.spot_offer_applications
 FOR EACH ROW EXECUTE FUNCTION public.cancel_pending_sharefull_mail_close();
REVOKE ALL ON FUNCTION public.cancel_pending_sharefull_mail_close() FROM PUBLIC,anon,authenticated;
