-- 資格証明書 attachments 内の不正な取得日を補正する。
-- 対象は添付IDで限定し、他の添付・他の form_entries は変更しない。

-- 修正前確認（必要時に実行）
-- select
--   fe.id as form_entry_id,
--   fe.last_name_kanji || fe.first_name_kanji as employee_name,
--   attachment.value ->> 'id' as attachment_id,
--   attachment.value ->> 'label' as certificate_label,
--   attachment.value ->> 'acquired_at' as acquired_at
-- from public.form_entries fe
-- cross join lateral jsonb_array_elements(fe.attachments) attachment(value)
-- where attachment.value ->> 'id' in (
--   'e5d6ef0c-ae0c-417c-a7f7-55f78f87b8be',
--   '8c32fbe0-905e-41b0-a51e-6de7d8d4c9b6'
-- );

with target_entries as (
  select id, attachments
  from public.form_entries
  where id in (
    'b7e9b32a-0cc6-4e0c-82d6-3ce1fdf54c11',
    '34a0374f-9694-462c-96b0-27acd253219b'
  )
), rebuilt_attachments as (
  select
    target_entries.id,
    jsonb_agg(
      case
        when attachment.value ->> 'id' in (
          'e5d6ef0c-ae0c-417c-a7f7-55f78f87b8be',
          '8c32fbe0-905e-41b0-a51e-6de7d8d4c9b6'
        ) then jsonb_set(
          attachment.value,
          '{acquired_at}',
          to_jsonb('2025-07-01T00:00:00+09:00'::text),
          true
        )
        else attachment.value
      end
      order by attachment.ordinality
    ) as attachments
  from target_entries
  cross join lateral jsonb_array_elements(target_entries.attachments)
    with ordinality as attachment(value, ordinality)
  group by target_entries.id
)
update public.form_entries fe
set attachments = rebuilt_attachments.attachments
from rebuilt_attachments
where fe.id = rebuilt_attachments.id
returning
  fe.id as form_entry_id,
  fe.last_name_kanji || fe.first_name_kanji as employee_name,
  fe.attachments;
