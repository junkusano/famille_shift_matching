# Knowledge Engine 同期・Connector契約

> Status: review draft / 2026-09-05  
> Connectorは取得と正規化までを担当し、Supabaseへ直接書き込まない。

## 1. 共通フロー

```text
cron / manual request
  -> authorize
  -> claim source run
  -> load checkpoint
  -> connector.testConnection（必要時）
  -> connector.fetchDelta
  -> normalize
  -> privacy evaluation
  -> deterministic deduplication
  -> optional redaction
  -> optional AI summarization
  -> repositoryによる冪等upsert
  -> checkpointの比較更新
  -> run success
```

外部APIアクセスをDBトランザクション内で行わない。途中までupsertされて失敗した場合でもcheckpointは進めず、再実行時に同じdedupe keyで安全にupsertする。

## 2. TypeScriptインターフェース案

```ts
export type KnowledgeSourceType =
  | "conversation"
  | "rss"
  | "lesson_reminder"
  | "billing"
  | "moneyforward"
  | "github"
  | "fax"
  | "lineworks_chat"
  | "lineworks_board"
  | "myfamille"
  | "manual";

export type PrivacyLevel = 0 | 1 | 2 | 3;
export type Publishability =
  | "public"
  | "anonymize"
  | "internal_only"
  | "never_publish";

export type SourceCursor = Readonly<Record<string, unknown>>;

export type NormalizedSourceObject = {
  externalId: string;
  objectType: string;
  sourceRevision: string;
  title?: string;
  safeExcerpt?: string;
  sourceUrl?: string;
  driveUrl?: string;
  occurredAt?: string;
  periodStart?: string;
  periodEnd?: string;
  contentHash: string;
  locator: Record<string, unknown>;
  metadata: Record<string, unknown>;
  privacyLevel: PrivacyLevel;
  publishability: Publishability;
  containsPersonalData: boolean;
};

export type ProposedKnowledge = {
  knowledgeKey: string;
  knowledgeType: string;
  title: string;
  summary: string;
  content?: string;
  category?: string;
  tags: string[];
  importance: 1 | 2 | 3 | 4 | 5;
  confidence?: number;
  privacyLevel: PrivacyLevel;
  publishability: Publishability;
  authorship: "source" | "ai" | "human" | "hybrid";
  evidenceExternalIds: string[];
  metadata: Record<string, unknown>;
};

export type ConnectorContext = {
  sourceId: string;
  sourceType: KnowledgeSourceType;
  config: Readonly<Record<string, unknown>>;
  cursor: SourceCursor;
  dryRun: boolean;
  signal: AbortSignal;
};

export type ConnectorResult = {
  objects: NormalizedSourceObject[];
  proposedKnowledge: ProposedKnowledge[];
  nextCursor: SourceCursor;
  hasMore: boolean;
  warnings: string[];
};

export interface KnowledgeConnector {
  readonly key: string;
  readonly sourceType: KnowledgeSourceType;
  testConnection(ctx: ConnectorContext): Promise<{ ok: true; details: object }>;
  fetchDelta(ctx: ConnectorContext): Promise<ConnectorResult>;
}
```

`nextCursor` はconnectorが提案するだけで、connector自身は保存しない。pipelineが全処理の成功後にのみcheckpointを更新する。

## 3. Pipeline境界

```ts
export type PrivacyDecision = {
  privacyLevel: PrivacyLevel;
  publishability: Publishability;
  containsPersonalData: boolean;
  allowExternalAi: boolean;
  allowSafeExcerpt: boolean;
  requiresHumanReview: boolean;
  reasons: string[];
};

export interface KnowledgePipeline {
  run(input: {
    sourceId: string;
    jobType:
      | "incremental"
      | "manual"
      | "dry_run"
      | "initial_scan"
      | "backfill"
      | "rebuild_summary"
      | "oauth_test";
    triggeredBy?: string;
  }): Promise<KnowledgeRunResult>;
}
```

処理順は固定する。

1. normalize
2. privacy判定
3. dedupe
4. 必要なら匿名化
5. `allowExternalAi=true` のものだけAI要約
6. source object保存
7. knowledge・evidence・metric保存
8. checkpoint確定

AI connectorや個別source connectorが直接 `knowledge_items` を更新してはならない。

## 4. 冪等性

### Source object

```text
identity = source_id + external_id + source_revision
content equality = content_hash
```

同一identity、同一hashはskipped。同一external IDでrevisionが変わった場合は新しいsource objectを作り、以前の版を `is_current=false` にする。

### Knowledge item

自動生成時は次の材料から安定した `knowledge_key` を計算する。

```text
source key + knowledge type + period + normalized subject + evidence IDs
```

未確認の同一 `knowledge_key` は冪等更新できる。確認済みナレッジは自動更新しない。内容変更が必要な場合は新しいversionを作り、以前の行を `is_current=false`、新しい行を `is_current=true` とし、`supersedes_id` で接続する。

### Metric

```text
source + tenant/company + metric_key + period + department + service + calculation_version
```

を正規化して `dedupe_key` とする。

## 5. Checkpointと失敗時の扱い

開始時に `cursor_version` を読む。終了時は以下を同一DB関数内で行う。

1. 現在の `cursor_version` が開始時と同じか確認
2. cursorを `nextCursor` へ更新
3. `cursor_version + 1`
4. sourceの最終成功・次回予定を更新
5. runをsucceededに更新

一致しなければ競合としてrunをfailedにし、cursorを進めない。同期失敗時は、認証情報や原文を含まない短いエラーだけをrunへ保存する。

staleなqueued/running runは `lease_expires_at` を過ぎた後にrecovery処理がfailedへ変更する。それまではsource単位の一意制約で同時実行を防ぐ。

## 6. Dry Run

Dry Runは通常同期と同じconnector、normalize、privacy、dedupe、summary可否判定を通す。

書き込むもの：

- `knowledge_sync_runs` の実行履歴
- processed / would_create / would_update / would_skip
- warningとsanitized error
- 現在のcursorと提案cursor

書き込まないもの：

- source object
- knowledge item
- evidence
- metric
- source checkpoint
- Driveレポート

## 7. Source別cursor

### Google Sheets

```json
{
  "spreadsheetId": "...",
  "sheetGid": 0,
  "lastRow": 120,
  "lastUpdatedAt": "2026-09-05T00:00:00Z",
  "rowHashes": { "118": "sha256:...", "119": "sha256:..." }
}
```

Sheets APIには信頼できる行更新時刻がないケースがあるため、最終行だけでなく監視範囲の内容ハッシュを使う。削除・途中行更新を検出するため、直近範囲と既登録行を定期照合する。

### RSS

```json
{
  "lastPublishedAt": "2026-09-05T00:00:00Z",
  "lastItemId": "...",
  "seenIds": ["bounded-recent-id"]
}
```

### GitHub

```json
{
  "repository": "junkusano/famille_shift_matching",
  "branch": "master",
  "lastCommitSha": "...",
  "lastCheckedAt": "2026-09-05T00:00:00Z"
}
```

履歴がforce-pushされて比較不能になった場合、自動で全件再解析せず `needs_review` として停止する。

### FAX

```json
{
  "lastReceivedAt": "2026-09-05T00:00:00Z",
  "lastDocumentId": "uuid"
}
```

時刻が同じ文書を取りこぼさないよう、時刻とIDの複合順序を使う。

### LINE WORKS

```json
{
  "lastMessageAt": "2026-09-05T00:00:00Z",
  "lastMessageId": "..."
}
```

### Money Forward

```json
{
  "providerAccountId": "...",
  "reportType": "...",
  "lastSyncedPeriod": "2026-08",
  "lastFetchedAt": "2026-09-05T00:00:00Z",
  "contentHash": "sha256:..."
}
```

## 8. GitHub解析ルール

対象外の既定値：

- `.env*`、credentials、private keys
- `node_modules`、build output、coverage
- binary、画像、動画、archive
- lockfile全文
- generated database types全文

対象候補：

- `src/app/**/page.tsx`
- `src/app/api/**/route.ts`
- `src/lib/**`
- `supabase/migrations/**`
- `vercel.json`
- architecture・security・runbook文書

AIへ送る場合もrepository全体ではなく、秘匿確認済みの変更差分、path、symbol、近傍だけとする。

## 9. エラー分類

最低限、次の `error_code` を共通化する。

```text
AUTH_REQUIRED
FORBIDDEN
CONNECTION_FAILED
TOKEN_EXPIRED
TOKEN_REFRESH_FAILED
RATE_LIMITED
SOURCE_NOT_FOUND
INVALID_CONFIG
CURSOR_CONFLICT
PRIVACY_BLOCKED
NORMALIZE_FAILED
SUMMARIZE_FAILED
PERSIST_FAILED
TIMEOUT
UNKNOWN
```

ログにはtoken、Authorization header、OAuth code、FAX本文、Sheet原文、GitHub secret候補、Money Forwardレスポンス本文を出さない。

## 10. 実装予定ファイル

```text
src/lib/knowledge/
  types.ts
  registry.ts
  pipeline.ts
  privacy.ts
  deduplicate.ts
  summarize.ts
  scheduling.ts
  repositories/
    sources.ts
    sourceObjects.ts
    items.ts
    metrics.ts
    runs.ts
  connectors/
    googleSheets.ts
    rss.ts
    github.ts
    fax.ts
    moneyForward.ts

src/lib/moneyforward/
  oauth.ts
  client.ts
  tokens.ts
```
