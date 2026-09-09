ALTER TABLE public.spot_offer_template_unified
  ADD COLUMN IF NOT EXISTS sharefull_template_status text;

ALTER TABLE public.spot_offer_template_unified
  DROP CONSTRAINT IF EXISTS spot_offer_template_unified_sharefull_status_check;

ALTER TABLE public.spot_offer_template_unified
  ADD CONSTRAINT spot_offer_template_unified_sharefull_status_check
  CHECK (
    sharefull_template_status IS NULL
    OR sharefull_template_status IN ('template_review', 'ready_for_offer')
  );

COMMENT ON COLUMN public.spot_offer_template_unified.sharefull_template_status IS
  'シェアフルテンプレート単位の審査状態。template_review=審査中、ready_for_offer=案件掲載可能';

CREATE INDEX IF NOT EXISTS spot_offer_template_unified_sharefull_status_idx
  ON public.spot_offer_template_unified (sharefull_template_status);

-- 既存のシェアフルテンプレートは、現在の運用方針に合わせて審査完了扱いにする。
UPDATE public.spot_offer_template_unified
SET sharefull_template_status = 'ready_for_offer'
WHERE sharefull_template_id IS NOT NULL
  AND sharefull_template_status IS NULL;
