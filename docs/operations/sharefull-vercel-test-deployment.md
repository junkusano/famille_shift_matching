# Sharefull Vercelテスト環境

本番Vercelプロジェクトとは別に、Sharefullの画面操作を確認するためのVercelプロジェクトを作る。

## 環境変数

```ini
SHAREFULL_RPA_MODE=test
SHAREFULL_TEST_DEPLOYMENT=true
SHAREFULL_AUTOMATION_CRONS_ENABLED=false
SHAREFULL_AUTO_POST_ENABLED=true
SHAREFULL_AUTO_POST_MODE=save
```

`SHAREFULL_AUTO_POST_MODE=save`により、まずはSharefull画面で保存までを確認し、募集開始は行わない。

## デプロイ

`vercel.test.json`はcronを含まない。Vercel CLIでこの設定を明示してテスト用プロジェクトへデプロイする。

```powershell
npx vercel deploy --local-config vercel.test.json --name famille-shift-matching-test
```

実際のプロジェクト名とURLは、Vercelダッシュボードで確認してからRunnerの対象URLとして使う。

## テスト前のジョブ確認

テスト開始前に、Supabase SQL Editorで共有Runnerが取得する未完了ジョブ全体を確認する。

```sql
select id, job_type, status, target_runner_id, payload, created_at
from public.rpa_runner_jobs
where status in ('pending', 'claimed')
order by created_at asc;
```

1件でも本番ジョブがある間は、共有Runnerでテストを開始しない。

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

これは初回の短時間テスト向けであり、本番・テスト同時稼働では専用Runnerまたはキュー分離が必要になる。

## cronガード

テストデプロイでは、次のRPA生成cronも環境変数で停止する。

- `/api/cron/spot-offer-sync-check`
- `/api/cron/open-sharefull-jobs`
- `/api/cron/open-taimee-jobs`
- `/api/cron/rpa-scheduler`

停止時はジョブ登録を行わず、`skipped: true`を返す。Vercel側でcronなしにする設定と合わせた二重防護である。
