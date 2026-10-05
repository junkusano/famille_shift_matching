# Sharefull Vercelテスト環境

本番Vercelプロジェクトとは別に、Sharefullの画面操作を確認するためのVercelプロジェクトを作る。

## 環境変数

```ini
SHAREFULL_RPA_MODE=test
SHAREFULL_TEST_DEPLOYMENT=true
SHAREFULL_AUTOMATION_CRONS_ENABLED=false
SHAREFULL_AUTO_POST_ENABLED=true
SHAREFULL_AUTO_POST_MODE=save
SHAREFULL_TEST_RUNNER_ID=sharefull-test-runner
SHAREFULL_DECISION_MONITOR_ENABLED=true
SHAREFULL_DECISION_RUNNER_ID=<稼働中の専用テストRunner ID>
SHAREFULL_TEST_GAS_TOKEN=<テスト用GASからの受信用ランダムトークン>
```

`SHAREFULL_DECISION_MONITOR_ENABLED`と`SHAREFULL_DECISION_RUNNER_ID`はテスト用VercelプロジェクトのProduction環境だけに登録する。値を本番Vercelへ追加しない。

`SHAREFULL_AUTO_POST_MODE=save`により、まずはSharefull画面で保存までを確認し、募集開始は行わない。

## デプロイ

共有の`vercel.json`には既存Cronだけを残し、応募決定監視Cronは追加しない。これにより通常の本番デプロイでは新Cronが登録されない。

テスト用デプロイでは`vercel.test.json`の設定を使い、`vercel.json`にある既存Cron全件をそのまま引き継いだうえで、応募決定監視Cronだけを足した一時設定を生成する。専用スクリプトはVercel CLIにテスト用プロジェクト名とチームを明示し、この一時設定でテスト用プロジェクトだけをデプロイする。既存Cronのパス・スケジュールは本番・テスト双方で変更しない。

### 応募決定監視Cronの適用順

1. `supabase/migrations/202610011200_sharefull_decision_status_monitor.sql`をPRでレビューする。このマイグレーションはテスト用の決定状態テーブルと専用RPCだけを追加する。RPCは`payload.environment='test'`のSharefull監視ジョブだけを完了し、共通の`complete_sharefull_decision_check`関数や本番の案件テーブルは変更しない。一方、Runner Jobの完了行は共有`public.rpa_runner_jobs`に書き込む。
2. 本番Supabaseプロジェクトではローカル・リモートのマイグレーション履歴に不整合がないことを管理者が確認する。不整合がある場合は通常の`supabase db push`を行わず、履歴の同期方法と適用対象をDB管理者がレビュー・承認する。無関係なマイグレーションを含むdry-run、対象差分が曖昧な場合は停止する。
3. 承認済みリリース経路で対象マイグレーションを適用し、テーブル/RPCの定義と権限を読み取りで確認する。確認できた後にのみ、実行環境へ`SHAREFULL_DECISION_MIGRATION_APPLIED=true`を設定する。この値がなければ専用デプロイスクリプトは停止する。
4. `SHAREFULL_DECISION_CRON_TOKEN`を設定し、PR統合後に正規リポジトリの最新`origin/master`と一致するクリーンなチェックアウトから下記スクリプトを実行する。スクリプト自身が正規origin、fetch後の`HEAD == origin/master`、未追跡を含むクリーン状態を確認する。対象はテストVercelプロジェクトだけであり、共有`vercel.json`にはCronを追加しない。
5. Deploy後、Cron一覧で既存スケジュールが保持され、新規監視Cronがテストプロジェクトに1件だけあることを確認する。テストRunnerが対象ジョブを1件処理し、テスト用決定状態テーブルとジョブ完了状態が更新されたことを確認する。個人情報やLINE WORKS通知を使った検証は行わない。

```powershell
node scripts/deploy-sharefull-test-cron.mjs
```

実行前にVercel CLIの認証状態、接続先が`famille-shift-matching-test`であること、およびDBマイグレーション適用確認を行う。`--prod`はこのテスト用プロジェクト内のProductionデプロイを指す。本番プロジェクトへこのコマンドを向けない。

テスト用プロジェクトは `famille-shift-matching-test`、URLは `https://famille-shift-matching-test.vercel.app` である。Runnerのテスト設定ではこのURLとテスト用APIベースURLを使用し、本番URLを設定しない。

## 応募通知テスト

案件掲載後の応募通知は、Sharefull画面をRunnerで監視せず、次の分離した経路で確認する。

```text
Sharefull応募
  → テスト用Gmailの対象ラベル
  → 時間主導トリガーのテスト用GAS
  → 求人ID・管理番号・応募者情報を検証
  → GmailメッセージIDで重複除外
  → テスト用LINE WORKSグループへ通知
```

テスト用GASでは、対象送信元・件名・求人IDまたは管理番号を検証し、処理済みメッセージID、成功、再試行、最終失敗を記録する。本番Gmail、本番GAS、本番LINE WORKS送信先、OAuth情報はテストと分離する。

GASからの応募イベント登録先は、テストモードでのみ有効な次のAPIである。

```text
POST /api/rpa/sharefull/test-application
Authorization: Bearer <SHAREFULL_TEST_GAS_TOKEN>
```

`request_id`、または`sharefull_job_id`／`sharefull_order_id`のいずれかでテスト案件を特定し、`provider=sharefull`、`event_id`、`application_key`、`state`、`occurred_at`を送信する。本番モードではこのAPIは404を返す。

## テスト前のジョブ確認

テスト開始前に、Supabase SQL Editorで共有Runnerが取得する未完了ジョブ全体を確認する。

```sql
select id, job_type, status, target_runner_id, payload, created_at
from public.rpa_runner_jobs
where status in ('pending', 'claimed')
order by created_at asc;
```

本番用の `pending` または `claimed` が1件でもある間は、共有Runnerで実画面テストを開始しない。専用のテストRunnerであっても、テスト用送信先がテストGmail・テストLINE WORKSグループになっていることを確認する。

テスト用ジョブを登録した後は、次でテスト用だけであることを確認する。

```sql
select id, job_type, status, payload->>'rpa_mode' as rpa_mode,
       payload->>'spot_offer_request_id' as request_id, created_at
from public.rpa_runner_jobs
where status in ('pending', 'claimed')
order by created_at asc;
```

## Runnerについて

初回は専用Runnerを作らず、既存Runnerを使ってよい。ただし次の条件を満たす場合だけとする。

- テスト中に本番の未完了ジョブが0件である。
- 本番VercelのSharefull/Taimee自動処理を同時に動かさない。
- テスト終了後に、未完了ジョブが残っていないことを確認する。
- テスト用Gmailの処理済みラベル、GAS実行ログ、LINE WORKS通知件数を照合する。
- 同じGmailメッセージを再処理してもLINE WORKSへ二重通知されないことを確認する。

これは初回の短時間テスト向けであり、本番・テスト同時稼働では専用Runnerまたはキュー分離が必要になる。

## cronガード

テストデプロイでは、次のRPA生成cronも環境変数で停止する。

- `/api/cron/spot-offer-sync-check`
- `/api/cron/open-sharefull-jobs`
- `/api/cron/open-taimee-jobs`
- `/api/cron/rpa-scheduler`

停止時はジョブ登録を行わず、`skipped: true`を返す。Vercel側でcronなしにする設定と合わせた二重防護である。

応募決定監視は、`SHAREFULL_DECISION_MONITOR_ENABLED=true`だけでは実行しない。さらに`SHAREFULL_TEST_DEPLOYMENT=true`かつ`SHAREFULL_RPA_MODE=test`を必須とし、いずれかが欠ける本番環境・その他環境ではRunner Jobを登録しない。テスト用VercelにだけCronを登録するCLI設定と、この実行時ガードを併用する。
