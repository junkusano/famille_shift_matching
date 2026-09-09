-- Money Forwardは日次で最新会計年度の月次PL・BS推移だけを読み取る。
-- 仕訳明細の複製や会計データへの書き込みは行わない。

update public.knowledge_sources
set
  config = jsonb_build_object(
    'mode', 'monthly_financial_summary',
    'reports', jsonb_build_array('transition_pl', 'transition_bs'),
    'readOnly', true
  ),
  sync_frequency = 'daily',
  schedule = '{"time":"07:15"}'::jsonb,
  updated_at = now()
where source_key = 'moneyforward-accounting';
