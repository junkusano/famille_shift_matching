# 媒体の確定メールに連動した募集停止

シェアフルまたはタイミーの確定メールをGASが検知し、MyFamilleの掲載案件を照合して相手媒体の停止ジョブを登録する。

## フロー

### シェアフル確定メール → タイミー募集停止

1. `processSpotOfferConfirmationEmails` が1分ごとに両方の対象Gmailを検索する。
2. 送信元を完全一致で確認し、確定語句とシェアフル求人IDまたは管理番号を抽出する。
3. `/api/rpa/sharefull/confirmed` がMyFamille案件とIDを照合し、`sharefull` の応募状態を `confirmed` として記録する。
4. タイミーPAD用 `close_job` を登録する。

### タイミー確定メール → シェアフル募集停止

1. `processSpotOfferConfirmationEmails` が1分ごとに両方の対象Gmailを検索する。
2. 送信元とマッチング通知を確認し、タイミー求人ID、または業務タイトル・勤務日・開始時刻を抽出する。
3. `/api/rpa/taimee/confirmed` が案件を一意照合し、`taimee` の応募状態を `confirmed` として記録する。
4. シェアフル `sharefull.close_spot_offer` ジョブを登録する。

いずれもID・日時・タイトルの照合で複数一致や不一致があれば停止指示を作らない。GmailメッセージIDと同期キーで再送・二重登録を防ぐ。

GASはGmailを最大1分間隔で確認する。実際の掲載停止はタイミーPADが停止指示を取得して実行した後となる。

## GASの設定

`scripts/gas/sharefull-confirmation-taimee-close.gs` を本番GASプロジェクトへ追加する。Script Propertiesに次を設定する。

| 名前 | 値 |
| --- | --- |
| `MYFAMILLE_API_BASE_URL` | `https://myfamille.shi-on.net` |
| `SHAREFULL_CONFIRMATION_GAS_TOKEN` | Vercelの同名環境変数と同じ秘密値 |
| `SHAREFULL_CONFIRMATION_GMAIL_QUERY` | シェアフルの送信元を絞るGmail検索式。例: `from:(sharefull) newer_than:14d` |
| `SHAREFULL_CONFIRMATION_FROM_EMAIL` | 確定通知メールの送信元アドレス（完全一致で照合） |
| `TAIMEE_CONFIRMATION_GAS_TOKEN` | Vercelの同名環境変数と同じ秘密値 |
| `TAIMEE_CONFIRMATION_GMAIL_QUERY` | タイミーのマッチング通知だけを返すGmail検索式。例: `from:supporter@timee.co.jp newer_than:14d` |
| `TAIMEE_CONFIRMATION_FROM_EMAIL` | `supporter@timee.co.jp`（完全一致で照合） |

保存後、`installSpotOfferConfirmationTriggers` を一度実行し、Gmail・外部通信・トリガーの権限を承認する。設定した検索式で対象メールが検索できることを先に手動確認する。

## メール形式

シェアフルは確定を示す語句（応募確定、採用決定、マッチング成立、候補者決定、案件確定のいずれか）と、`求人ID` / `求人番号` または `管理番号` / `URL管理番号` の値を使う。両方のIDが本文にある場合、MyFamilleに保存された値も両方一致することを確認する。

タイミー公式ヘルプによると、マッチング通知には就業日時・業務タイトル・求人状況などが含まれ、通知元として `supporter@timee.co.jp` が案内されている。GASは件名・本文に「マッチング」を含み、求人IDがあればそれを優先する。求人IDがない場合は、`業務タイトル` / `求人タイトル` / `仕事タイトル` と勤務日時を読み取り、タイトル・日付・開始時刻の完全一致で案件を一意に照合する。実メールでの項目ラベルと日時書式は初回運用前に確認する。

メールの実際の送信元、件名・本文書式に合わせ、GASの検索式と抽出語句を運用開始前に確認する。Gmail検索結果のスレッド内に別送信者のメールがあっても、送信元アドレスの完全一致を通過したメッセージだけを処理する。

## API環境

本番Vercel環境に `SHAREFULL_CONFIRMATION_GAS_TOKEN` と `TAIMEE_CONFIRMATION_GAS_TOKEN` を設定する。タイミーからシェアフルを停止するAPIは `SPOT_PROVIDER_SYNC_ENABLED=true` かつ本番モードの場合だけ処理する。秘密値はリポジトリやログへ記録しない。APIはBearerトークンを検証し、MyFamille DBの `spot_offer_applications` と相手媒体のRPA指示キューを更新する。

参照: [タイミー「マッチングした際のお知らせメールについて」](https://clients-help.timee.co.jp/hc/ja/articles/19324681452697-%E3%83%9E%E3%83%83%E3%83%81%E3%83%B3%E3%82%B0%E3%81%97%E3%81%9F%E9%9A%9B%E3%81%AE%E3%81%8A%E7%9F%A5%E3%82%89%E3%81%9B%E3%83%A1%E3%83%BC%E3%83%AB%E3%81%AB%E3%81%A4%E3%81%84%E3%81%A6)、[タイミー「タイミーからのメールが届かない」](https://clients-help.timee.co.jp/hc/ja/articles/17525852371993-%E3%82%BF%E3%82%A4%E3%83%9F%E3%83%BC%E3%81%8B%E3%82%89%E3%81%AE%E3%83%A1%E3%83%BC%E3%83%AB%E3%81%8C%E5%B1%8A%E3%81%8B%E3%81%AA%E3%81%84)
