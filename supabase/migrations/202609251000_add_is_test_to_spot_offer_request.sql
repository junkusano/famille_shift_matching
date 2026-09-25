ALTER TABLE public.spot_offer_request_table
  ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.spot_offer_request_table.is_test IS
  '検証用のスポット案件であることを示す。追加時点では既存処理の対象条件を変更しない。';
