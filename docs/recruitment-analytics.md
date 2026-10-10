# 応募導線分析

ナレッジ活用自動化の `recruitment-analytics` テンプレートで登録する。初期設定は月曜09:00 JST、保存のみ。`/portal/recruitment-analytics` は応募者管理のエントリー一覧の下に配置する。

## 集計と保存

- 前週月曜〜日曜と前々週を比較する。DB件数はJSTの半開区間で集計する。
- 有効なGA4情報源から、ホスト付きページ別表示・利用者、エントリーページの参照元、公開ページの端末別指標を取得する。同じプロパティIDは一度だけ取得する。
- MyFamilleは公開LPと `/entry` に限定。氏名、連絡先、応募本文、個別の応募レコードは取得せず、`form_entries` の新規登録件数のみ読む。再応募の送信件数やLP別帰属ではない。
- GA4対象行なし、API失敗、上位行制限、しきい値・サンプリング・タイムゾーン差を明記する。DB応募件数÷GA4ページ表示を応募率としない。
- Clarityは既存の保存済み集計を参照。重なる3日スナップショットを合算しない。日次07:35 JSTの `/api/cron/knowledge-analytics-sync` がGA4/Clarityを独立取得し、遅い一般情報源による取りこぼしを防ぐ。
- 関連するアクセス・採用ナレッジを照合する。報告と改善案は `knowledge_items` の `recruitment_analytics_report` に一体で保存する。週開始日をキーにし、再実行・競合でも重複作成しない。
- レポートは内部限定、AI作成・要確認。改善案は仮説であり確定方針ではない。ナレッジ管理で確認・編集でき、次週の分析で参照する。
- レポートAPIはmanager/adminのみ。集計の欠損は失敗や警告として表示し、欠損を0にしない。

## 外部処理

分析生成は既存OpenAI APIを使用する。送信するものは集計値・公開ページURL・個人情報なしの関連ナレッジ要約。OpenAIレスポンスの保存は無効 (`store:false`)。今回の導入では送信許可の確認待ちのため、本番タスクの作成・有効化と初回AI実行は未実施。

公開ページの変更やLINE WORKSへの通知は、このタスクでは行わない。

## 検証

`node --test tests/recruitment-analytics.test.mjs tests/external-information.test.mjs tests/knowledge-system-diagnostics.test.mjs`

週境界・欠測・URL秘匿・件数のみの取得・GA4設定重複・保存競合・誤配信防止・API権限・cron認証と独立実行を確認する。既存の型エラーは修正前後を比較する。
