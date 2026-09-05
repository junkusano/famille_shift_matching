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
export type Publishability = "public" | "anonymize" | "internal_only" | "never_publish";
export type KnowledgeReviewStatus = "draft" | "needs_review" | "approved" | "rejected" | "superseded";
export type KnowledgeVerificationStatus = "unverified" | "partially_verified" | "verified" | "disputed";
export type KnowledgeAuthorship = "source" | "ai" | "human" | "hybrid";
export type KnowledgeSyncJobType =
  | "incremental"
  | "manual"
  | "dry_run"
  | "initial_scan"
  | "backfill"
  | "rebuild_summary"
  | "oauth_test";

export type KnowledgeItem = {
  id: string;
  knowledge_key: string;
  primary_source_id: string | null;
  knowledge_type: string;
  title: string;
  summary: string;
  content: string | null;
  source_url: string | null;
  drive_url: string | null;
  occurred_at: string | null;
  period_start: string | null;
  period_end: string | null;
  category: string | null;
  tags: string[];
  importance: number;
  confidence: number | null;
  related_departments: string[];
  related_services: string[];
  privacy_level: PrivacyLevel;
  publishability: Publishability;
  public_summary: string | null;
  contains_personal_data: boolean;
  redaction_status: string;
  review_status: KnowledgeReviewStatus;
  authorship: KnowledgeAuthorship;
  verification_status: KnowledgeVerificationStatus;
  version: number;
  is_current: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  primary_source?: { name: string; source_type: string } | null;
};

export type KnowledgeSource = {
  id: string;
  source_key: string;
  source_type: KnowledgeSourceType;
  connector_key: string;
  name: string;
  description: string | null;
  source_url: string | null;
  drive_url: string | null;
  enabled: boolean;
  sync_frequency: "manual" | "hourly" | "daily" | "weekly" | "monthly";
  schedule: Record<string, unknown>;
  timezone: string;
  next_run_at: string | null;
  default_category: string | null;
  default_privacy_level: PrivacyLevel;
  default_publishability: Publishability;
  config: Record<string, unknown>;
  last_run_at: string | null;
  last_success_at: string | null;
  last_error_at: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  created_at: string;
  updated_at: string;
  checkpoint?: { cursor: Record<string, unknown>; cursor_version: number } | null;
};

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
  sourceUrl?: string;
  occurredAt?: string;
  periodStart?: string;
  periodEnd?: string;
  category?: string;
  tags: string[];
  importance: 1 | 2 | 3 | 4 | 5;
  confidence?: number;
  privacyLevel: PrivacyLevel;
  publishability: Publishability;
  authorship: KnowledgeAuthorship;
  evidenceExternalIds: string[];
  metadata: Record<string, unknown>;
};

export type ConnectorContext = {
  source: KnowledgeSource;
  cursor: Readonly<Record<string, unknown>>;
  dryRun: boolean;
  signal: AbortSignal;
};

export type ConnectorResult = {
  objects: NormalizedSourceObject[];
  proposedKnowledge: ProposedKnowledge[];
  nextCursor: Record<string, unknown>;
  hasMore: boolean;
  warnings: string[];
};

export interface KnowledgeConnector {
  readonly key: string;
  testConnection(ctx: ConnectorContext): Promise<{ ok: true; details: Record<string, unknown> }>;
  fetchDelta(ctx: ConnectorContext): Promise<ConnectorResult>;
}

export type KnowledgeRunResult = {
  runId: string;
  sourceId: string;
  dryRun: boolean;
  processed: number;
  created: number;
  updated: number;
  skipped: number;
  summarized: number;
  cursorBefore: Record<string, unknown>;
  cursorAfter: Record<string, unknown>;
  warnings: string[];
};

