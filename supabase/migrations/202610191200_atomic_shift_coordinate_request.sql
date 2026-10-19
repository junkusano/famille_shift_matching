-- シフ子の担当者反映とRPA申請登録を同一トランザクションで行う。
-- 通信再送時は同じシフト・申請者の未完了申請を返し、RPA申請を重複作成しない。
create or replace function public.create_shift_coordinate_request_v1(
  p_shift_id bigint,
  p_user_id text,
  p_requester_id text,
  p_requested_kaipoke_user_id text default null,
  p_accompany boolean default true,
  p_role_code text default null,
  p_template_id text default '92932ea2-b450-4ed0-a07b-4888750da641',
  p_request_details jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  existing_request public.rpa_command_requests%rowtype;
  assignment jsonb;
begin
  if p_shift_id is null or nullif(btrim(p_user_id), '') is null or nullif(btrim(p_requester_id), '') is null then
    raise exception 'シフトまたは申請者情報が不足しています';
  end if;

  -- assign_user_to_shift_v2 側で対象shiftをロックし、同時申請を先着順に確定する。
  assignment := public.assign_user_to_shift_v2(
    p_shift_id,
    p_user_id,
    p_role_code,
    p_accompany
  );

  if coalesce(assignment ->> 'status', 'error') = 'error' then
    raise exception '%', coalesce(assignment ->> 'message', 'シフトを取得できません');
  end if;

  -- ロック解放後ではなく、割当ロックを保持したまま再送を判定する。
  select *
    into existing_request
    from public.rpa_command_requests
   where requester_id = p_requester_id
     and request_details ->> 'shift_id' = p_shift_id::text
     and request_details ->> 'requested_by' = p_user_id
     and status not in ('cancelled', 'rejected', 'failed')
   order by created_at desc nulls last
   limit 1;

  if found then
    return jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'request_id', existing_request.id,
      'assign', jsonb_build_object('status', 'noop', 'message', 'already requested')
    );
  end if;

  insert into public.rpa_command_requests (
    template_id,
    requester_id,
    approver_id,
    status,
    request_details
  ) values (
    p_template_id,
    p_requester_id,
    p_requester_id,
    'approved',
    p_request_details || jsonb_build_object(
      'shift_id', p_shift_id,
      'requested_by', p_user_id,
      'requested_kaipoke_user_id', p_requested_kaipoke_user_id,
      'attend_request', p_accompany
    )
  ) returning * into existing_request;

  return jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'request_id', existing_request.id,
    'assign', assignment
  );
end
$function$;

revoke all on function public.create_shift_coordinate_request_v1(
  bigint, text, text, text, boolean, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.create_shift_coordinate_request_v1(
  bigint, text, text, text, boolean, text, text, jsonb
) to service_role;

notify pgrst, 'reload schema';
