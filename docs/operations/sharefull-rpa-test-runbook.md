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

1. テスト用マイグレーションを適用する。
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

GAS側のScript Propertiesにはテスト用URL、テストAPIトークン、Gmail検索条件、テストLINE WORKS API URL・アクセストークン・チャンネルIDだけを設定する。GmailメッセージIDは処理済みキーとして保存し、LINE WORKS送信が成功した後に処理済みとして記録する。

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
    ├─ テスト用LINE WORKSグループへ通知
    └─ 処理結果・エラーをGAS実行ログへ記録
```

### GASの責務

- Gmailの対象ラベルまたは検索条件から未処理メールを取得する。
- 送信元、件名、求人IDまたは管理番号、応募者情報を検証する。
- GmailメッセージID（必要に応じてスレッドID）を処理済みキーとして保存する。
- テスト時はテスト用LINE WORKSグループだけへ通知する。
- LINE WORKS APIの失敗時は再試行し、最終失敗を実行ログへ残す。
- メール本文全体や認証情報をログへ保存しない。

### 本番移行条件

- テスト用Gmailで応募通知を受信できること。
- テスト用LINE WORKSグループへ、同一応募を一度だけ通知できること。
- GmailメッセージIDによる重複除外が確認できること。
- API失敗時の再試行・失敗記録を確認できること。
- 本番用GASプロジェクト、LINE WORKS送信先、OAuth情報をテスト用と分離すること。

本番Gmailの受信箱や本番LINE WORKSグループを使った検証は行わない。テスト完了後に、同じ処理を本番用の送信先へ段階的に切り替える。

## テストデータの安全条件

- 表示項目には `【テスト】` が付く。
- 日付は元データの間隔を維持したまま、実行日の翌日を初日とする。
- Sharefullの求人ID・管理番号・掲載状態は初期化される。
- 本番の `spot_offer_*` テーブルはテストモードから参照しない。
- 応募通知はテスト用Gmailラベル／テスト用GAS／テスト用LINE WORKSグループを使用する。
- テスト用GASの処理済みキーはGmailメッセージIDとし、本番GASの保存領域と分離する。
- テスト通知に本番の応募者情報・本番LINE WORKS送信先を混在させない。
