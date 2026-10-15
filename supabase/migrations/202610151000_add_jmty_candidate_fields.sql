-- Jimoty candidate metadata is separate from Sharefull publication state.
ALTER TABLE public.spot_offer_template_unified
  ADD COLUMN IF NOT EXISTS jmty_template_status text;

ALTER TABLE public.spot_offer_template_unified
  DROP CONSTRAINT IF EXISTS spot_offer_template_unified_jmty_template_status_check,
  ADD CONSTRAINT spot_offer_template_unified_jmty_template_status_check
    CHECK (jmty_template_status IS NULL OR jmty_template_status IN ('template_review', 'ready_for_offer')),
  DROP CONSTRAINT IF EXISTS spot_offer_template_unified_jmty_approved_content_check;

ALTER TABLE public.spot_offer_request_table
  ADD COLUMN IF NOT EXISTS jmty_status text;

ALTER TABLE public.spot_offer_request_table
  DROP CONSTRAINT IF EXISTS spot_offer_request_table_jmty_status_check,
  ADD CONSTRAINT spot_offer_request_table_jmty_status_check
    CHECK (jmty_status IS NULL OR jmty_status IN ('template_review', 'ready_for_offer', 'published', 'closed'));

CREATE INDEX IF NOT EXISTS spot_offer_request_table_jmty_status_idx
  ON public.spot_offer_request_table (jmty_status, shift_start_date);

-- Sharefull test tables are already isolated from production; mirror Jimoty fields
-- there so the existing SHAREFULL_RPA_MODE=test routing never reads production rows.
ALTER TABLE public.sharefull_rpa_test_spot_offer_template_unified
  ADD COLUMN IF NOT EXISTS jmty_template_status text;

ALTER TABLE public.sharefull_rpa_test_spot_offer_template_unified
  DROP CONSTRAINT IF EXISTS sharefull_rpa_test_spot_offer_template_unified_jmty_template_status_check,
  ADD CONSTRAINT sharefull_rpa_test_spot_offer_template_unified_jmty_template_status_check
    CHECK (jmty_template_status IS NULL OR jmty_template_status IN ('template_review', 'ready_for_offer')),
  DROP CONSTRAINT IF EXISTS sharefull_rpa_test_spot_offer_template_unified_jmty_approved_content_check;

ALTER TABLE public.sharefull_rpa_test_spot_offer_request_table
  ADD COLUMN IF NOT EXISTS jmty_status text;

ALTER TABLE public.sharefull_rpa_test_spot_offer_request_table
  DROP CONSTRAINT IF EXISTS sharefull_rpa_test_spot_offer_request_table_jmty_status_check,
  ADD CONSTRAINT sharefull_rpa_test_spot_offer_request_table_jmty_status_check
    CHECK (jmty_status IS NULL OR jmty_status IN ('template_review', 'ready_for_offer', 'published', 'closed'));

CREATE INDEX IF NOT EXISTS sharefull_rpa_test_spot_offer_request_jmty_status_idx
  ON public.sharefull_rpa_test_spot_offer_request_table (jmty_status, shift_start_date);

COMMENT ON COLUMN public.spot_offer_template_unified.jmty_template_status IS
  'ジモティー専用文面の承認状態。Sharefullのテンプレート状態とは独立。';
COMMENT ON COLUMN public.spot_offer_request_table.jmty_status IS
  'ジモティー専用の掲載状態。Sharefullの掲載状態とは独立。';
