CREATE OR REPLACE FUNCTION public.complete_sharefull_sync_job(
  p_job_id uuid,
  p_runner_id text,
  p_result jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE
  j public.rpa_runner_jobs;
  v_request_id uuid;
  v_job_id text;
  v_order_id text;
BEGIN
  SELECT * INTO j
  FROM public.rpa_runner_jobs
  WHERE id=p_job_id AND claimed_runner_id=p_runner_id
  FOR UPDATE;

  IF NOT FOUND THEN RETURN false; END IF;
  IF j.status='completed' THEN RETURN true; END IF;
  IF j.status<>'claimed' OR j.job_type NOT IN ('sharefull.create_spot_offer','sharefull.close_spot_offer') THEN
    RETURN false;
  END IF;

  v_request_id=NULLIF(j.payload->>'spot_offer_request_id','')::uuid;
  v_job_id=p_result->>'sharefull_job_id';
  v_order_id=p_result->>'sharefull_order_id';

  IF j.job_type='sharefull.close_spot_offer' THEN
    IF p_result->>'closed' IS DISTINCT FROM 'true'
      OR v_job_id IS DISTINCT FROM j.payload->>'sharefull_job_id'
      OR v_order_id IS DISTINCT FROM j.payload->>'sharefull_order_id' THEN
      RAISE EXCEPTION 'Close identity mismatch';
    END IF;

    IF v_request_id IS NULL THEN
      -- An explicitly marked one-off verification may target an already closed
      -- Sharefull listing that has no corresponding application row. It may
      -- complete only after the runner reports the exact listing IDs closed.
      IF j.payload->>'created_from' IS DISTINCT FROM 'codex-stop-test' THEN
        RAISE EXCEPTION 'Close request linkage missing';
      END IF;
    ELSE
      INSERT INTO public.spot_offer_publication_history
        VALUES(v_request_id,'sharefull',v_job_id,v_order_id,'closed',now())
        ON CONFLICT(request_id,provider,job_id)
        DO UPDATE SET state='closed',updated_at=now();

      UPDATE public.spot_offer_request_table
      SET sharefull_status='closed',sharefull_sync_error=null
      WHERE id=v_request_id AND sharefull_job_id=v_job_id AND sharefull_order_id=v_order_id;
    END IF;
  ELSIF j.payload->>'execution_mode'='publish' THEN
    IF v_job_id IS NULL OR v_job_id !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'Published job ID missing';
    END IF;

    INSERT INTO public.spot_offer_publication_history
      VALUES(v_request_id,'sharefull',v_job_id,v_order_id,'published',now())
      ON CONFLICT(request_id,provider,job_id)
      DO UPDATE SET management_id=excluded.management_id,state='published',updated_at=now();

    UPDATE public.spot_offer_request_table
    SET sharefull_job_id=v_job_id,
        sharefull_order_id=v_order_id,
        sharefull_status='published',
        sharefull_sync_error=CASE WHEN v_order_id IS NULL THEN 'URL管理番号が未取得です' ELSE null END
    WHERE id=v_request_id AND (sharefull_job_id IS NULL OR sharefull_job_id=v_job_id);

    IF NOT FOUND THEN RAISE EXCEPTION 'A different publication already exists'; END IF;
  END IF;

  UPDATE public.rpa_runner_jobs
  SET status='completed',result=p_result,completed_at=now()
  WHERE id=p_job_id;
  RETURN true;
END
$$;

REVOKE ALL ON FUNCTION public.complete_sharefull_sync_job(uuid,text,jsonb) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.complete_sharefull_sync_job(uuid,text,jsonb) TO service_role;
