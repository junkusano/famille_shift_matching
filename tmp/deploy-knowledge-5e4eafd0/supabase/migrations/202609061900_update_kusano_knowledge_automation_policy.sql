begin;

-- 草野思考ログを原本とし、次回の情報源同期でknowledge_itemsへ取り込む。
-- 既に作成済みのLINE WORKS→草野ナレッジ設定には、今回の運用原則を反映する。
update public.knowledge_automation_tasks
set
  description = '対象メッセージと直前の会話を確認し、事実・草野さんの考え・背景・判断理由・活用先を分けて、重複のないナレッジ候補にする。',
  condition_summary = '「#草野ナレッジ」、「今の議論を手順書・ナレッジへ追加」などの明示依頼、または今後の経営判断へ再利用できる重要な考え方が発信された場合',
  settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object(
    'include_recent_context', true,
    'context_message_limit', 20,
    'separate_fact_and_opinion', true,
    'require_meaning', true,
    'create_utilization_list', true,
    'deduplicate', true,
    'default_publishability', 'internal_only'
  ),
  updated_at = now()
where task_type = 'lineworks_knowledge';

commit;
