ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS shift_coordinate_custom_filter jsonb,
  ADD COLUMN IF NOT EXISTS use_shift_coordinate_custom_filter boolean NOT NULL DEFAULT false;
