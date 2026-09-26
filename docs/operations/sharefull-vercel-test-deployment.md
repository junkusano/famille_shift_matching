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
SHAREFULL_TEST_GAS_TOKEN=<テスト用GASからの受信用ランダムトークン>
```

`SHAREFULL_AUTO_POST_MODE=save`により、まずはSharefull画面で保存までを確認し、募集開始は行わない。

## デプロイ

`vercel.test.json`はcronを含まない。Vercel CLIでこの設定を明示して、既存のテスト用プロジェクトへデプロイする。

```powershell
npx vercel deploy --prod --scope junkusanos-projects --yes --local-config vercel.test.json
```

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
