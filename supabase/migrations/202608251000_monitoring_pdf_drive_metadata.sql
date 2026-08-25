begin;

alter table public.client_monitoring_pdf_snapshots
  add column if not exists drive_file_id text,
  add column if not exists drive_web_view_link text,
  add column if not exists drive_folder_id text;

create unique index if not exists client_monitoring_pdf_snapshots_drive_file_id_key
  on public.client_monitoring_pdf_snapshots (drive_file_id)
  where drive_file_id is not null;

comment on column public.client_monitoring_pdf_snapshots.drive_file_id
  is 'Google Drive file ID for this immutable PDF version';
comment on column public.client_monitoring_pdf_snapshots.drive_web_view_link
  is 'Google Drive browser URL returned after upload';
comment on column public.client_monitoring_pdf_snapshots.drive_folder_id
  is 'Google Drive destination folder ID used at upload time';

commit;
