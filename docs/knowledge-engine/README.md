# ファミーユ Knowledge Engine v0.1 設計レビュー

> Status: review draft / 2026-09-05  
> レビュー後、実装用migrationを作成済み。Supabase本番への適用は別工程。

## 1. 目的

Knowledge Engineは、外部・社内情報の全文を集める倉庫ではない。原本の所在、そこから確認できる事実、再利用可能な知識、公開可否を分離し、次の用途から共通利用できる状態を作る。

- 社内検索と根拠確認
- 経営指標と月次経営サマリー
- AIによる社内回答
- WordPress記事候補
- システム構成・設計判断・変更履歴の参照

v0.1では構造化検索、分類、時系列、根拠追跡、公開安全性を優先し、ベクトル検索は導入しない。

## 2. 重要な設計判断

### 原本、原本索引、事実、ナレッジを分ける

```text
原本システム
  Google Sheets / Drive / GitHub / FAX / Money Forward / LINE WORKS / MyFamille
        |
        v
knowledge_source_objects  原本の場所・版・ハッシュ・機密区分
        | evidence
        +--------------------+
        v                    v
knowledge_metric_snapshots  knowledge_items
確定した数値                再利用可能な知識・判断・教訓・傾向
        |                    |
        +----------+---------+
                   v
       社内検索 / 経営分析 / AI回答 / 公開候補
```

`knowledge_items`には、取得した全レコードを入れない。FAX一件、仕訳一件、LINE WORKS一メッセージ、GitHub一ファイルは原則として `knowledge_source_objects` で管理する。そこから再利用価値のある知識が得られた場合だけ `knowledge_items` を作成する。

### 原本を複製しない

| Source | 原本 | Supabaseに保持するもの |
| --- | --- | --- |
| Google Sheets | Sheet | sheet ID、gid、行、版、ハッシュ、要約 |
| GitHub | GitHub | repository、SHA、path、URL、設計索引・変更要約 |
| FAX | `cs_docs`・FAXテーブル・Drive | 文書ID、分類、日時、原本リンク。OCR全文は保存しない |
| LINE WORKS | LINE WORKS・既存ログ | チャンネル・期間・メッセージ範囲、日次テーマ要約 |
| Money Forward | Money Forward | tenant、帳票種別、期間、確定指標、根拠情報 |
| MyFamille | 既存業務テーブル | 集計条件、期間、確定指標、対象画面へのリンク |

### AI生成物と確認済み事実を区別する

`knowledge_items.authorship` と `verification_status` で区別する。AI生成直後は `review_status = 'needs_review'` とし、公開候補にも確定的な社内回答にも使用しない。

同じ主題のナレッジには安定した `knowledge_key` を付ける。確認前は冪等更新できるが、確認済み内容は上書きせず、新しいversionを作って `supersedes_id` でつなぐ。

### 数値計算をAIに任せない

請求管理表、Money Forward、MyFamilleの実績は、決定的な変換処理で `knowledge_metric_snapshots` に保存する。前月比・前年同月比もコードで計算し、AIは確定値から説明文を作るだけにする。

## 3. テーブル責務

| Table | 責務 |
| --- | --- |
| `knowledge_integrations` | OAuth接続状態とSecret参照。トークン平文は持たない |
| `integration_oauth_states` | 短命・一回限りのOAuth state検証 |
| `knowledge_sources` | 情報源の設定、頻度、既定の機密区分 |
| `knowledge_source_checkpoints` | sourceごとの同期位置。人が編集する設定から分離 |
| `knowledge_source_objects` | 原本オブジェクトとその版の索引 |
| `knowledge_items` | 再利用可能なナレッジ |
| `knowledge_evidence_links` | ナレッジ・数値と原本索引の根拠関係 |
| `knowledge_relations` | ナレッジ同士の関連・因果・反証・更新関係 |
| `knowledge_metric_snapshots` | 月次等の確定指標 |
| `knowledge_code_artifacts` | GitHubファイル・PR・commitの技術索引 |
| `knowledge_sync_runs` | Cron、手動、Dry Run、初回解析の履歴 |

具体的なカラムと制約は [schema-draft.sql](./schema-draft.sql) を参照する。

## 4. Source別の取り込み単位

| Source | Source object | Knowledge item | 初期privacy / publishability | Cursor |
| --- | --- | --- | --- | --- |
| 草野思考ログ | Sheet一行の版 | opinion / decision / principle | 1 / internal_only | row、updated_at、hash |
| RSS | 記事 | 複数記事から得たtrend、記事候補 | 0〜1 / review_required相当 | published_at、item ID |
| 教訓リマインド | Sheet一行の版 | 匿名化したlesson | 2〜3 / internal_only | row、updated_at、hash |
| 請求管理表 | 月・事業・指標範囲 | financial_summary | 2 / internal_only | period、range hash |
| GitHub | file revision / PR / commit | architecture / decision / constraint | 2 / internal_only | branch head SHA、checked_at |
| FAX | FAX文書 | 複数事例から一般化したlessonのみ | 3 / never_publish | received_at、document ID |
| LINE WORKS | channel・日・message範囲 | daily_summary / decision | 2〜3 / internal_only | message ID、message_at |
| Money Forward | tenant・帳票・期間 | monthly financial summary | 2 / internal_only | period、fetched_at、hash |
| MyFamille | 集計定義・期間 | fact / trend / monthly_summary | 1〜2 / internal_only | updated_at、record ID |

RSSシート内の「監視対象」と「記事」はconnectorで判定し、前者はsource候補、後者はsource objectとして扱う。元Sheetはv0.1では変更しない。

## 5. 公開安全性

既定の二軸を維持する。

- `privacy_level`: 0 公開 / 1 社内一般 / 2 社内機密 / 3 個人情報を含む
- `publishability`: public / anonymize / internal_only / never_publish

ただし公開判定は二軸だけで行わない。外部利用には、次の全条件を必要とする。

```text
privacy_level = 0
publishability = public
review_status = approved
contains_personal_data = false
approved_by is not null
approved_at is not null
```

`anonymize` は公開許可ではなく、匿名化と人による確認が必要な状態を表す。privacy 3の原文は、v0.1では外部AIへ送らない。FAXのsource objectは常に privacy 3 / never_publish とする。

## 6. GitHub方針

GitHub Appを対象リポジトリだけにインストールし、Contents、Metadata、Pull requestsの読み取り権限だけを与える。秘密情報、バイナリ、生成物、依存物は解析対象外とする。

通常同期では保存済みbranch head以降のcommitだけを比較する。初回解析は管理画面から明示的に実行し、Cronで全件再解析しない。

GitHubの解析結果は次の二段階に分ける。

1. ファイル・PR・commit索引を `knowledge_code_artifacts` に保存する。
2. 重要な仕様変更や設計判断だけを `knowledge_items` に昇格し、根拠PR・commit・fileを `knowledge_evidence_links` で結ぶ。

自動抽出した関連テーブル、API route、責務には信頼度を付ける。人による修正値を次回解析で上書きしない。

## 7. FAX方針

FAXをナレッジ対象には含めるが、汎用ナレッジテーブルにOCR全文を複製しない。

- `knowledge_source_objects`: `cs_docs.id`、文書種別、受信日時、Drive URL、対象ページ等
- `knowledge_items`: 匿名化でき、複数事例に再利用できる教訓・傾向のみ
- privacy 3の詳細表示: MyFamilleの既存FAX画面へ遷移し、既存業務権限を再確認
- public summary: 作成禁止

## 8. Money Forward方針

v0.1はOAuth接続、tenant確認、scope確認、token refresh、Dry Runまでとする。PL、BS、月次推移は実装時点の公式OpenAPI定義で利用可能なendpointとscopeを確認してから有効化する。

OAuth tokenはブラウザ、レスポンス、通常ログ、`knowledge_integrations` の平文カラムに出さない。第一候補はSupabase Vaultで、テーブルにはSecret IDのみ保存する。Vaultの安全な更新・取得RPCを実装前に検証する。

Money Forward単独で経営解釈を完結させず、請求管理表とMyFamilleのサービス実績を `knowledge_metric_snapshots` で結合した後に月次サマリーを作る。

## 9. Drive方針

既存の原本を新しいフォルダーへ移動・複製しない。Knowledge Engine用Driveには、人が読む生成レポートと公開承認済み資料だけを置く。

```text
ファミーユAIナレッジ
├─ 00_管理・公開ルール
├─ 10_日次・週次レポート
├─ 20_月次経営レポート
├─ 30_業務改善・教訓
├─ 40_システム設計資料
├─ 50_公開承認済み資料
└─ 90_アーカイブ
```

作成前に既存共有ドライブ内の配置先、所有者、サービスアカウント権限を確認する。

## 10. v0.1の実装境界

### 含む

- DB schema、RLS、admin専用API
- 管理画面、レビュー待ち、source、run一覧
- 差分同期、Dry Run、冪等性、失敗履歴
- 草野思考ログ、RSS、教訓リマインド
- GitHub App接続とMyFamilleの差分解析
- FAXのmetadata索引
- Money Forward OAuthとtenant接続確認
- 請求管理表の月次指標化

### 含めない

- FAX OCR全文の複製・外部AI送信
- LINE WORKS全メッセージ保存
- GitHubコード全文保存
- Money Forwardの書き込みAPI
- 自動WordPress公開
- 大規模ベクトル検索
- AI判断だけによる公開承認

## 11. 実装ゲート

次の順序で承認を分ける。

1. 本レビュー資料の承認
2. 本番スキーマ・RLSの直前再確認
3. migration作成とローカル検証
4. 管理画面とDry Run
5. sourceごとに接続・少量テスト
6. 手動incremental sync
7. Cron有効化
8. Money Forward帳票取得範囲の追加承認
9. 公開候補機能の追加承認

## 12. 関連レビュー資料

- [レビュー用DDL](./schema-draft.sql)
- [同期・connector契約](./sync-contracts.md)
- [管理画面・API設計](./ui-spec.md)
