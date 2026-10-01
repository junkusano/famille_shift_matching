# Sharefull RPAテスト手順

## モード設定

Sharefull RPAは環境変数でモードを切り替える。通常画面からの自由なモード切替は行わない。

```env
SHAREFULL_RPA_MODE=test
SHAREFULL_AUTO_POST_ENABLED=false
SHAREFULL_AUTO_POST_MODE=save
```

テストモードでは、Sharefull専用テストテーブルだけを読み書きする。タイミー側の通常同期は停止しない。

## 実行順序

1. テスト用マイグレーションを適用する（応募イベント通知列を追加する`202610011030_sharefull_test_application_notification_outbox.sql`を含む）。
2. `seed_sharefull_rpa_test_data('12782561')`でテストデータを作成する。
3. テスト用テンプレート作成ジョブを実行する。
4. 審査完了後、案件掲載ジョブの登録だけを確認する。
5. `SHAREFULL_AUTO_POST_MODE=save`で入力・保存を確認する。
6. 問題がなければ`publish`へ変更して実掲載を確認する。
7. テスト案件への応募を発生させ、Sharefullから応募通知メールが届くことを確認する。
8. テスト用GASが対象メールを取得し、重複除外してテスト用LINE WORKSグループへ通知することを確認する。
9. 応募者・求人ID・管理番号・受信日時・GmailメッセージIDを通知内容とログで照合する。
10. 応募通知処理に失敗した場合、再実行で二重通知されず、エラーが記録されることを確認する。
11. 応募なし・`募集なし`の案件でクローズ処理を確認する。
12. 求人ID・管理番号不一致時に即時中止されることを確認する。
13. `applied`（応募）→`confirmed`（応募確定）の順に同じ応募識別キーが更新されることを確認する。
14. 複数媒体応募時に応募元と競合状態が正しく記録されることを確認する。

### テスト用GASとMyFamille API

GASは、テスト用Gmailの応募通知メールを解析し、次のテスト専用APIへ応募イベントを送信する。

```text
POST https://famille-shift-matching-test.vercel.app/api/rpa/sharefull/test-application
Authorization: Bearer ${MYFAMILLE_TEST_API_TOKEN}
Content-Type: application/json
```

送信項目は `provider=sharefull`、`event_id`、`application_key`、`state`（`applied`または`confirmed`）、`occurred_at` と、Sharefullの求人IDまたは管理番号を基本とする。応募メールと応募確定メールは同じ`application_key`で更新し、`event_id`（Gmail message ID）は受信イベントの重複防止に使う。APIはテストモードでのみ有効で、`record_sharefull_rpa_test_application()`を通じてテスト応募テーブルへ登録する。本番モードでは404を返す。

GASソースは `scripts/gas/sharefull-test-application-notify.gs` に置き、Apps Scriptプロジェクトへ反映する。Script Propertiesには次だけを設定する。

- `MYFAMILLE_TEST_API_BASE_URL`：`https://famille-shift-matching-test.vercel.app`
- `MYFAMILLE_TEST_API_TOKEN`：テストVercelの `SHAREFULL_TEST_GAS_TOKEN` と同じ値
- `SHAREFULL_TEST_GMAIL_QUERY`：`label:SharefullTest newer_than:7d` のようにテスト専用Gmailラベルを必須にした検索条件
- LINE WORKSのBot認証情報はGASに保存しない。テストAPIが既存の性別表現停止通知と同じ`getAccessToken()`、`sendLWBotMessage()`、`SHAREFULL_CONTENT_POLICY_CHANNEL_ID`設定を使う（未設定時は既定の`99142491`）。
- `SHAREFULL_TEST_ALLOWED_SENDERS`：実メールで許可する送信元アドレス（完全一致、複数はカンマ区切り）
- `SHAREFULL_TEST_JOB_ID` または `SHAREFULL_TEST_ORDER_ID`：合成メールで照合する既存のテスト案件ID／管理番号

GmailメッセージIDはテストAPIによるテストDB登録とLINE WORKS送信の両方が成功してから処理済みとして記録する。LINE WORKS送信状態はテスト応募イベント行のclaim・通知済み列で管理し、送信失敗時はclaimを解除してGASの再試行を可能にする。処理の同時起動はScript Lockで抑止する。

`sendSharefullSyntheticTestEmail` は手動実行専用で、ログイン中アカウント自身へ `[テスト] Sharefull応募通知` を1通送る。テスト案件ID／管理番号が設定されていないと送信しない。テスト先や値が確定するまで時間主導トリガーは作成しない。実メール処理の検索条件は専用Gmailラベルに制限し、本番受信箱全体検索は許可しない。

## 応募通知フロー

案件掲載後の応募通知は、Sharefull画面をRunnerで監視するのではなく、Sharefullから届くGmail通知を入口にする。

```text
Sharefullへの応募
    ↓
SharefullからGmailへ通知メール
    ↓
テスト用GAS（時間主導トリガー）
    ↓ 対象送信元・件名・求人IDを検証
    ↓ GmailメッセージIDで重複除外
    ├─ 性別表現停止通知と同じLINE WORKS送信設定へ通知（既定チャンネル: 99142491）
    └─ 処理結果・エラーをGAS実行ログへ記録
```

### GASの責務

- Gmailの対象ラベルまたは検索条件から未処理メールを取得する。
- 送信元、件名、求人IDまたは管理番号、応募者情報を検証する。
- GmailメッセージID（必要に応じてスレッドID）を処理済みキーとして保存する。
- テスト時は承認済みの性別表現停止通知と同じLINE WORKSチャンネルへ、`【テスト】`付きで通知する。
- LINE WORKS APIの失敗時は通知claimを解放し、GASの再実行で再試行する。
- メール本文全体や認証情報をログへ保存しない。

### 本番移行条件

- テスト用Gmailで応募通知を受信できること。
- 性別表現停止通知と同じLINE WORKSチャンネルへ、同一応募イベントを重複通知せず送れること。
- GmailメッセージIDによる重複除外が確認できること。
- API失敗時の再試行・失敗記録を確認できること。
- 本番用GASプロジェクト、LINE WORKS送信先、OAuth情報をテスト用と分離すること。

テスト通知先はユーザーが明示承認した性別表現停止通知と同じLINE WORKSチャンネルである。実応募者を含む本番メールを使った検証は行わず、自己宛て合成メールだけで検証する。

## テストデータの安全条件

- 表示項目には `【テスト】` が付く。
- 日付は元データの間隔を維持したまま、実行日の翌日を初日とする。
- Sharefullの求人ID・管理番号・掲載状態は初期化される。
- 本番の `spot_offer_*` テーブルはテストモードから参照しない。
- 応募通知はテスト用Gmailラベル／テスト用GAS／テスト専用DBテーブルを使い、承認済みのLINE WORKSチャンネルへテスト表示付きで送る。
- テスト用GASの処理済みキーはGmailメッセージIDとし、本番GASの保存領域と分離する。
- テスト通知に本番の応募者情報・本番LINE WORKS送信先を混在させない。
