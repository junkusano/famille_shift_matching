# 媒体の確定メールに連動した募集停止

シェアフルまたはタイミーの確定メールをGASが検知し、MyFamilleの掲載案件を照合して相手媒体の停止ジョブを登録する。

## フロー

### シェアフル確定メール → タイミー募集停止

1. `processSpotOfferConfirmationEmails` が5分ごとに両方の対象Gmailを検索する。
2. 送信元を完全一致で確認し、確定語句とシェアフル求人IDまたは管理番号を抽出する。管理画面URLの `/orders/<ID>` 形式も注文IDとして扱う。
3. `/api/rpa/sharefull/confirmed` は、認証・入力検証後にメールIDを `spot_offer_mail_receipts` へ受領記録し、MyFamille案件とIDを照合して応募状態を記録する。案件未特定やID不一致も受領行にエラーコードを残す。
4. 同じ案件行をロックし、最新の応募がまだ確定状態であることを確認してタイミーPAD用 `close_job` を登録する。実際の停止指示IDが得られた場合だけ成功とする。タイミーIDが空の場合は `TAIMEE_JOB_ID_MISSING` として受領を再試行状態に残す。
5. 最新の応募状態を再確認し、有効な確定について既存のSharefull用LINE WORKS通知先へ停止指示の登録を通知する。応募者名は含めない。送信失敗・他処理で送信中の場合はメール受領を再試行に残し、通知が成功してから完了ACKを返す。同じイベントの通知済み時刻により再送を抑止する。これは停止指示の登録通知であり、実際の掲載停止完了を表さない。

実行経路は媒体ごとに異なる。Sharefullの停止は`rpa_runner_jobs`の`sharefull.close_spot_offer`をChrome拡張Runnerが処理する。Timeeの停止は`rpa_command_requests`の`close_job`を既存のPAD経路が処理する。天白のChrome拡張Runnerがオンラインであるだけでは、Timee停止用PADが実行可能であることを確認できない。

Cronの`other_application`停止は、現在のSharefull確定と同じ応募キー・発生日時、同じ案件・Timee IDに対応するメール起点の`approved`/`running`/`done`指示があれば再利用する。通知失敗でメール受領が`retry`の間も対象にする。古い確定・取消済み・失敗済みの指示は、この再利用の根拠にしない。

### シェアフル応募キャンセル → 応募状態更新・スタッフ通知

1. GAS が確定メールを処理済みラベルの有無にかかわらず検索し、新しく届いたキャンセル通知を検出する。
2. `/api/rpa/sharefull/cancelled` は同様に先に受領記録し、管理番号・求人ID・応募者を照合して応募を `cancelled` として記録する。確定メールが未処理でも、応募キーと応募者を特定できれば取消状態を保存できる。後から古い確定を再送しても、取消状態を確定へ戻さない。キャンセル理由もイベント履歴に保存する。
3. 該当応募の取消後、他に有効な応募がなければ既存の同期処理が募集状態を開放する。次の候補者を自動確定しない。
4. 応募キャンセルをスタッフへ通知する。確定後のキャンセルは再調整が必要と分かる通知にし、勤務開始が24時間以内なら至急として知らせる。

再募集は別の5分Cronが判定する。有効な応募なし・担当未確定・手動停止なし・開始まで2時間以上が条件。Timeeは現在の求人IDに一致する`other_application`の停止完了指示から再作成する。後発の重複失敗は停止成功を隠さず、別求人の過去の停止は根拠にしない。同じ求人の停止が実行中なら待機し、同じ停止指示からの再作成は同期キーで再投入しない。再作成が失敗した場合は既存指示の結果を調査し、無制限に新しい指示を発行しない。

Sharefullは既存の公開求人IDが残る限り重複作成しない。MyFamilleで`closed`を記録した求人だけを`ready_for_offer`へ戻し、終了IDを履歴に保持したまま新しい募集として自動掲載へ渡す。今回のSharefull応募では応募元Sharefullへ停止指示を送らないため、キャンセル後の実画面の募集再開と、MyFamilleが終了済み求人を新規作成する場合を区別して確認する。

### タイミー確定メール → シェアフル募集停止

1. `processSpotOfferConfirmationEmails` が5分ごとに両方の対象Gmailを検索する。
2. 送信元とマッチング通知を確認し、タイミー求人ID、または業務タイトル・勤務日・開始時刻を抽出する。
3. `/api/rpa/taimee/confirmed` が案件を一意照合し、`taimee` の応募状態を `confirmed` として記録する。
4. シェアフル `sharefull.close_spot_offer` ジョブを登録する。

いずれもID・日時・タイトルの照合で複数一致や不一致があれば停止指示を作らない。GmailメッセージIDと同期キーで再送・二重登録を防ぐ。

GASはGmailを5分間隔で確認するため、メール到着から検知まで最大約5分かかる。検知後、APIが停止ジョブを登録し、既存のRPA処理が実行する。Vercelの `/api/cron/spot-offer-sync-check` も5分ごとに実行されるが、これはGmailを読む処理ではなく、案件状態の同期・照合を行う。

## GASの設定

`scripts/gas/sharefull-confirmation-taimee-close.gs` を本番GASプロジェクトへ追加する。Script Propertiesに次を設定する。

| 名前 | 値 |
| --- | --- |
| `MYFAMILLE_API_BASE_URL` | `https://myfamille.shi-on.net` |
| `SHAREFULL_CONFIRMATION_GAS_TOKEN` | Vercelの同名環境変数と同じ秘密値 |
| `SHAREFULL_CONFIRMATION_GMAIL_QUERY` | シェアフルの送信元を絞るGmail検索式。例: `from:(sharefull) newer_than:14d` |
| `SHAREFULL_CONFIRMATION_FROM_EMAIL` | 確定通知メールの送信元アドレス（完全一致で照合） |
| `TAIMEE_CONFIRMATION_GAS_TOKEN` | Vercelの同名環境変数と同じ秘密値 |
| `TAIMEE_CONFIRMATION_GMAIL_QUERY` | タイミーの個別マッチング通知に絞るGmail検索式。例: `from:supporter@timee.co.jp subject:マッチング newer_than:14d` |
| `TAIMEE_CONFIRMATION_FROM_EMAIL` | `supporter@timee.co.jp`（完全一致で照合） |

既存の `taimee-confirmation-close-sharefull.gs` はGASプロジェクトに残してよい。統合スクリプトは既存スクリプトと異なる関数名を使うため、両方を読み込んでも処理が上書きされない。

保存後、`installSpotOfferConfirmationTriggers` を一度実行し、Gmail・外部通信・トリガーの権限を承認する。この関数は旧 `processTaimeeConfirmationsForSharefullClose` の単独トリガーを削除し、両方向を処理する `processSpotOfferConfirmationEmails` の5分トリガーを1つ登録する。これ以降、旧 `installTaimeeConfirmationSharefullCloseTrigger` は実行しない。この実行時刻を `SPOT_OFFER_CONFIRMATION_ACTIVATED_AT` に保存し、その時刻以前のメールは停止APIへ送らず、処理済みとして除外する。検索式が過去メールに一致しても遡って案件停止しない。トリガーを再インストールしても最初の有効化時刻は維持される。

初回実行時に処理済みメール用のGmailラベル `MYFAMILLE_SHAREFULL_CONFIRMATION_PROCESSED` と `MYFAMILLE_TAIMEE_CONFIRMATION_PROCESSED` を自動作成する。Sharefullではラベルを検索除外条件にせず、APIの同一メールIDの受領確認を成功の根拠にする。新しいキャンセル通知を古い確定より先に処理する。キャンセルAPIはイベントIDで重複記録と通知を防ぐ。

Sharefullの受領確認にはHTTP 2xx、`ok:true`、`recorded:true`、一致する`event_id`、明示的な`outcome`が必要。`queued`のときは`close_request_id`も必須。これらを確認した後だけScript Propertiesの`SHAREFULL_CONFIRMATION_ACK_<メールID>`を保存する。旧100件の処理済みリストとGmailラベルは受領確認の代用にしない。ACKは30日保存する。再送が発生してもDBのメールID・停止指示キーで重複を防ぐ。

失敗メールは本文や認証情報を保存せず、`SHAREFULL_CONFIRMATION_PENDING_<メールID>`として保持し、検索期間を過ぎても`GmailApp.getMessageById`から次の5分実行で再試行する。一通の通信障害で他メール・他媒体を中断しない。未解決が残れば実行は`CONFIRMATION_RETRY_PENDING`で失敗を示す。`SPOT_OFFER_CONFIRMATION_LAST_RUN`と`logSpotOfferConfirmationStatus`で実行結果・未解決件数を確認できる。

勤務終了済みメールの追いつき処理は受領を`ignored` / `work_finished`として記録し、過去の応募状態・募集停止・スタッフ通知を変更しない。新しい取消は未実行の同応募のメール起点停止指示を取り消す。既に`running`や完了した停止指示の取り消しは行わず、既存の再募集同期で扱う。

## 更新と確認の順序

1. 依存する`202610151400_sharefull_application_notification_claims.sql`（通知列と応募RPC）、`202610221900_sharefull_mail_delivery.sql`、`202610231500_sharefull_notification_claim_rpc.sql`を先に確認し、未適用分を順に適用する。通知claimは最後のRPCで原子的に取得する。現行DB APIで`UPDATE + OR + SELECT`が返却列の42703エラー、またはclaim更新後に返却行なしとなったため、この更新をPostgRESTの条件付きPATCHへ戻さない。新規テーブル・RPCはservice_role限定。メール起点停止キーに重複行がある場合はユニークインデックス追加が失敗するため、履歴を消さず既存重複を調査する。一括pushの履歴不整合がある場合は無関係な履歴をrepairせず、対象スキーマ・既存関数・重複有無を照合してから対象SQLだけをトランザクションで適用し、同じ履歴行を記録する。
2. PRを共有masterへ統合し、同コミットのAPIを通常の公開経路で反映する。旧GASは新APIの`ok`を利用できる。
3. GASソースと`appsscript.json`を反映する。GmailAppのメールID再取得・ラベル操作には`https://mail.google.com/`、トリガー設定には`script.scriptapp`スコープが必要なため、必要なら所有者が再承認する。既存5分トリガーと初回有効化時刻は維持し、再インストールで有効化時刻を変更しない。
4. 新GASを先に反映すると旧APIの受領応答を成功扱いせず再試行に残す。受領記録、停止指示ID、PAD実行結果、実際の募集状態を別々に照合する。本番メールの再送で検証を重複させない。

受領・未解決状態は次の読み取りSQLで確認する（メール本文・氏名・秘密値は選択しない）。

```sql
select event_id, event_kind, received_at, last_attempt_at, status, outcome,
       error_code, request_id, close_request_id
from public.spot_offer_mail_receipts
where provider = 'sharefull'
order by received_at desc;
```

`completed`はAPI側の後続処理完了を表す。停止指示の実行完了・実画面の停止を意味しない。GAS自体が起動しない障害は受領テーブルへ記録できないため、Apps Scriptのトリガー履歴・失敗通知と最終実行時刻も確認する。

## メール形式

シェアフルは確定を示す語句（応募確定、採用決定、マッチング成立、候補者決定、案件確定のいずれか）と、`求人ID` / `求人番号` または `管理番号` / `URL管理番号` の値を使う。管理画面URLに `/orders/<ID>` があれば注文IDとして使う。両方のIDが本文にある場合、MyFamilleに保存された値も両方一致することを確認する。対象送信元の確定・キャンセル通知でID抽出に失敗した場合は処理済みにせず、次回の5分実行で再試行する。

タイミーの実メールでは通知元 `supporter@timee.co.jp`、個別確定本文の「ワーカーがN名マッチングしました」、`◆業務タイトル`、`◆日時` が確認できた。求人IDは本文中のタイミー求人URL `/offerings/{求人ID}` から抽出し、`@数字@` のタグより優先する。業務タイトルの `@数字@` は事業所IDの場合があるため、求人IDとして扱わない。求人IDがURL等にない場合は業務タイトル末尾のタグを除去し、業務タイトル・勤務日・開始時刻がすべて一致した案件だけを一意に選ぶ。マッチング状況の日次通知は個別確定通知と異なるため処理しない。

メールの実際の送信元、件名・本文書式に合わせ、GASの検索式と抽出語句を運用開始前に確認する。Gmail検索結果のスレッド内に別送信者のメールがあっても、送信元アドレスの完全一致を通過したメッセージだけを処理する。

## API環境

### 案件連携通知の追加個別受信者

既存の共通トークを維持したまま、`spot_notification_recipients`で有効な受信者へBotの個別トークで同じ通知を追加送信する。対象topicは`sharefull_application`（確定・キャンセル）、`sharefull_content_policy`（停止対象の文面チェック）、`sharefull_template_review`（審査待ち）、`sharefull_runner_failure`（Sharefullジョブの障害）に限定する。給与・勤務変更など他業務の通知先や共通トークのメンバーは変更しない。

受信者はLINE WORKSの登録情報と照合した内部userIdを運用DBへ保存し、コード・共有記録へ個人識別情報を入れない。`202610240900_spot_notification_recipients.sql`を先に適用してからAPIを公開する。送信先設定と配信履歴はservice_role限定で、ブラウザから直接変更できない。

`spot_notification_deliveries`が共通トーク・個別受信者ごとに送信完了を保持する。個別へのHTTP拒否後の再試行でも成功済みの共通トークを再送しない。通信断や送信後の保存失敗は受理結果不明として自動再送を止め、配信履歴とLINE WORKSを照合する。古いclaimも自動的に送り直さない。本番の個別受信者へテストモードの通知は送らない。過去の処理済み通知を追加受信者のために再処理しない。

本番Vercel環境に `SHAREFULL_CONFIRMATION_GAS_TOKEN` と `TAIMEE_CONFIRMATION_GAS_TOKEN` を設定する。タイミーからシェアフルを停止するAPIは `SPOT_PROVIDER_SYNC_ENABLED=true` かつ本番モードの場合だけ処理する。秘密値はリポジトリやログへ記録しない。APIはBearerトークンを検証し、MyFamille DBの `spot_offer_applications` と相手媒体のRPA指示キューを更新する。

参照: [タイミー「マッチングした際のお知らせメールについて」](https://clients-help.timee.co.jp/hc/ja/articles/19324681452697-%E3%83%9E%E3%83%83%E3%83%81%E3%83%B3%E3%82%B0%E3%81%97%E3%81%9F%E9%9A%9B%E3%81%AE%E3%81%8A%E7%9F%A5%E3%82%89%E3%81%9B%E3%83%A1%E3%83%BC%E3%83%AB%E3%81%AB%E3%81%A4%E3%81%84%E3%81%A6)、[タイミー「タイミーからのメールが届かない」](https://clients-help.timee.co.jp/hc/ja/articles/17525852371993-%E3%82%BF%E3%82%A4%E3%83%9F%E3%83%BC%E3%81%8B%E3%82%89%E3%81%AE%E3%83%A1%E3%83%BC%E3%83%AB%E3%81%8C%E5%B1%8A%E3%81%8B%E3%81%AA%E3%81%84)


## ローカル検証

DBテストは本番ではなく一時PostgreSQL（PGlite）を使用する。必要なら次の隔離フォルダにのみ依存を取得する。通常のpackage manifest・lockfileは変更しない。

```powershell
npm install --prefix .artifacts/confirmation-sql-tools --no-save --package-lock=false @electric-sql/pglite
node --test tests/sharefull-delivery-*.test.mjs tests/sharefull-mail-receipt.test.mjs tests/confirmation-email-gas.test.mjs scripts/gas/tests/sharefull-confirmation-taimee-close.test.cjs
```

PGliteを別の場所へ用意する場合は`PGLITE_MODULE_PATH`でその`dist/index.js`を指定する。
