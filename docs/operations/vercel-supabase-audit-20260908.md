# Vercel / Supabase 調査結果 — 2026-09-08

## 確認範囲
対象: famille-shift-matching / Supabase rfvnmmvuessiqcswwbnf。
Vercelはjunkusanoの既存CLI認証で参照成功。チームOWNER、confirmed=true。Codex連携は403であり、ユーザーのメンバー追加は不要。
Vercel本番ログは直近24時間指定・上限100行で取得。同一idを除く50リクエスト。実際の取得範囲は約5時間半であり、24時間全件の集計ではない。
Supabaseは公式CLIのdb advisors（security/performance、warn以上）と読み取りSQLで確認。182 ERROR / 129 WARN、合計311件。これは診断項目数で、障害件数ではない。
コード・本番DBの変更、デプロイ、外部通知、自動タスク登録は行っていない。

## 優先度と修正対象

### 最優先: DBアクセス権限
RLS disabled in public 116、policy exists RLS disabled 2、security definer view 64。
特にenv_variables、fax、form_entries、msg_lw_log、shift_records、usersについてanon/authenticatedにSELECT/INSERT/UPDATE/DELETE等があることをSQLで確認した。
env_variablesはsrc/lib/getAccessToken.ts:14でLINE WORKS access_tokenの保存先として使用される。秘密値や個人データは取得していない。実際の外部到達性・漏えいの有無は未検証。
修正: テーブルごとのブラウザ/API/RPA/GAS利用を調べ、サーバー専用テーブルの権限剥奪、ユーザー用RLS、ビュー権限を段階的に整備する。一括RLS有効化は画面停止の恐れがある。
既存計画: supabase/maintenance/20260825/ と docs/security/pre-maintenance-20260825/generated/source_supabase_usage.csv を現行ソースと再照合する。
影響候補: src/lib/getAccessToken.ts、src/app/api/auth/lineworks-2fa/request/route.ts、シフト・書類・FAX画面、関連RPA/GAS。

### 高: ナレッジ同期が繰り返し時間切れ
Vercel標本で /api/cron/knowledge-sync 21リクエストが300秒タイムアウト。
Supabase直近24時間: GitHub: MyFamille は95件 failed/LEASE_EXPIRED、1件running。別GitHub情報源は1件成功、Google Sheets系も成功しており全接続障害ではない。
対象: src/app/api/cron/knowledge-sync/route.ts:9（上限300秒、最大3情報源を逐次実行）、src/lib/knowledge/pipeline.ts:304（逐次保存）、同319（全保存後に進捗確定）、src/lib/knowledge/connectors/github.ts:165（初回最大1500ファイル）。
コードからの有力な原因: 1件ずつ複数DB往復し、時間予算を保存処理に適用していないため、途中終了して進捗が確定せず繰り返す。プロファイリングによる厳密な内訳は未測定。
修正案: 小分け取得・保存、時間予算、再開カーソル、チェックポイントの一貫性、部分成功からの再開、重複起動制御。
別途コード上の問題: GitHub初回1500件超でもhasMore=falseでhead SHAを確定するため、残りの未変更ファイルが取り込まれない可能性。ページングが必要。
影響画面: /portal/admin/knowledge/sources、/portal/admin/knowledge/runs。自動診断に使うコードナレッジの鮮度にも影響。

### 高: シフト画面の食費申請取得タイムアウト
Vercel標本2リクエストで canceling statement due to statement timeout。
対象: src/app/api/shift-reject-performance-test/initial-data/route.ts:502。
wf_requestをrequest_type_id、payload kind、payload->>shift_idで絞り込み。確認した本番索引は主キーと(request_type_id,applicant_user_id,status)のみで、JSON shift_id向け索引なし。
修正案: 実行計画/RLSコストを確認し、条件に合う式・部分索引や検索用列を検討。単なる制限時間延長だけでは解消しない。
影響: /portal/shift-reject-performance-test の初期表示。

### 中: カレンダー参照失敗
Vercel標本22リクエスト /api/cron/google-calendar-sync。ログにNot Found。
対象: src/app/api/cron/google-calendar-sync/route.ts:466。
修正/設定確認: 対象カレンダーID、削除・移行、共有権限を確認。404だけでは原因を区別できない。恒久的失敗の識別と再試行間隔を整える。

### 中: LINE WORKS
グループ追加2リクエスト: Group member already exist。
対象: src/app/api/lw-group-user-add/route.ts:29、src/components/shift/GroupAddButton.tsx、対応performance-testコンポーネント。
修正案: 既存メンバーという確認済みの応答を「追加済み」と扱い、他のCONFLICTを一律成功にしない。
送信2リクエスト: Mentioned user does not exist in the channel。
対象: src/lib/lineworks/sendLWBotMessage.ts:47、src/app/api/lw-send-botmessage/route.ts、シフト画面の呼び出し元。
修正案: 実際の送信先チャンネルとメンション対象の所属を確認。既存のメンション復旧処理との統合を検討。

### 中: FAX PDF参照失敗
標本1リクエスト。Google Drive PDFが見つからずOCR/要約失敗。
対象: src/lib/alert_add/fax_unhandled_lineworks.ts:61。
まずファイルURL/存在/共有状態を確認。コードでは恒久的な参照エラーの分類・表示・再試行抑制を検討。

## その他のSupabase警告
function_search_path_mutable 90、auth_rls_initplan 21、authenticated_security_definer_function_executable 5、duplicate_index 5、extension_in_public 2、multiple_permissive_policies 2、anon_security_definer_function_executable 1。
Auth: OTP有効期限1時間超、漏えいパスワード保護の警告各1。
Postgres: 15.8.1.094に未適用のセキュリティパッチという警告1。
これらはページ修正だけでなくDB関数・索引・Auth設定・DB更新の作業。重複索引も依存確認後に判断する。

## ナレッジ活用自動タスクへの組み込み案
既存 /portal/knowledge-automation への追加を暫定想定。現状src/lib/knowledge-automation/runner.ts:89はブログ作成とリライト以外を未実装エラーにするため、画面でcustomを登録するだけでは動かない。
1. Vercel/Supabaseの診断取得処理を実装。PCのCLI認証はVercel上でそのまま使えないため、実行環境用の認証・最小権限を設定する。
2. ログをroute+error_code等で重複排除し、対象期間・取得上限・欠測を保存。取得失敗を正常と判断しない。
3. デプロイのコミットとGitHubコードナレッジ、過去の原因・修正・検証記録を照合。古いナレッジは古いと表示する。
4. 優先度、影響ページ、根拠、原因確定/推測、修正候補、検証手順を保存。秘密情報・個人情報を記録前に除去する。
5. 新規・悪化・解消を判定し、変化なしは再通知しない。通知先・頻度は実装時に決定する。
6. 初期運用は診断結果と修正案の保存まで。コード修正・本番DB変更・デプロイは別の実行段階として設計する。
追加箇所候補: src/lib/knowledge-automation/catalog.ts、types.ts、validation.ts、runner.ts、診断用モジュール、結果保存用テーブル、portal/knowledge-automation/page.tsx。
最初にDB権限とGitHubナレッジ同期を整え、手動診断を再現可能にした後に定期実行へ進める。

## 再調査手順
- Vercel: vercel whoami / vercel teams ls / vercel project inspect、logs --environment production --level error --since 24h --limit 100 --json。idで重複排除、取得上限到達時は時間区間を分割。
- Supabase: db advisors --linked --project-ref rfvnmmvuessiqcswwbnf --type all --level warn -o json。環境ファイル解析エラー時は設定ファイルを変更せず、空の診断用workdirを指定。
- db queryのSELECTで同期履歴集計、pg_indexes、role_table_grantsを確認。更新SQLや実データ取得は調査手順に含めない。
- 標本元はtmp/vercel-audit-errors.jsonl、診断結果はtmp/supabase-audit-advisors.json。生ログは個人識別情報を含み得るため共有用資料に転載しない。
