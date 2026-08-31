# F0 SECURITY DEFINER緊急遮断 結果

## 判定

F0 PASS。2026-08-30 01:30:33 JSTにproductionへ適用した。

- 対象: SECURITY DEFINER 35関数
- ACL変更が発生した関数: 33
- PUBLIC EXECUTE: 25 → 0
- anon EXECUTE: 33 → 0
- authenticated EXECUTE: 33 → 4
- service_role EXECUTE: 35 → 35
- 関数本体、signature、owner、戻り値、search_path: 変更なし
- table、Policy、data、default privileges: 変更なし
- CANARY `public.msg_lw_status`: RLS ONを維持

## 分類

### A. server/service_role専用

31関数。PUBLIC/anon/authenticatedを拒否し、service_roleを維持。

### B. authenticated維持

- `cm_get_alert_stats()`: browser clientから認証済みユーザーが直接利用
- `wf_is_admin()`: authenticated RLS Policy依存
- `wf_is_approver()`: authenticated RLS Policy依存
- `wf_my_user_id()`: authenticated RLS Policy依存

PUBLIC/anonを拒否し、authenticated/service_roleを維持。

### C. anon維持

なし。

### D. 不明

なし。

全35関数の分類・直前/適用後roleは `classification.json` に保存。

## exec_sql

- PUBLIC: 拒否
- anon: 拒否
- authenticated: 拒否
- service_role: 維持
- Data API + anon: HTTP 401 / SQLSTATE 42501
- DB authenticated role: SQLSTATE 42501
- DB service_role + `SELECT 1`: 成功
- Data API + service_role + `SELECT 1`: 成功
- 危険なSQL・本番データ更新: なし

実呼出は `src/lib/auto_assign_staff.ts` → `auto_assign_jisseki_staff` cron → `supabaseAdmin/service_role` の1経路のみ。

## rollback

最新production snapshotから、35 signatureごとにPUBLIC/anon/authenticated/service_roleの直前状態を復元するSQLを生成した。

単一transaction内で以下を往復検証済み:

1. F0 apply
2. 適用後role行列一致
3. rollback
4. 直前role行列へ完全一致
5. transaction全体をROLLBACK

CANARY tableには触れない。

## authenticated/client確認

DBのauthenticated roleとJWT claims相当を設定した安全なtransaction内で次を実行:

- `cm_get_alert_stats()`: 成功
- `wf_is_admin()`: 成功
- `wf_is_approver()`: 成功
- `wf_my_user_id()`: 成功
- `exec_sql('SELECT 1')`: 42501

実JWTによるブラウザテストは、ローカルのブラウザ操作機能がWindows sandbox補助エラーで起動せず自動化できなかった。JWT署名secretを直接読む方法は安全基準で拒否され、使用していない。

## Myファミーユsmoke

- `/login`: HTTP 200
- `/portal`: HTTP 200
- `/portal/kaipoke-info`: HTTP 200
- `/portal/shift`: HTTP 200
- `/cm-portal/admin/alert-batch`: HTTP 200
- Auth health: 200
- users/client/shift service-side read: 成功
- F0後productionログ: 新規5xx/403/42501/permission denied for function/PostgREST function errorはすべて0

## search_path

固定済み9、未固定26。未修飾relationの機械抽出候補あり22。

未固定:

1. `cm_get_alert_stats()`
2. `cm_resolve_alert_by_reference(p_kaipoke_cs_id text, p_category text, p_reference_id text, p_resolution_note text)`
3. `cm_resolve_alerts_by_termination(p_category text, p_resolution_note text)`
4. `cron_sync_cs_documents()`
5. `exec_sql(sql_text text)`
6. `get_candidate_clients_multi(p_office_ids bigint[])`
7. `get_foreign_keys(target_schema text, target_table text)`
8. `get_primary_keys(target_schema text, target_table text)`
9. `get_schema_list()`
10. `get_schema_tables(target_schema text)`
11. `get_table_columns(target_schema text, target_table text)`
12. `roster_patch_shift_with_context(...)`
13. `set_audit_context(p_user_id text, p_action text, p_trace_id text)`
14. `shift_delete_with_context(p_shift_id bigint, p_actor_user_id text, p_request_path text)`
15. `shift_direct_reassign(...p_actor_auth_id text...)`
16. `shift_direct_reassign(...p_actor_user_id uuid...)`
17. `shift_direct_reassign_uuid(...)`
18. `shift_insert_with_context(p_row jsonb, p_actor_user_id text, p_request_path text)`
19. `shift_update_with_context(p_shift_id bigint, p_patch jsonb, p_actor_user_id text, p_request_path text)`
20. `shifts_update_with_context(p_actor_user_id text, p_patch jsonb, p_request_path text, p_shift_id bigint)`
21. `snapshot_biz_stats_shift_sum(p_year_month text)`
22. `sync_cs_docs_to_kaipoke_documents()`
23. `trg_audit_shift_min()`
24. `wf_is_admin()`
25. `wf_is_approver()`
26. `wf_my_user_id()`

`exec_sql` は動的SQL、22関数は未修飾relation候補がある。関数本体をschema-qualified化して `SET search_path = ''` にする作業は別Gateとする。

## default privileges

未変更。今後のfunctionでPUBLIC/anon/authenticated EXECUTEを自動付与しない設定は、owner/grantor別の影響確認後に独立Gateとして実施する。

## 残存リスク

- `auto_assign_jisseki_staff` を含むVercel cron 10経路のroute-level認証不足
- search_path未固定26関数
- default function privileges未変更
- 実JWTを使用したブラウザ視覚smoke未自動確認
- Phase A GAS 2プロジェクトのpush状態未検証
- famille-rpa-runnerのjob API不足

Phase B以降は未実施。
