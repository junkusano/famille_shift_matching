-- table-view は匿名ロールでも既存の公開ビューを読める構成になっている。
-- 集計関数だけを所有者権限で実行し、RLS対象の添付情報そのものは返さず、
-- 月・区分別の集計値だけを公開ビューから返せるようにする。

alter function public.dashboard_service_time_qualification_staff_rows()
  security definer
  set search_path = public;
