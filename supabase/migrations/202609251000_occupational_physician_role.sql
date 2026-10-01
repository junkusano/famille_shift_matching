-- 健康診断管理を担当する産業医ロールを追加する。
insert into public.system_role_master (id, label, description, sort_order, active)
values (
  'occupational_physician',
  '産業医',
  '健康診断結果の閲覧・産業医確認を担当する権限',
  5,
  true
)
on conflict (id) do update
set label = excluded.label,
    description = excluded.description,
    sort_order = excluded.sort_order,
    active = excluded.active;
