-- サービス区分別・スタッフ別の両方で、訪問介護（要支援）も訪問介護へ統合する。
-- 既存の資格証・実務経験証明書・行動援護の集計条件は変更しない。

do $$
declare
  function_definition text;
begin
  select pg_get_functiondef(p.oid)
    into function_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'dashboard_service_time_qualification_staff_rows'
    and pg_get_function_identity_arguments(p.oid) = '';

  if function_definition is null then
    raise exception 'dashboard_service_time_qualification_staff_rows() was not found';
  end if;

  function_definition := replace(
    function_definition,
    $replace$when sc.kaipoke_servicek = '要支援' then '訪問介護（要支援）'$replace$,
    $replace$when sc.kaipoke_servicek = '要支援' then '訪問介護'$replace$
  );

  execute function_definition;
end
$$;
