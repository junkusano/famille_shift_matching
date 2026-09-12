begin;

update public.agent_playbooks
set
  allowed_actions = '["context.read_recent", "lineworks.send_unhandled_reminder"]'::jsonb,
  confirmation_mode = 'none',
  session_ttl_minutes = 10,
  is_enabled = true
where name = '依頼事項未対応のアラート';

commit;
