-- 医師の意見は健康診断結果の一部として本人画面にも表示する。
-- 既存環境に同名カラムがある場合も安全に再適用できるようにする。
alter table public.wf_request
  add column if not exists health_check_doctor_comment text;

comment on column public.wf_request.health_check_doctor_comment is
  'Doctor opinion for a health-check workflow request, shown on the applicant result screen.';
