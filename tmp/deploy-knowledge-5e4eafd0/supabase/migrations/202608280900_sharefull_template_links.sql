ALTER TABLE public.spot_offer_template_unified
  ADD COLUMN IF NOT EXISTS sharefull_template_id text;

ALTER TABLE public.spot_offer_template_unified
  DROP CONSTRAINT IF EXISTS spot_offer_template_unified_sharefull_id_not_base;

ALTER TABLE public.spot_offer_template_unified
  ADD CONSTRAINT spot_offer_template_unified_sharefull_id_not_base
  CHECK (
    sharefull_template_id IS NULL
    OR sharefull_template_id <> '428828'
  );

CREATE INDEX IF NOT EXISTS spot_offer_template_unified_sharefull_id_idx
  ON public.spot_offer_template_unified (sharefull_template_id);
