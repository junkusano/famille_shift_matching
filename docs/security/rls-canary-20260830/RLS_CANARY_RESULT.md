# RLS CANARY結果（2026-08-30）

## 判定

CANARY PASS。対象は `public.msg_lw_status` 1テーブルのみ。RLSを維持する。

本番適用時刻: 2026-08-30 00:50:37 JST  
データ変更: なし  
他テーブル変更: なし  
credential出力: なし

## 選定

- RLS: OFF
- 行数: 4
- Policy: 0
- browser / GAS / voice54 / RPA / Runnerからの直接利用: なし
- VIEW / FUNCTION / RPC / trigger / Realtime依存: なし
- `msg_lw_log.status` から既存外部キー参照あり
- service_role/postgres権限を維持し、anon/authenticatedのみ閉鎖

`system_role_master` も直接利用なしだったが、`users.system_role` から参照されるため、業務criticalityが低い `msg_lw_status` を優先した。

## 最新production snapshot

直前:

- table 185
- view 66
- function 316
- RLS ON 68 / OFF 117
- Policy 69
- SECURITY DEFINER 35

2026-08-24 snapshotとの差分は、録音文字起こし・モニタリング関連の追加objectのみ。既存objectの削除、既存テーブルのRLS変更、Policy削除はなかった。

適用後:

- RLS ON 69 / OFF 116
- table/view/function/Policy数は不変
- table grantは14件減少

直前・適用後catalogの完全比較結果:

- RLS変更: `msg_lw_status` OFF → ONだけ
- GRANT変更: `msg_lw_status` のanon/authenticated各7権限撤去だけ
- Policy変更: 0
- VIEW変更: 0
- FUNCTION変更: 0

## SQL

- 適用: `supabase/maintenance/20260830-canary/01_apply_msg_lw_status.sql`
- rollback: `supabase/maintenance/20260830-canary/02_rollback_msg_lw_status.sql`

どちらも単一transaction、対象1テーブル、データDMLなし。

## rollback検証

本番へ永続変更しない単一transaction内で以下を実行した。

1. 直前状態確認
2. apply
3. RLS/Policy/GRANT/行数確認
4. rollback SQL相当を実行
5. 直前状態への完全復元確認
6. transaction全体をROLLBACK

結果: apply/rollbackとも成功、4行不変。問題発生時に単独rollback可能。

## 権限テスト

実際のSupabase REST + anon key:

- SELECT: HTTP 401 / SQLSTATE 42501
- INSERT: HTTP 401 / SQLSTATE 42501
- UPDATE: HTTP 401 / SQLSTATE 42501
- DELETE: HTTP 401 / SQLSTATE 42501

DB authenticatedロール（一般JWTがDBで使用する同一ロール）:

- SELECT: 42501
- INSERT: 42501
- UPDATE: 42501
- DELETE: 42501

書込みテストは必須列欠落または存在しないIDを使用し、永続データ変更なし。

service_role:

- SELECT: 成功
- 7権限すべて維持
- 行数: 4

## Myファミーユsmoke

- `/login`: HTTP 200
- `/portal`: HTTP 200
- `/portal/kaipoke-info`: HTTP 200
- `/portal/shift`: HTTP 200
- Supabase Auth health: HTTP 200
- users service-side count: 成功
- clients service-side count: 成功
- shift service-side count: 成功
- Vercel productionログ（適用後20分）: 新規403/5xx/42501/permission denied/RLSエラー 0

制約: ローカルのブラウザ操作機能がWindows sandbox補助エラーで起動せず、既存セッションを使ったログイン済み画面の視覚確認は自動化できなかった。HTTP、Auth、DB backend、production logによるsmokeは正常。

## F0影響調査

- SECURITY DEFINER: 35関数
- コード利用: 18関数 / 28呼出
- `exec_sql(text)` の実呼出: `src/lib/auto_assign_staff.ts` 1件
- 呼出元cron: `/api/cron/auto_assign_jisseki_staff`
- client: `supabaseAdmin`（service_role）
- GAS / voice54 / famille-rpa / famille-rpa-runner / 他DB関数からの `exec_sql` 呼出: なし
- browser直接利用のSECURITY DEFINER: `cm_get_alert_stats` 1件。認証済みJWT経路で、F0後もauthenticated権限を維持
- その他実利用はservice-roleのRoute Handler / Cron / utility

したがって、監査済みF0（35関数からPUBLIC/anonを撤去し、`exec_sql`のみauthenticatedも撤去、service_role維持）は実利用を止めない見込み。ただし `auto_assign_jisseki_staff` cron自体のroute-level認証不足はF0とは別の既知リスク。

## 停止

CANARYはRLS ONのまま維持する。F0およびPhase B残りは未実施。
