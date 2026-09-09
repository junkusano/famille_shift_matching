-- Key / intermediate / delta knowledge hierarchy.
-- Existing knowledge_items rows remain valid; new hierarchy columns are nullable
-- unless a hierarchy import explicitly supplies them.

begin;

alter table public.knowledge_items
  add column if not exists concept_level smallint,
  add column if not exists stability text,
  add column if not exists confidentiality text,
  add column if not exists source_references jsonb not null default '[]'::jsonb,
  add column if not exists last_verified_at timestamptz,
  add column if not exists processing_status text not null default 'generated',
  add column if not exists generation_model text,
  add column if not exists important_changes jsonb not null default '[]'::jsonb;

alter table public.knowledge_items
  drop constraint if exists knowledge_items_concept_level_check,
  add constraint knowledge_items_concept_level_check
    check (concept_level is null or concept_level between 1 and 4),
  drop constraint if exists knowledge_items_stability_check,
  add constraint knowledge_items_stability_check
    check (stability is null or stability in ('core', 'slow_change', 'changing')),
  drop constraint if exists knowledge_items_confidentiality_check,
  add constraint knowledge_items_confidentiality_check
    check (confidentiality is null or confidentiality in ('public', 'internal', 'restricted')),
  drop constraint if exists knowledge_items_processing_status_check,
  add constraint knowledge_items_processing_status_check
    check (processing_status in ('generated', 'reviewed', 'applied', 'review_required'));

create index if not exists knowledge_items_hierarchy_filter_idx
  on public.knowledge_items (
    knowledge_type,
    category,
    concept_level,
    importance,
    updated_at desc
  )
  where is_current = true;

create index if not exists knowledge_items_period_hierarchy_idx
  on public.knowledge_items (
    knowledge_type,
    period_start desc,
    period_end desc
  )
  where is_current = true
    and knowledge_type in ('intermediate', 'delta');

-- One stable knowledge_key has one current row. Changed imports become a
-- revision so the old wording and its source metadata remain traceable.
create or replace function public.import_key_knowledge_revision(p_item jsonb)
returns table (
  knowledge_item_id uuid,
  action text,
  revision integer
)
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  existing public.knowledge_items%rowtype;
  fingerprint text;
  metadata_value jsonb;
  item_id uuid;
  item_version integer;
begin
  if coalesce(nullif(btrim(p_item ->> 'knowledge_key'), ''), '') = '' then
    raise exception 'knowledge_key is required';
  end if;
  if coalesce(nullif(btrim(p_item ->> 'title'), ''), '') = '' then
    raise exception 'title is required';
  end if;
  if coalesce(nullif(btrim(p_item ->> 'summary'), ''), '') = '' then
    raise exception 'summary is required';
  end if;
  if coalesce((p_item ->> 'concept_level')::smallint, 0) not between 1 and 4 then
    raise exception 'concept_level must be between 1 and 4';
  end if;
  if coalesce((p_item ->> 'importance')::integer, 0) not between 1 and 5 then
    raise exception 'importance must be between 1 and 5';
  end if;
  if p_item ->> 'stability' not in ('core', 'slow_change', 'changing') then
    raise exception 'invalid stability';
  end if;
  if p_item ->> 'confidentiality' not in ('public', 'internal', 'restricted') then
    raise exception 'invalid confidentiality';
  end if;

  fingerprint := coalesce(nullif(p_item ->> 'fingerprint', ''), '');
  metadata_value := coalesce(p_item -> 'metadata', '{}'::jsonb)
    || jsonb_build_object('key_knowledge_fingerprint', fingerprint);

  select *
    into existing
    from public.knowledge_items
   where knowledge_key = p_item ->> 'knowledge_key'
     and is_current = true
   for update;

  if found and coalesce(existing.metadata ->> 'key_knowledge_fingerprint', '') = fingerprint then
    return query select existing.id, 'skipped'::text, existing.version;
    return;
  end if;

  if found then
    update public.knowledge_items
       set is_current = false,
           review_status = 'superseded'
     where id = existing.id;
    item_version := existing.version + 1;
  else
    item_version := 1;
  end if;

  insert into public.knowledge_items (
    knowledge_key,
    primary_source_id,
    knowledge_type,
    title,
    summary,
    content,
    category,
    tags,
    importance,
    privacy_level,
    publishability,
    contains_personal_data,
    redaction_status,
    review_status,
    authorship,
    verification_status,
    version,
    is_current,
    parent_knowledge_id,
    supersedes_id,
    metadata,
    concept_level,
    stability,
    confidentiality,
    source_references,
    last_verified_at,
    processing_status,
    generation_model,
    important_changes
  ) values (
    p_item ->> 'knowledge_key',
    null,
    'key',
    p_item ->> 'title',
    p_item ->> 'summary',
    nullif(p_item ->> 'content', ''),
    nullif(p_item ->> 'category', ''),
    coalesce(array(select jsonb_array_elements_text(coalesce(p_item -> 'tags', '[]'::jsonb))), '{}'::text[]),
    (p_item ->> 'importance')::integer,
    (p_item ->> 'privacy_level')::integer,
    p_item ->> 'publishability',
    false,
    'not_required',
    'needs_review',
    'human',
    p_item ->> 'verification_status',
    item_version,
    true,
    case when had_existing then coalesce(existing.parent_knowledge_id, existing.id) else null end,
    case when had_existing then existing.id else null end,
    metadata_value,
    (p_item ->> 'concept_level')::smallint,
    p_item ->> 'stability',
    p_item ->> 'confidentiality',
    coalesce(p_item -> 'source_references', '[]'::jsonb),
    nullif(p_item ->> 'last_verified_at', '')::timestamptz,
    'review_required',
    nullif(p_item ->> 'generation_model', ''),
    coalesce(p_item -> 'important_changes', '[]'::jsonb)
  )
  returning id into item_id;

  return query select item_id, case when had_existing then 'revised' else 'created' end, item_version;
end;
$$;

revoke all on function public.import_key_knowledge_revision(jsonb) from public, anon, authenticated;
grant execute on function public.import_key_knowledge_revision(jsonb) to service_role;

commit;

