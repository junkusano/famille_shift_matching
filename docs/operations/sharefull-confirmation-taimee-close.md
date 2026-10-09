# シェアフル案件確定メールからタイミー募集を停止

シェアフルの確定メールをGASが検知し、MyFamilleの掲載案件をID照合してタイミーPADへ `close_job` を登録する。

## フロー

1. GASの時間主導トリガーが1分ごとにGmailを検索する。
2. 件名・本文に確定語句があり、シェアフル求人IDまたは管理番号を抽出できるメールだけを処理する。
3. MyFamille APIが求人IDまたは管理番号で案件を検索する。複数一致、ID不一致、未登録の場合は停止指示を作らず、GASは次回に再試行する。
4. APIは `sharefull` の応募状態を `confirmed` として記録し、タイミーPAD用 `close_job` を登録する。
5. GmailメッセージIDと同期キーで再送・二重登録を防ぐ。

GASはGmailを最大1分間隔で確認する。実際の掲載停止はタイミーPADが停止指示を取得して実行した後となる。

## GASの設定

`scripts/gas/sharefull-confirmation-taimee-close.gs` を本番GASプロジェクトへ追加する。Script Propertiesに次を設定する。

| 名前 | 値 |
| --- | --- |
| `MYFAMILLE_API_BASE_URL` | `https://myfamille.shi-on.net` |
| `SHAREFULL_CONFIRMATION_GAS_TOKEN` | Vercelの同名環境変数と同じ秘密値 |
| `SHAREFULL_CONFIRMATION_GMAIL_QUERY` | シェアフルの送信元を絞るGmail検索式。例: `from:(sharefull) newer_than:14d` |
| `SHAREFULL_CONFIRMATION_FROM_EMAIL` | 確定通知メールの送信元アドレス（完全一致で照合） |

保存後、`installSharefullConfirmationTaimeeCloseTrigger` を一度実行し、Gmail・外部通信・トリガーの権限を承認する。設定した検索式で確認メールが検索できることを先に手動確認する。

## メール形式

現在の抽出では確定を示す語句（応募確定、採用決定、マッチング成立、候補者決定、案件確定のいずれか）と、`求人ID` / `求人番号` または `管理番号` / `URL管理番号` の値が必要。両方のIDが本文にある場合、MyFamilleに保存された値も両方一致することを確認する。

メールの実際の送信元、件名・本文書式に合わせ、GASの検索式と抽出語句を運用開始前に確認する。Gmail検索結果のスレッド内に別送信者のメールがあっても、送信元アドレスの完全一致を通過したメッセージだけを処理する。

## API環境

本番Vercel環境に `SHAREFULL_CONFIRMATION_GAS_TOKEN` を設定する。秘密値はリポジトリやログへ記録しない。APIはBearerトークンを検証し、MyFamille DBの `spot_offer_applications` とタイミーRPA指示キューを更新する。
