-- Read-only preflight. No DDL/DML.
SELECT count(*) FILTER (WHERE relrowsecurity) AS rls_on, count(*) FILTER (WHERE NOT relrowsecurity) AS rls_off FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r';
SELECT count(*) AS policies FROM pg_policies WHERE schemaname='public';
SELECT count(*) FILTER (WHERE prosecdef) AS security_definer, count(*) AS functions FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public';
SELECT count(*) FILTER (WHERE COALESCE((c.reloptions @> ARRAY['security_invoker=true']), false)) AS security_invoker, count(*) AS views FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='v';
