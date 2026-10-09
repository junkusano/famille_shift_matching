# タイミー確定時のシェアフル募集停止

## 処理の流れ

1. GAS が Gmail のタイミー確定通知を1分ごとに検索する。
2. 送信元、確定語、案件ID、応募の識別キーがすべて一致したメールだけを API へ送る。
3. API が `taimee_job_id` から募集を一意に特定し、応募を `provider=taimee`、`state=confirmed` で記録する。
4. 既存の募集同期を実行し、応募済み判定に従ってシェアフルの停止ジョブを RPA キューへ入れる。
5. 停止キュー登録が失敗した場合は GAS がメールを処理済みにせず、次回再試行する。

求人IDが未登録、または複数の募集に一致した場合は安全のため停止処理を行わず、GAS 側で再試行する。

## GAS の導入

`scripts/gas/taimee-confirmation-close-sharefull.gs` を Apps Script プロジェクトへ追加し、Script Properties を設定する。

| Property | 設定内容 |
| --- | --- |
| `MYFAMILLE_API_BASE_URL` | `https://myfamille.shi-on.net` |
| `TAIMEE_CONFIRMATION_GAS_TOKEN` | Vercel の同名環境変数と同じ秘密値 |
| `TAIMEE_CONFIRMATION_GMAIL_QUERY` | 確定通知を絞る Gmail 検索条件 |
| `TAIMEE_CONFIRMATION_FROM_EMAIL` | タイミー通知の実際の送信元アドレス |
| `TAIMEE_CONFIRMATION_JOB_ID_REGEX` | 案件IDを含む正規表現。第1キャプチャがID |
| `TAIMEE_CONFIRMATION_APPLICATION_KEY_REGEX` | 応募を同定する安定した正規表現。第1キャプチャがキー |
| `TAIMEE_CONFIRMATION_CONFIRMED_REGEX` | 確定メールにだけ現れる語句の正規表現 |
| `TAIMEE_CONFIRMATION_APPLICANT_NAME_REGEX` | 任意。応募者名を抽出する正規表現。第1キャプチャが氏名 |

正規表現は実際のタイミー通知メールに合わせて設定する。案件IDと応募キーを抽出できないメールは無視する。応募キーには、メール間で変化しない応募IDを使う。応募IDがない場合は、案件内で応募者を区別できる値を使う。

Vercel には `TAIMEE_CONFIRMATION_GAS_TOKEN` を秘密環境変数として設定する。デプロイ後、GAS で `installTaimeeConfirmationSharefullCloseTrigger` を一度実行し、権限を承認する。

## 運用確認

- 対象の `taimee_job_id` が `spot_offer_request_table` の1行にだけ対応すること。
- `SPOT_PROVIDER_SYNC_ENABLED=true` であること。
- 同期後、RPA キューに `sharefull.close_spot_offer` が登録され、RPA が実際に募集を停止したこと。
- GAS の処理済みメールIDは重複抑止に使用する。API 側もイベントIDで重複記録を防ぐ。

この変更はコードと手順を追加するもので、Apps Script への配置、秘密値の設定、Vercel の環境変数追加、本番デプロイは実行していない。
