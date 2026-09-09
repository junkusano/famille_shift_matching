begin;

-- 「依頼事項未対応のアラート」は精度を見直すまで停止する。
-- 管理画面から追加されたルールと、従来の定時処理の双方を停止対象にする。
update public.agent_playbooks
set is_enabled = false
where name in (
  '依頼事項未対応のアラート',
  '定時の未対応リマインド'
);

commit;
