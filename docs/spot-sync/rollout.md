# 媒体間の募集同期（本番未反映）

## 合意した判定
- 同行を除く担当枠に manager/admin が残る間は募集を継続。担当が一人以上いて manager/admin が通常枠にいなければ担当確定。全空欄は未確定。
- どの媒体でも applied/confirmed があれば他媒体を停止し、シフ子の募集一覧から除外する。応募元には停止を送らない。
- 全応募が取り消された場合、未担当かつ開始まで2時間以上なら自動再募集。手動停止は維持。
- 同期Cronは5分。実際の反映にはRunner/PADの待ち時間が加わる。

## データ
共通の応募者表示を既存requestテーブルに残し、応募履歴は spot_offer_applications で媒体別に保持する。イベントIDで重複を排除し、発生日時で逆順通知を無視する。同時応募は application_conflict を表示し、一方を勝手に不採用にはしない。
Sharefull公開求人IDとURLの管理番号は別物。sharefull_job_id と sharefull_order_id をそれぞれ保存する。
新媒体は spot_offer_providers に追加し、通知取込と募集操作を接続する。ジモティの実際の掲載操作は今回含まない。

## 反映順序
1. 既存GASのバックアップを取り、メール処理トリガーを一時停止する。
2. 202609080900_spot_provider_sync.sql を適用する。既存Timee確定データを媒体別履歴へ移行する。
3. GAS entrybot/コード.js のRPC取込変更とMyFamille変更を反映する。既存GASの直接更新を残したまま運用しない。
4. Chrome拡張機能を再読み込みし、更新済みRunnerを起動する。
5. 既存Sharefull掲載求人のURL管理番号を確認・保存する。確認済みの将来掲載求人361139303010には管理番号が未保存。提供画像の394463513977→8059332は別求人なので流用しない。
6. テスト用求人で掲載→管理番号保存→他媒体応募→募集終了→終了状態保存→応募取消→再掲載を通す。
7. SPOT_PROVIDER_SYNC_ENABLED=true と既存SHAREFULL_AUTO_POST_ENABLED/SHAREFULL_AUTO_POST_MODEを確認して有効化する。

## 残る接続確認
- 本番DB、GAS、アプリの反映と実求人による一連の確認は未実施。
- SharefullのGmail解析は後付け。record_spot_offer_application に provider=sharefull、安定した応募キー、メールID、実際の発生日時、applied/confirmed/cancelled を渡す。
- PADが取得済みのTimee指示は、後から待機テーブルを取消してもブラウザ操作を止められない。PAD側の実行直前確認は別途接続確認が必要。
- 手動停止後の明示的な再開UIと recruitment_paused の解除は未接続。
- 失敗ジョブは自動で無制限再実行しない。実際の掲載状態を照合してから再試行する。

## ローカル検証
npm install --prefix tmp/spot-sync-tools --no-save --package-lock=false @electric-sql/pglite
node --test tests/spot-provider-sync.test.mjs
npm run typecheck

SQLテストは一時PostgreSQL内で実行し、本番データを書き換えない。応募重複、逆順、他媒体取消、同時応募、PADによる表示上書き、手動停止維持、終了求人のID不一致と完了処理の原子性を検証する。
