create table if not exists public.sharefull_manual_deletion_audits (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.spot_offer_request_table(id),
  sharefull_job_id text not null unique check (sharefull_job_id ~ '^[1-9][0-9]*$'),
  sharefull_order_id text check (sharefull_order_id is null or sharefull_order_id ~ '^[1-9][0-9]*$'),
  confirmed_by uuid not null references auth.users(id),
  confirmed_at timestamptz not null default now(),
  reason text not null check (char_length(trim(reason)) between 1 and 500),
  request_snapshot jsonb not null,
  requeue_job_id uuid references public.rpa_runner_jobs(id),
  constraint sharefull_manual_deletion_audits_request_job_unique unique (request_id, sharefull_job_id)
);

create index if not exists sharefull_manual_deletion_audits_request_idx
  on public.sharefull_manual_deletion_audits (request_id, confirmed_at desc);

alter table public.sharefull_manual_deletion_audits enable row level security;
revoke all on public.sharefull_manual_deletion_audits from public, anon, authenticated;
grant all on public.sharefull_manual_deletion_audits to service_role;

create or replace function public.confirm_sharefull_manual_deletion_and_requeue(
  p_request_id uuid,
  p_sharefull_job_id text,
  p_sharefull_order_id text,
  p_confirmed_by uuid,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.spot_offer_request_table;
  v_template public.spot_offer_template_unified;
  v_shift public.shift;
  v_event_id uuid := gen_random_uuid();
  v_job_id uuid;
  v_payload jsonb;
begin
  if p_sharefull_job_id is null or p_sharefull_job_id !~ '^[1-9][0-9]*$' then
    raise exception 'Sharefull求人IDが不正です';
  end if;
  if p_sharefull_order_id is not null and p_sharefull_order_id !~ '^[1-9][0-9]*$' then
    raise exception 'Sharefull管理番号が不正です';
  end if;
  if p_reason is null or char_length(trim(p_reason)) not between 1 and 500 then
    raise exception '削除確認の理由を入力してください';
  end if;

  select * into v_request
    from public.spot_offer_request_table
   where id = p_request_id
   for update;
  if not found then raise exception '対象案件が見つかりません'; end if;

  -- 二重送信時は、先に記録した同一求人IDの監査・ジョブを返す。
  select id, requeue_job_id into v_event_id, v_job_id
    from public.sharefull_manual_deletion_audits
   where request_id = p_request_id and sharefull_job_id = p_sharefull_job_id;
  if found then
    return jsonb_build_object('ok', true, 'already_recorded', true, 'audit_id', v_event_id, 'job_id', v_job_id);
  end if;
  v_event_id := gen_random_uuid();

  if v_request.status <> '募集中'
     or v_request.sharefull_job_id is not null
     or v_request.sharefull_status <> 'ready_for_offer'
     or v_request.shift_start_date::date < (now() at time zone 'Asia/Tokyo')::date
     or (v_request.shift_start_date::date + v_request.shift_start_time::time) at time zone 'Asia/Tokyo' < now() + interval '2 hours' then
    raise exception '対象案件の状態または勤務日時が再投入条件を満たしません';
  end if;

  select * into v_template
    from public.spot_offer_template_unified
   where core_id = v_request.core_id;
  if not found or v_template.sharefull_template_status <> 'ready_for_offer'
     or v_template.sharefull_template_id is null then
    raise exception '審査完了済みのSharefullテンプレートが確認できません';
  end if;

  select * into v_shift from public.shift where shift_id = v_request.shift_id for share;
  if not found then raise exception '対象シフトが見つかりません'; end if;
  if exists (
    select 1 from public.spot_offer_applications
     where request_id = p_request_id and state in ('applied', 'confirmed')
  ) then raise exception '応募・決定があるため再投入できません'; end if;

  if exists (
    select 1 from public.spot_offer_request_table
     where sharefull_job_id = p_sharefull_job_id
  ) or exists (
    select 1 from public.spot_offer_publication_history
     where provider = 'sharefull' and job_id = p_sharefull_job_id
  ) then
    raise exception 'このSharefull求人IDは別の掲載記録に紐づいています。IDの対応を先に確認してください';
  end if;

  if exists (
    select 1 from public.rpa_runner_jobs
     where job_type = 'sharefull.create_spot_offer'
       and payload->>'spot_offer_request_id' = p_request_id::text
       and status in ('pending', 'claimed')
  ) then raise exception '対象案件には実行中の掲載ジョブがあります'; end if;
  if not exists (
    select 1 from public.rpa_runner_jobs
     where job_type = 'sharefull.create_spot_offer'
       and payload->>'spot_offer_request_id' = p_request_id::text
       and status = 'failed'
  ) then raise exception '対象案件に再照合が必要な失敗ジョブがありません'; end if;

  select jsonb_build_object(
    'action', 'create_sharefull_job',
    'command', 'create_spot_offer',
    'operation_key', 'sharefull:create_spot_offer:manual-deletion:' || v_event_id::text,
    'sync_operation_key', 'sharefull:create_spot_offer:manual-deletion:' || v_event_id::text,
    'spot_offer_request_id', v_request.id,
    'shift_id', v_request.shift_id,
    'core_id', v_request.core_id,
    'taimee_job_id', v_request.taimee_job_id,
    'sharefull_template_id', v_template.sharefull_template_id,
    'shift_start_date', v_request.shift_start_date,
    'shift_start_time', v_request.shift_start_time,
    'shift_end_time', v_request.shift_end_time,
    'hourly_wage', v_request.unit_amount,
    'commute_fee', v_request.commute_fee,
    'headcount', coalesce(v_shift.required_staff_count, 1),
    'execution_mode', 'publish',
    'rpa_mode', 'production',
    'created_from', 'manual.sharefull-deletion-confirmation',
    'manual_deletion_audit_id', v_event_id,
    'confirmed_deleted_sharefull_job_id', p_sharefull_job_id
  ) into v_payload;

  insert into public.sharefull_manual_deletion_audits (
    id, request_id, sharefull_job_id, sharefull_order_id, confirmed_by, reason,
    request_snapshot
  ) values (
    v_event_id, p_request_id, p_sharefull_job_id, p_sharefull_order_id, p_confirmed_by, trim(p_reason),
    jsonb_build_object(
      'shift_id', v_request.shift_id,
      'date', v_request.shift_start_date,
      'start_time', v_request.shift_start_time,
      'end_time', v_request.shift_end_time,
      'template_title', v_request.template_title,
      'sharefull_template_id', v_template.sharefull_template_id
    )
  );

  insert into public.rpa_runner_jobs (job_type, status, payload, target_runner_id)
  values ('sharefull.create_spot_offer', 'pending', v_payload, null)
  returning id into v_job_id;

  update public.sharefull_manual_deletion_audits set requeue_job_id = v_job_id where id = v_event_id;
  return jsonb_build_object('ok', true, 'already_recorded', false, 'audit_id', v_event_id, 'job_id', v_job_id);
end;
$$;

revoke all on function public.confirm_sharefull_manual_deletion_and_requeue(uuid, text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.confirm_sharefull_manual_deletion_and_requeue(uuid, text, text, uuid, text) to service_role;
