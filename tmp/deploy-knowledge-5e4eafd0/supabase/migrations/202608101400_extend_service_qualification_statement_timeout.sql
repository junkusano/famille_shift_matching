-- 匿名ロールの既定 statement_timeout（約3秒）より集計時間が長いため、
-- この集計専用関数の実行中だけ上限を15秒にする。
-- SECURITY DEFINER と固定 search_path は前migrationで設定済み。

alter function public.dashboard_service_time_qualification_staff_rows()
  set statement_timeout = '15s';
