-- 「複数サービス」は既存 shift / shift_weekly_template と既存Viewだけで扱う。
-- 新しいグループテーブルや結合Viewは作らず、1シフト1行の粒度を維持する。

alter table public.shift_weekly_template
  add column if not exists multiple_service_group_id text;

comment on column public.shift_weekly_template.multiple_service_group_id is
  '同じ曜日・時間構成の複数サービスを将来生成する際に shift.head_shift_id へ引き継ぐ識別子。名称や集計値は保存せず各シフトから自動計算する。';

create index if not exists idx_shift_multiple_service_group
  on public.shift (head_shift_id, shift_start_date)
  where head_shift_id like 'ms:%';

create index if not exists idx_shift_weekly_template_multiple_service_group
  on public.shift_weekly_template (multiple_service_group_id)
  where multiple_service_group_id is not null;

-- 現在のView定義をそのまま内側に保持し、既存列の末尾に識別子だけを追加する。
-- shift_id は shift の主キーなので行数・粒度は変化しない。
do $migration$
declare
  target_view text;
  current_definition text;
begin
  foreach target_view in array array[
    'shift_daily_dialog_view',
    'shift_self_coordinate_card_view'
  ]
  loop
    if to_regclass('public.' || target_view) is null then
      raise exception 'required view public.% is missing', target_view;
    end if;

    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = target_view
        and column_name = 'multiple_service_group_id'
    ) then
      continue;
    end if;

    current_definition := pg_get_viewdef(format('public.%I', target_view)::regclass, true);
    execute format(
      'create or replace view public.%I as
       select current_view.*, source_shift.head_shift_id as multiple_service_group_id
       from (%s) current_view
       left join public.shift source_shift on source_shift.shift_id = current_view.shift_id',
      target_view,
      current_definition
    );
    execute format('alter view public.%I set (security_invoker = true)', target_view);
  end loop;
end
$migration$;

comment on column public.shift_daily_dialog_view.multiple_service_group_id is
  '複数サービス識別子。表示名・時間・サービス・金額は構成行から自動計算する。';
comment on column public.shift_self_coordinate_card_view.multiple_service_group_id is
  '複数サービス識別子。シフ子では同日・同識別子の行を1件として表示する。';

create or replace function public.assign_user_to_multiple_service_v1(
  p_shift_ids bigint[],
  p_user_id text,
  p_requester_id uuid,
  p_requested_kaipoke_user_id text default null,
  p_accompany boolean default false,
  p_time_adjust_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  shift_id_value bigint;
  assignment jsonb;
  assignment_results jsonb := '[]'::jsonb;
  shift_row public.shift%rowtype;
  client_name_value text;
  postal_code_3_value text;
begin
  if coalesce(array_length(p_shift_ids, 1), 0) < 2 then
    raise exception '複数サービスは2件以上のシフトが必要です';
  end if;
  if array_length(p_shift_ids, 1) > 20 then
    raise exception '一度に取得できるシフトは20件までです';
  end if;
  if p_user_id is null or btrim(p_user_id) = '' or p_requester_id is null then
    raise exception '申請者情報が不足しています';
  end if;

  foreach shift_id_value in array p_shift_ids
  loop
    select *
      into shift_row
      from public.shift
     where shift_id = shift_id_value
     for update;

    if not found then
      raise exception 'シフト % が見つかりません', shift_id_value;
    end if;

    assignment := public.assign_user_to_shift_v2(
      shift_id_value,
      p_user_id,
      null,
      p_accompany
    );

    if coalesce(assignment->>'status', 'error') = 'error' then
      raise exception 'シフト % を取得できません: %',
        shift_id_value,
        coalesce(assignment->>'message', '割当処理に失敗しました');
    end if;

    select
      info.name,
      left(coalesce(info.postal_code, ''), 3)
      into client_name_value, postal_code_3_value
      from public.cs_kaipoke_info info
     where info.kaipoke_cs_id = shift_row.kaipoke_cs_id
     limit 1;

    insert into public.rpa_command_requests (
      template_id,
      requester_id,
      approver_id,
      status,
      request_details
    ) values (
      '92932ea2-b450-4ed0-a07b-4888750da641',
      p_requester_id,
      p_requester_id,
      'approved',
      jsonb_build_object(
        'shift_id', shift_row.shift_id,
        'kaipoke_cs_id', shift_row.kaipoke_cs_id,
        'shift_start_date', shift_row.shift_start_date,
        'shift_start_time', shift_row.shift_start_time,
        'service_code', shift_row.service_code,
        'postal_code_3', coalesce(postal_code_3_value, ''),
        'client_name', coalesce(client_name_value, ''),
        'requested_by', p_user_id,
        'requested_kaipoke_user_id', p_requested_kaipoke_user_id,
        'attend_request', p_accompany,
        'time_adjust_note', p_time_adjust_note,
        'multiple_service_group_id', shift_row.head_shift_id
      )
    );

    assignment_results := assignment_results || jsonb_build_array(
      jsonb_build_object('shift_id', shift_id_value, 'assign', assignment)
    );
  end loop;

  return jsonb_build_object(
    'ok', true,
    'count', array_length(p_shift_ids, 1),
    'results', assignment_results
  );
end
$function$;

revoke all on function public.assign_user_to_multiple_service_v1(
  bigint[], text, uuid, text, boolean, text
) from public, anon, authenticated;
grant execute on function public.assign_user_to_multiple_service_v1(
  bigint[], text, uuid, text, boolean, text
) to service_role;

notify pgrst, 'reload schema';
