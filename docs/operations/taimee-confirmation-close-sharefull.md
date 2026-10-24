# タイミー確定・取消とシェアフル募集同期

## 稼働経路

1. 統合GAS `scripts/gas/sharefull-confirmation-taimee-close.gs` の `processSpotOfferConfirmationEmails` が既存の5分トリガーで両媒体を確認する。旧単独GASの1分トリガーを追加しない。
2. タイミーの個別確定・取消メールを送信元完全一致で検索する。日次集計・チャット通知を除き、確定の「◆業務タイトル」「◆名前」、取消の「◆求人のひな形」「◆ワーカーの名前」と「◆日時」を解析する。
3. 求人URLの `https://app-new.taimee.co.jp/clients/<店舗ID>/offerings/<求人ID>` を使う。タイトルの `@数字@` は求人IDとして扱わない。URLがない場合のみ正規化したタイトル・勤務日・開始時刻が一致する一意な案件へ照合する。
4. `/api/rpa/taimee/confirmed` または `/cancelled` が受領を `spot_offer_mail_receipts` の provider=taimee / event_id=実メールIDで保存する。案件・人物を照合し、既存応募RPCで状態を投影する。メールの application_key を無条件に信用しない。
5. 確定時は行ロック下で最新応募を再確認し、`sharefull.close_spot_offer` を登録する。天白Runnerが取得し、既存Chrome拡張機能で停止する。API完了は停止指示登録までで、画面停止完了ではない。
6. 取消時は人物単位で取消を記録する。他応募がなければ未実行の当該メール停止ジョブを取り消す。実行開始済みの操作は強制中断せず、停止完了後の再調整を待つ。
7. 既存の募集同期Cronが他応募・担当者・手動停止・勤務開始まで2時間以上を確認する。終了済みSharefull求人だけを再掲載準備に戻し、既存自動掲載キュー→Runner→Chrome拡張で新規公開する。既存公開求人は重複作成しない。タイミー側の再掲載/PAD処理を新設しない。
8. 確定・取消は既存の案件連携LINE WORKS通知経路へ送り、設定済み追加個別受信者にも届く。宛先ごとの既存配信履歴で再送を抑止する。

## 取りこぼし・重複の防止

- Gmailラベルは表示用。ラベルで検索対象を除外しない。同一スレッドの後着もメールIDで確認する。
- 旧検索式が確定件名だけでも送信元の14日検索で取消を補完する。pending IDは検索期間外でも再取得する。
- 新しい取消から処理し、古い確定はDBの発生時刻判定でstaleにする。
- HTTP 2xxに加えてok・recorded・event_id・outcomeを検証する。queuedには実在するclose_job_idが必要。完了ACK保存後だけpendingを削除し、処理済みラベルを付ける。
- 名前・案件ID不足、照合不一致、DB/通知失敗は処理済みにしない。重複イベントの別内容は409。受領のerror_codeで調査する。ログにメール本文・氏名・認証値を出さない。
- 旧匿名応募や同名応募が複数ある場合は推測で取消しない。`LEGACY_APPLICANT_UNRESOLVED` / `APPLICANT_AMBIGUOUS` を管理者が確認する。複数人まとめ通知は一人分として処理せず保留する。
- 同一停止操作キーの完了・失敗後にCronが新規停止ジョブを増やさない。失敗ジョブは既存の履歴・外部状態を照合して解決する。

## 本番更新

1. migration `202610241100_taimee_mail_delivery.sql` を既存の本番DBへ適用してから、masterのAPIを通常Git連携で公開する。追加FK `close_runner_job_id` はRunner用で、既存のPAD用close_request_idを流用しない。
2. 正規本番APIの公開後に、統合GASのソースだけを更新し、保存APIから再取得してハッシュを確認する。他のGASファイル・manifest・既存Script Properties・5分トリガー・元の起動時刻を保持する。
3. 新版初回実行で `TAIMEE_MAIL_DELIVERY_ACTIVATED_AT` を元起動時刻と実行5分前の遅い方に固定する。過去メールを一括再配送しない。以後の失敗はpendingから再試行する。手動で過去へ戻すと業務を再処理するため、調査対象と外部状態の確認が必要。
4. `logSpotOfferConfirmationStatus` で両媒体のpending件数と最終実行を確認する。GAS自体が起動していない障害はAPI受領に記録されないため、トリガー実行履歴も併用する。

必須秘密設定は既存の `MYFAMILLE_API_BASE_URL`、`TAIMEE_CONFIRMATION_GAS_TOKEN`、`TAIMEE_CONFIRMATION_GMAIL_QUERY`、`TAIMEE_CONFIRMATION_FROM_EMAIL`。Vercelは `SPOT_PROVIDER_SYNC_ENABLED=true` かつ本番モードに限る。秘密値を共有記録へ記載しない。

## 検証範囲

実メールを解析する検証と、隔離DB/モックによる停止・取消・再掲載準備の検証を区別する。実公開・停止は承認された【テスト】求人を指定し、天白Runnerの接続と版、キューの重複、外部状態を照合して実施する。テストRunnerを無断で使わない。Sharefullテンプレート428828は削除・解除・置換しない。
