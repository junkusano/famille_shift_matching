alter table public.regular_shift_requests
  drop constraint if exists regular_shift_requests_weekly_shift_id_fkey;

alter table public.regular_shift_requests
  alter column weekly_shift_id type integer using weekly_shift_id::integer;

alter table public.regular_shift_requests
  add constraint regular_shift_requests_weekly_shift_id_fkey
  foreign key (weekly_shift_id)
  references public.shift_weekly_template (template_id)
  on delete restrict;
