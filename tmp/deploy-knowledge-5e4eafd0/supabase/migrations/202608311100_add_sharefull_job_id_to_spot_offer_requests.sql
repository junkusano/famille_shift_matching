ALTER TABLE public.spot_offer_request_table
  ADD COLUMN IF NOT EXISTS sharefull_job_id text;

COMMENT ON COLUMN public.spot_offer_request_table.sharefull_job_id IS
  'Sharefull側で実際に掲載されたスポット案件ID';

CREATE INDEX IF NOT EXISTS spot_offer_request_table_sharefull_job_id_idx
  ON public.spot_offer_request_table (sharefull_job_id);
