# Knowledge Engine 管理画面・API設計

> Status: review draft / 2026-09-05  
> v0.1の画面・APIはadmin専用。ブラウザからknowledgeテーブルへ直接アクセスしない。

## 1. 左メニュー

現在の「数値・管理」グループに、adminだけに表示される「ナレッジ管理」を追加する。画面内タブでナレッジ、情報源、同期履歴を切り替える。

```text
📊 数値・管理
  └─ ナレッジ管理（adminのみ）
```

応募者管理やFAXの配下には置かない。

## 2. 画面構成

### `/portal/admin/knowledge`

再利用可能な `knowledge_items` の一覧。

表示：

- 日時・対象期間
- タイトル
- knowledge type
- source
- category / tags
- importance / confidence
- privacy level / publishability
- review / verification status
- 根拠件数

フィルター：

- source type
- knowledge type
- category
- privacy level
- publishability
- review status
- verification status
- 日付・期間

キーワード検索は、既存middlewareがURLをログに残す可能性を考慮してPOST bodyで送る。検索語をquery stringへ出さない。

詳細ではsummary、content、AI／人作成区分、確認状態、根拠一覧、元URL、生成レポートのDrive URL、版履歴を表示する。privacy 3の原文は表示せず、既存業務画面へのリンクだけを出す。

v0.1のキーワード検索はtitle、summary、category、tagsを対象とする。日本語検索用indexは本番で利用可能な拡張を確認してから選び、初期DDLで未確認の拡張を有効化しない。ベクトル検索は後続フェーズとする。

### `/portal/admin/knowledge/review`

次をまとめて表示する。

- AI生成で未確認
- 匿名化待ち
- 根拠不足
- 公開申請
- GitHub解析の低信頼項目
- force-push等で同期判断が必要なsource

公開承認はadminだけに限定する案を推奨する。managerは内容確認、修正、内部利用承認まで可能とする。

### `/portal/admin/knowledge/sources`

表示：

- source名・type
- connection status
- enabled
- frequency / next run
- last run / last success
- last error
- cursor概要
- 直近run status

操作：

- enable / disable
- 接続テスト
- 差分同期
- Dry Run
- 初回解析
- source詳細

`initial_scan` と `backfill` は通常の「同期」と分け、対象件数・期間を確認してから実行する。

### `/portal/admin/knowledge/sources/[id]`

```text
[接続状態] [有効] [次回予定] [最終成功]

設定（Secretは表示しない）
現在のcheckpoint
Dry Run結果
直近10回の履歴
取り込み済みsource object
```

config編集ではconnectorごとのJSONを直接編集させず、型付きフォームを使用する。

### `/portal/admin/knowledge/source-objects`

原本索引の確認画面。ナレッジ一覧とは分離する。

- source
- object type
- title
- occurred at / period
- source revision
- privacy
- processing status
- source / Drive link
- 関連knowledge件数

FAXは文書ID・分類・日時だけを表示し、OCR全文・safe excerptを出さない。

### `/portal/admin/knowledge/runs`

依頼された項目をそのまま表示する。

- 実行日時
- source
- job type
- status
- processed
- created
- updated
- skipped
- summarized
- duration ms
- sanitized error
- cursor before / after

フィルター：source、status、日付、job type。詳細ではwarning、cursor差分、出力件数を表示するが、token・原文・外部レスポンス本文は表示しない。

### `/portal/admin/knowledge/metrics`

- 月／期間
- metric
- 事業所・サービス
- 値・単位
- calculation version
- 根拠source
- 前月比・前年同月比

値を直接編集せず、誤りがある場合は元データまたは計算ルールを修正して再生成する。

### `/portal/admin/knowledge/integrations`

providerごとの接続状態を表示する。

Money Forward詳細：

- 接続済み／未接続／再認証必要
- tenant名・ID
- scope
- token有効期限
- 最終接続、最終refresh、最終テスト、最終同期
- 接続、再接続、接続解除、接続テスト

token、Secret ID、Client Secretは画面・レスポンスに含めない。

## 3. API設計

すべての `/api/admin/knowledge/**` でadmin専用認証を最初に実行する。

| Method | Route | 用途 |
| --- | --- | --- |
| GET | `/api/admin/knowledge/items` | ナレッジ一覧 |
| POST | `/api/admin/knowledge/search` | キーワードをbodyで受け取る検索 |
| GET/PATCH | `/api/admin/knowledge/items/[id]` | 詳細・レビュー更新 |
| POST | `/api/admin/knowledge/items/[id]/approve` | 内部利用または公開承認 |
| GET | `/api/admin/knowledge/source-objects` | 原本索引一覧 |
| GET | `/api/admin/knowledge/sources` | source一覧 |
| GET/PATCH | `/api/admin/knowledge/sources/[id]` | source詳細・設定更新 |
| POST | `/api/admin/knowledge/sources/[id]/sync` | 手動incremental sync |
| POST | `/api/admin/knowledge/sources/[id]/dry-run` | Dry Run |
| POST | `/api/admin/knowledge/sources/[id]/initial-scan` | 明示的な初回解析 |
| GET | `/api/admin/knowledge/runs` | 実行履歴 |
| GET | `/api/admin/knowledge/runs/[id]` | 実行詳細 |
| GET | `/api/admin/knowledge/metrics` | 経営指標 |
| GET | `/api/admin/knowledge/integrations` | 接続一覧 |
| POST | `/api/admin/knowledge/integrations/moneyforward/connect` | OAuth開始 |
| GET | `/api/integrations/moneyforward/callback` | OAuth callback |
| POST | `/api/admin/knowledge/integrations/moneyforward/test` | tenant接続確認 |
| POST | `/api/admin/knowledge/integrations/moneyforward/disconnect` | 接続解除 |

Cronは別系統とする。

| Method | Route | 用途 |
| --- | --- | --- |
| GET | `/api/cron/knowledge-sync` | due sourceのdispatcher |
| POST | `/api/internal/knowledge/sources/[id]/run` | 必要時のみ内部runner。外部公開しない |

## 4. APIレスポンス制限

一覧APIでは次を返さない。

- OAuth token・Secret ID
- source config内の認証関連値
- privacy 3のcontent、excerpt、metadata原文
- FAX OCR
- LINE WORKS個別メッセージ
- Money Forward APIレスポンス本文
- GitHubコード本文

エラーは `error_code` と利用者向けメッセージだけを返す。外部APIレスポンスはサーバー側でもsanitization後の要点だけを保持する。

## 5. 権限

| 操作 | manager | admin |
| --- | --- | --- |
| ナレッジ閲覧 | 不可 | 可 |
| source・run閲覧 | 不可 | 可 |
| Dry Run・手動同期 | 不可 | 可 |
| source有効化・頻度変更 | 不可 | 可 |
| 内部利用レビュー | 不可 | 可 |
| public公開承認 | 不可 | 可 |
| OAuth接続・解除 | 不可 | 可 |
| privacy 3原本 | 不可 | 既存業務権限も必要 |

画面でボタンを隠すだけでなく、APIでも同じ判定を行う。

source設定変更、同期開始、レビュー、公開承認、OAuth接続・解除、privacy 3原本への遷移は、既存の `audit.operation_logs` に記録する。監査metadataにもtoken、原文、個人情報を入れない。

## 6. Money Forward OAuth画面遷移

```text
外部連携画面
  -> 接続ボタン
  -> admin API認証
  -> state hashをDBへ保存 + HttpOnly state cookie
  -> Money Forward認可画面
  -> callback
  -> state有効期限・未使用・initiated_byを検証
  -> server内でtoken交換
  -> tokenをVaultへ保存
  -> tenant APIで接続確認
  -> state消費済みに変更
  -> 外部連携画面へリダイレクト
```

OAuthエラー時もcode、token、provider response本文をURLへ付けない。画面には短い結果コードだけを返し、詳細はsanitized runとして確認する。

## 7. 実装時に再利用する既存部品

- 認証: `src/lib/auth/requireAdmin.ts`
- server Supabase client: `src/lib/supabase/service.ts`
- 表示部品: `src/components/ui/table`、Card、Button等
- 管理メニュー: `src/app/portal/layout.tsx`
- Cron認証: `src/lib/cron/auth.ts` を改善して利用
- 実行エラー通知: `rpa_runner_alerts` のfingerprint・抑制方式を参考にKnowledge専用通知を実装
- Drive認証: `src/lib/cm/contracts/googleDrive.ts` のサービスアカウント・共有ドライブ対応を参考にする

Knowledge Engine固有のエラーをRPAテーブルへ混在させない。

## 8. 画面受け入れ条件

- memberがURLを直接開いてもAPI・画面とも拒否される
- adminはsource、run、cursor、接続状態を確認できる
- Dry Runではknowledge・cursor・Driveが変更されない
- 手動同期を繰り返しても重複しない
- FAX・token・財務原文が一覧レスポンスに含まれない
- 公開承認前の情報はWordPress候補APIから取得できない
- run失敗時にcursorが進んでいないことを画面で確認できる
