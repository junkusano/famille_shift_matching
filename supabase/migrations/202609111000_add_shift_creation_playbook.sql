begin;

insert into public.agent_playbooks (
  name, description, category, room_scope, trigger_mode, execution_mode,
  situation, instructions, trigger_examples, allowed_actions,
  context_message_limit, context_minutes, confirmation_mode, approver_scope,
  session_ttl_minutes, is_enabled, is_locked, locked_reason, sort_order
)
select
  '利用者様のシフト追加',
  '利用者様の部屋で、必要項目を確認し、安全にシフトを追加します。',
  'shift', 'client_room', 'lineworks_mention', 'native_agent',
  'cs_kaipoke_idが特定できる利用者様の部屋で、@すまーとアイさんへのメンション付きでシフトの追加・登録を依頼されたとき',
  '対象日、開始・終了時刻、担当者、サービスコードを特定する。対象日は必ず依頼内容から確認し、日付が不明なら聞き返す。時刻・担当者・サービスコードが不足している場合は、同じ利用者様の直前のシフト（同じ曜日を優先）を参考に候補を提案し、推測した項目だと明示する。登録内容を列記して依頼者へ確認し、依頼者がOKと答えた場合だけ、重複を再確認してシフトを追加する。追加後は結果を知らせる。',
  '["9月20日のシフトを追加してください", "10月3日に前回と同じ内容でシフトを入れて"]'::jsonb,
  '["context.read_recent", "shift.list", "shift.create"]'::jsonb,
  10, 30, 'always', 'requester_only', 7,
  true, false, null, 90
where not exists (
  select 1 from public.agent_playbooks where name = '利用者様のシフト追加'
);

update public.agent_playbooks
set
  description = '利用者様の部屋で、必要項目を確認し、安全にシフトを追加します。',
  category = 'shift',
  room_scope = 'client_room',
  trigger_mode = 'lineworks_mention',
  execution_mode = 'native_agent',
  situation = 'cs_kaipoke_idが特定できる利用者様の部屋で、@すまーとアイさんへのメンション付きでシフトの追加・登録を依頼されたとき',
  instructions = '対象日、開始・終了時刻、担当者、サービスコードを特定する。対象日は必ず依頼内容から確認し、日付が不明なら聞き返す。時刻・担当者・サービスコードが不足している場合は、同じ利用者様の直前のシフト（同じ曜日を優先）を参考に候補を提案し、推測した項目だと明示する。登録内容を列記して依頼者へ確認し、依頼者がOKと答えた場合だけ、重複を再確認してシフトを追加する。追加後は結果を知らせる。',
  trigger_examples = '["9月20日のシフトを追加してください", "10月3日に前回と同じ内容でシフトを入れて"]'::jsonb,
  allowed_actions = '["context.read_recent", "shift.list", "shift.create"]'::jsonb,
  context_message_limit = 10,
  context_minutes = 30,
  confirmation_mode = 'always',
  approver_scope = 'requester_only',
  session_ttl_minutes = 7,
  is_enabled = true,
  is_locked = false,
  locked_reason = null,
  sort_order = 90
where name = '利用者様のシフト追加';

commit;
