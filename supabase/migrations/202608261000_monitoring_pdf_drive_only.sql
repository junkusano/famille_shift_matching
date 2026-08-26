begin;

alter table public.client_monitoring_pdf_snapshots
  alter column storage_bucket drop not null,
  alter column storage_bucket drop default,
  alter column storage_path drop not null;

comment on column public.client_monitoring_pdf_snapshots.storage_bucket
  is 'Legacy field. Monitoring PDFs are stored only in Google Drive; new rows leave this null.';
comment on column public.client_monitoring_pdf_snapshots.storage_path
  is 'Legacy field. Monitoring PDFs are stored only in Google Drive; new rows leave this null.';

commit;
