-- Public recruitment submissions are written through submit_entry_application().
-- Do not add a unique normalized-email index until the historical duplicate rows
-- have been reviewed and resolved manually.

alter table public.form_entries
  add column if not exists submission_id uuid,
  add column if not exists normalized_email text generated always as (lower(btrim(email))) stored,
  add column if not exists reapply_requested_at timestamptz;

create unique index if not exists form_entries_submission_id_unique
  on public.form_entries (submission_id) where submission_id is not null;

create table if not exists public.entry_attachments (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null,
  upload_token uuid not null default gen_random_uuid(),
  entry_id uuid references public.form_entries(id) on delete set null,
  slot text not null,
  original_filename text not null,
  drive_file_id text,
  drive_web_view_link text,
  mime_type text,
  status text not null default 'pending' check (status in ('pending', 'uploaded', 'linked', 'failed')),
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (submission_id, upload_token),
  unique (drive_file_id)
);

create index if not exists entry_attachments_reconcile_idx
  on public.entry_attachments (status, submission_id) where status <> 'linked';

create or replace function public.submit_entry_application(
  p_submission_id uuid,
  p_payload jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(btrim(coalesce(p_payload->>'email', '')));
  v_existing public.form_entries%rowtype;
  v_candidate_ids uuid[];
  v_entry_id uuid;
begin
  if p_submission_id is null or v_email = '' then
    raise exception 'submission_id and email are required';
  end if;

  -- A retry with the same key always receives the original result.
  select * into v_existing from public.form_entries where submission_id = p_submission_id;
  if found then
    return jsonb_build_object('kind', 'created', 'entry_id', v_existing.id::text, 'idempotent', true);
  end if;

  -- Serialise requests for one normalised email without imposing an unsafe
  -- unique index on historical data that already contains duplicates.
  perform pg_advisory_xact_lock(hashtextextended(v_email, 0));

  select * into v_existing
    from public.form_entries
   where normalized_email = v_email
   order by created_at asc nulls last, id asc
   limit 1;
  if found then
    return jsonb_build_object('kind', 'duplicate_email', 'entry_id', v_existing.id::text);
  end if;

  select array_agg(id order by created_at asc nulls last, id asc) into v_candidate_ids
    from public.form_entries
   where btrim(coalesce(last_name_kanji, '')) = btrim(coalesce(p_payload->>'last_name_kanji', ''))
     and btrim(coalesce(first_name_kanji, '')) = btrim(coalesce(p_payload->>'first_name_kanji', ''))
     and lower(btrim(coalesce(last_name_kana, ''))) = lower(btrim(coalesce(p_payload->>'last_name_kana', '')))
     and lower(btrim(coalesce(first_name_kana, ''))) = lower(btrim(coalesce(p_payload->>'first_name_kana', '')))
     and birth_year = nullif(p_payload->>'birth_year', '')::int
     and birth_month = nullif(p_payload->>'birth_month', '')::int
     and birth_day = nullif(p_payload->>'birth_day', '')::int;

  if coalesce(array_length(v_candidate_ids, 1), 0) > 0 then
    return jsonb_build_object(
      'kind', case when array_length(v_candidate_ids, 1) = 1 then 'duplicate_candidate' else 'multiple_candidates' end,
      'entry_id', case when array_length(v_candidate_ids, 1) = 1 then v_candidate_ids[1]::text else null end,
      'candidate_count', array_length(v_candidate_ids, 1)
    );
  end if;

  insert into public.form_entries (
    submission_id, last_name_kanji, first_name_kanji, last_name_kana, first_name_kana,
    birth_year, birth_month, birth_day, gender, email, phone, postal_code, address,
    motivation, workstyle_other, health_condition, work_styles, commute_options,
    agreed_terms, agreed_privacy
  ) values (
    p_submission_id, btrim(p_payload->>'last_name_kanji'), btrim(p_payload->>'first_name_kanji'),
    btrim(p_payload->>'last_name_kana'), btrim(p_payload->>'first_name_kana'),
    nullif(p_payload->>'birth_year', '')::int, nullif(p_payload->>'birth_month', '')::int, nullif(p_payload->>'birth_day', '')::int,
    p_payload->>'gender', v_email, p_payload->>'phone', p_payload->>'postal_code', p_payload->>'address',
    p_payload->>'motivation', p_payload->>'workstyle_other', p_payload->>'health_condition',
    array(select jsonb_array_elements_text(coalesce(p_payload->'work_styles', '[]'::jsonb))),
    array(select jsonb_array_elements_text(coalesce(p_payload->'commute_options', '[]'::jsonb))),
    coalesce((p_payload->>'agreed_terms')::boolean, false), coalesce((p_payload->>'agreed_privacy')::boolean, false)
  ) returning id into v_entry_id;

  update public.entry_attachments
     set entry_id = v_entry_id, status = case when drive_file_id is null then status else 'linked' end, updated_at = now()
   where submission_id = p_submission_id and entry_id is null;

  return jsonb_build_object('kind', 'created', 'entry_id', v_entry_id::text, 'idempotent', false);
end;
$$;

revoke all on function public.submit_entry_application(uuid, jsonb) from public;
grant execute on function public.submit_entry_application(uuid, jsonb) to service_role;
