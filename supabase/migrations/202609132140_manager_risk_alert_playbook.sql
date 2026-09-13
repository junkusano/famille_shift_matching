begin;

insert into public.agent_playbooks (
  name, description, category, room_scope, trigger_mode, execution_mode,
  situation, instructions, trigger_examples, allowed_actions,
  context_message_limit, context_minutes, confirmation_mode, approver_scope,
  session_ttl_minutes, is_enabled, is_locked, sort_order
)
select
  '草野対応案件のマネジャーアラート',
  '草野代表の判断・指示・介入が必要と思われる案件を、草野ナレッジ・キーナレッジを基に抽出し、マネジャーグループへ通知します。',
  'operations', 'any_room', 'scheduled', 'scheduled_job',
  'LINE WORKS上で、苦情・トラブル、サービス品質、草野代表の指示の未回答・未完了、法律・コンプライアンス、コスト・効率化、行政確認が必要な問題が発生したとき。Channel ID 135380569、Group ID a03bd56b-0433-2139-ec9f-c8fee15cebeb、およびグループ名に「【特秘】」を含む部屋は対象外。',
  '対象案件を草野ナレッジ・キーナレッジの判断原則に照らして抽出する。マネジャーグループ（Channel ID 99142491）で草野淳代表をメンションし、①起きていることとグループ名、②関与者（メンションなし）、③考えられる影響、④とるべき再発防止を通知する。会話で確認できない事実、責任、法令違反を断定しない。通常連絡、雑談、お礼、解決済み案件は通知しない。草野代表の直接指示は、草野本人の投稿であり、10分以上回答・着手・完了が確認できない場合だけ通知する。',
  '["定時実行"]'::jsonb,
  '["context.read_recent", "lineworks.send_manager_risk_alert"]'::jsonb,
  50, 60, 'none', 'requester_or_manager', 10,
  true, false, 30
where not exists (
  select 1 from public.agent_playbooks where name = '草野対応案件のマネジャーアラート'
);

update public.agent_playbooks
set
  description = '草野代表の判断・指示・介入が必要と思われる案件を、草野ナレッジ・キーナレッジを基に抽出し、マネジャーグループへ通知します。',
  category = 'operations',
  room_scope = 'any_room',
  trigger_mode = 'scheduled',
  execution_mode = 'scheduled_job',
  situation = 'LINE WORKS上で、苦情・トラブル、サービス品質、草野代表の指示の未回答・未完了、法律・コンプライアンス、コスト・効率化、行政確認が必要な問題が発生したとき。Channel ID 135380569、Group ID a03bd56b-0433-2139-ec9f-c8fee15cebeb、およびグループ名に「【特秘】」を含む部屋は対象外。',
  instructions = '対象案件を草野ナレッジ・キーナレッジの判断原則に照らして抽出する。マネジャーグループ（Channel ID 99142491）で草野淳代表をメンションし、①起きていることとグループ名、②関与者（メンションなし）、③考えられる影響、④とるべき再発防止を通知する。会話で確認できない事実、責任、法令違反を断定しない。通常連絡、雑談、お礼、解決済み案件は通知しない。草野代表の直接指示は、草野本人の投稿であり、10分以上回答・着手・完了が確認できない場合だけ通知する。',
  trigger_examples = '["定時実行"]'::jsonb,
  allowed_actions = '["context.read_recent", "lineworks.send_manager_risk_alert"]'::jsonb,
  context_message_limit = 50,
  context_minutes = 60,
  confirmation_mode = 'none',
  approver_scope = 'requester_or_manager',
  session_ttl_minutes = 10,
  is_enabled = true,
  is_locked = false,
  locked_reason = null,
  sort_order = 30
where name = '草野対応案件のマネジャーアラート';

commit;
