ALTER TABLE public.spot_offer_request_table
  ADD COLUMN IF NOT EXISTS sharefull_status text;

COMMENT ON COLUMN public.spot_offer_request_table.sharefull_status IS
  'Sharefull側のスポット募集状態';
