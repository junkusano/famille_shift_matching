-- Extend the existing Taimee applicant model without creating parallel tables.
alter table if exists public.taimee_applicants
  add column if not exists taimee_application_id text,
  add column if not exists full_name text,
  add column if not exists phone_display text;
alter table if exists public.taimee_applicant_documents
  add column if not exists content_sha256 text;
create unique index if not exists taimee_applicants_application_id_uq on public.taimee_applicants (taimee_application_id) where taimee_application_id is not null;
create unique index if not exists taimee_applicant_documents_storage_path_uq on public.taimee_applicant_documents (applicant_id, storage_path);
create index if not exists taimee_applicants_normalized_phone_idx on public.taimee_applicants (normalized_phone);
create index if not exists taimee_applicants_link_status_idx on public.taimee_applicants (link_status);
create index if not exists taimee_applicant_documents_type_idx on public.taimee_applicant_documents (applicant_id, document_type);
