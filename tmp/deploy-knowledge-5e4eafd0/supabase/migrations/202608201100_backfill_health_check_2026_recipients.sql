-- Health checks completed before the workflow screen existed.
-- Insert them into the existing workflow table; no new table is introduced.
-- The source list only records a month. Per business instruction, March entries use 2026-04-01.
with health_check_type as (
  select id from public.wf_request_type where code = 'health_check'
), records (user_id, health_check_date, note) as (
  values
    ('rikaueda', date '2026-04-01', '健診結果: ○'),
    ('mikaimamichi', date '2026-04-01', '健診結果: ○'),
    ('sayurihatasa', date '2026-05-01', '健診結果: ○'),
    ('chieinagaki', date '2026-04-01', '健診結果: ○ / 医師の意見必要'),
    ('ryoukisuzuki', date '2026-04-01', '健診結果: ○'),
    ('wakanahorita', date '2026-04-01', '健診結果: ○'),
    ('masaakinakamura', date '2026-04-01', '健診結果: ○')
)
insert into public.wf_request (
  applicant_user_id,
  request_type_id,
  title,
  body,
  payload,
  status,
  submitted_at,
  completed_at
)
select
  records.user_id,
  health_check_type.id,
  '健康診断（既存受診記録）',
  '健康診断ページ作成前の受診済み記録。根拠: 健康診断受診者２０２６.pdf。' || records.note,
  jsonb_build_object(
    'template', 'health_check',
    'health_check_date', records.health_check_date::text,
    'health_check_type', 'periodic',
    'health_check_legacy_backfill', true,
    'source_document', '健康診断受診者２０２６.pdf',
    'source_note', records.note
  ),
  'completed',
  records.health_check_date::timestamp at time zone 'Asia/Tokyo',
  records.health_check_date::timestamp at time zone 'Asia/Tokyo'
from records
cross join health_check_type
where not exists (
  select 1
  from public.wf_request existing
  where existing.applicant_user_id = records.user_id
    and existing.request_type_id = health_check_type.id
    and existing.payload ->> 'health_check_legacy_backfill' = 'true'
    and existing.payload ->> 'health_check_date' = records.health_check_date::text
);
