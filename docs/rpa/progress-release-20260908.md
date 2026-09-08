# 2026-09-08 RPA修正・ログ配布

## 修正
- 拡張0.3.22: API認証はCookieを先に確認。401時は既存編集タブを保持し、別のMyFamilleタブでセッション更新後に再取得。ログイン自体が失効していれば再ログインを案内。
- Sharefullコピー3/4の求人名称に spot_offer_template_unified.template_title をそのまま入力。4/4の管理用テンプレート名は従来どおり。
- 案件一覧は掲載照合が失敗しても表示。
- Runner0.1.1: 実際のJob IDと試行番号を拡張へ渡す。受信、試行、再試行、完了、失敗を逐次保存。
- 拡張: 一覧開始/完了、対象日、人数、対象位置、電話番号取得開始、SMS処理、対象なし・送信済み除外を記録。
- API: 同じ実行IDの受信と処理時間・HTTP結果を保存。

## ログ
rpa_progress_events。通常ログの値は許可項目だけ。氏名、電話、SMS本文、認証情報、任意のエラー本文は除外。
拡張は chrome.storage.local の rpaProgressOutbox、Runnerは LOCALAPPDATA/FamilleRpaRunner/<runner_id>/progress-outbox.json に保存。成功応答まで保持し、再起動・再接続後に再送。イベントUUIDで重複を排除。保存期間30日。
管理画面: /portal/admin/rpa-progress。Job ID／実行ID、試行、端末名、各プログラムの版、処理位置を5秒ごとに表示。
手動の案件一覧取得には独立した実行IDを発行。手動Timeeの一覧取得とSMS送信にも同じ実行IDを引き継ぐ。Runnerとの同時実行は防止する。
API側はDB障害時に通常処理を妨げず警告を出す。端末側のログは通信復旧後に再送されるが、DB障害中のAPI開始ログ自体は再生成しない。

## 検証
拡張16テスト、Runner21テスト、ログSQL権限/期限1テスト。アプリ型検証。実求人の作成・SMS送信・募集終了は行っていない。

## 本番反映済み（2026-09-08）
ユーザーの本番反映承認を受け、ログ専用マイグレーション202609081200を適用し、Vercel本番へ切り替え済み。
- Deployment: dpl_9eB9Jp1wysvZsKpm5gpS9gRrB78A
- URL: https://famille-shift-matching-o267nai1n-junkusanos-projects.vercel.app
- 本番: https://myfamille.shi-on.net
- 配布用コピー: node_modules/.cache/rpa-logs-release-20260908
- ベース: 本番コミット396e762b。募集同期の未反映変更は含めていない。
- 本番APIの検証Job: 5856d779-c610-48cd-9604-fced27f61e8c（test.sleepのみ）
- ログ2件を確認。同一イベント再送の重複防止、秘密項目除去、他ジョブ書込み403、未ログイン閲覧401を確認。確認用Runnerは無効化済み。
- 拡張0.3.22はdist更新済み。Chromeの拡張機能を再読み込みして適用する。
- Runner0.1.1はdist更新済み。ただし既存rpagpt1は無効設定・停止中だったため、その設定を維持している。
- 募集同期マイグレーション202609080900は実行していない。
