-- PATCHの返却行へのOR条件の再適用を避け、claim取得と返却をDB内で完結させる。
CREATE FUNCTION public.claim_sharefull_application_notification(
 p_provider text,p_event_id text,p_event_table text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE claimed_count integer;
BEGIN
 IF p_event_table='spot_offer_application_events' THEN
  UPDATE public.spot_offer_application_events SET notification_claimed_at=now(),notification_error=NULL
  WHERE provider=p_provider AND event_id=p_event_id AND notified_at IS NULL
   AND (notification_claimed_at IS NULL OR notification_claimed_at<now()-interval '5 minutes');
 ELSIF p_event_table='sharefull_rpa_test_spot_offer_application_events' THEN
  UPDATE public.sharefull_rpa_test_spot_offer_application_events SET notification_claimed_at=now(),notification_error=NULL
  WHERE provider=p_provider AND event_id=p_event_id AND notified_at IS NULL
   AND (notification_claimed_at IS NULL OR notification_claimed_at<now()-interval '5 minutes');
 ELSE
  RAISE EXCEPTION 'Unsupported notification event table';
 END IF;
 GET DIAGNOSTICS claimed_count=ROW_COUNT;
 RETURN claimed_count=1;
END $$;
REVOKE ALL ON FUNCTION public.claim_sharefull_application_notification(text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_sharefull_application_notification(text,text,text) TO service_role;
