// =============================================================
// src/lib/cm/audit/getDashboardSummary.ts
// 監査ダッシュボード専用 Server Action
//
// cmGetTimeline はイベント全件をクライアントに返すため、
// 30日間で数千件になるとレスポンスが大きすぎて通信エラーになる。
//
// この関数はサーバー側で集計を完了し、集計結果のみを返す。
//
// パフォーマンス:
//   - 3テーブル並行取得（軽量カラム）
//   - data_change_logs は trace_id のみ取得（カウント集計用）
//   - ダミー配列を生成せず、trace_id カウントマップから直接集計
//   - 全集計を1パス（events を1回ループ）で完了
//   - 各ステップの所要時間を logger.info で出力
// =============================================================

"use server";

import { supabaseAdmin } from "@/lib/supabase/service";
import { requireCmSession, CmAuthError } from "@/lib/cm/auth/requireCmSession";
import { createLogger } from "@/lib/common/logger";
import {
  CM_AUDIT_CATEGORY_LABELS,
  CM_AUDIT_CATEGORY_COLORS,
  CM_AUDIT_DEFAULT_CATEGORY_COLOR,
  CM_AUDIT_HIGH_SEVERITY_ACTIONS,
  CM_AUDIT_MEDIUM_SEVERITY_ACTIONS,
} from "@/constants/cm/auditDashboard";
import type {
  CmPageView,
  CmOperationLog,
} from "@/types/cm/operationLog";
import type {
  CmAuditSeverity,
  CmAuditDashboardSummary,
  CmAuditUserStat,
  CmAuditImportantOp,
  CmAuditHeatmapCell,
  CmAuditDailyTrendItem,
  CmAuditCategoryItem,
  CmAuditHourlyItem,
} from "@/types/cm/auditDashboard";

const logger = createLogger("lib/cm/audit/getDashboardSummary");

// =============================================================
// 型定義
// =============================================================

type GetDashboardSummaryParams = {
  startDate: string;
  days: number;
};

type GetDashboardSummaryResult = {
  ok: boolean;
  summary: CmAuditDashboardSummary;
  error?: string;
};

/** セッション区切りの閾値（ミリ秒） — 30分 */
const SESSION_GAP_MS = 30 * 60 * 1000;

/** エラー時に返す空の集計結果 */
const EMPTY_SUMMARY: CmAuditDashboardSummary = {
  activeUsers: 0,
  operationCount: 0,
  pageViewCount: 0,
  dbChangeCount: 0,
  sessionCount: 0,
  dailyTrend: [],
  categoryData: [],
  userStats: [],
  importantOps: [],
  heatmapData: [],
  hourlyTimeline: [],
};

/** ダッシュボード用の取得上限 */
const CM_DASHBOARD_PV_LIMIT = 5000;
const CM_DASHBOARD_OP_LIMIT = 5000;
const CM_DASHBOARD_DC_LIMIT = 10000;

/** 軽量 select カラム */
const PV_COLUMNS = "id,timestamp,user_id,path,ip_address";
const OP_COLUMNS =
  "id,timestamp,user_id,user_email,user_name,action,category,description,resource_type,resource_id,trace_id,ip_address";
const DC_COLUMNS = "context_trace_id";

// =============================================================
// メイン関数
// =============================================================

export async function cmGetDashboardSummary(
  params: GetDashboardSummaryParams,
  token: string
): Promise<GetDashboardSummaryResult> {
  const t0 = performance.now();

  try {
    await requireCmSession(token);
  } catch (e) {
    if (e instanceof CmAuthError) {
      return { ok: false, summary: EMPTY_SUMMARY, error: e.message };
    }
    throw e;
  }

  const tAuth = performance.now();

  try {
    // ----------------------------------------------------------
    // 1. 3テーブル並行取得（軽量カラム）
    // ----------------------------------------------------------
    const [pvResult, opResult, dcResult] = await Promise.all([
      fetchPageViewsLight(params.startDate),
      fetchOperationLogsLight(params.startDate),
      fetchDcTraceIds(params.startDate),
    ]);

    const tQuery = performance.now();

    if (pvResult.error || opResult.error || dcResult.error) {
      const errorMsg = pvResult.error ?? opResult.error ?? dcResult.error ?? "";
      logger.error("ダッシュボードデータ取得エラー", undefined, { error: errorMsg });
      return { ok: false, summary: EMPTY_SUMMARY, error: "データ取得に失敗しました" };
    }

    // ----------------------------------------------------------
    // 2. trace_id → DB変更件数マップ
    // ----------------------------------------------------------
    const dcCountByTraceId = new Map<string, number>();
    let totalDbChanges = 0;
    for (const row of dcResult.data) {
      const traceId = row.context_trace_id;
      if (!traceId) continue;
      dcCountByTraceId.set(traceId, (dcCountByTraceId.get(traceId) ?? 0) + 1);
      totalDbChanges++;
    }

    // ----------------------------------------------------------
    // 3. 軽量イベント配列を構築（db_changes は持たず dcCount で件数だけ保持）
    // ----------------------------------------------------------
    const events: LightEvent[] = [];

    for (const pv of pvResult.data) {
      const d = new Date(pv.timestamp);
      events.push({
        timestamp: pv.timestamp,
        tsMs: d.getTime(),
        userId: pv.user_id,
        userEmail: null,
        userName: null,
        eventType: "page_view",
        action: pv.path,
        category: null,
        description: `${pv.path} を閲覧`,
        resourceType: null,
        traceId: null,
        ipAddress: pv.ip_address,
        dcCount: 0,
        hour: d.getHours(),
        dayIndex: d.getDay() === 0 ? 6 : d.getDay() - 1,
        dateKey: `${d.getMonth() + 1}/${d.getDate()}`,
      });
    }

    for (const op of opResult.data) {
      const d = new Date(op.timestamp);
      const dcCount = op.trace_id ? (dcCountByTraceId.get(op.trace_id) ?? 0) : 0;
      events.push({
        timestamp: op.timestamp,
        tsMs: d.getTime(),
        userId: op.user_id,
        userEmail: op.user_email,
        userName: op.user_name,
        eventType: "operation",
        action: op.action,
        category: op.category,
        description: op.description,
        resourceType: op.resource_type,
        traceId: op.trace_id,
        ipAddress: op.ip_address,
        dcCount,
        hour: d.getHours(),
        dayIndex: d.getDay() === 0 ? 6 : d.getDay() - 1,
        dateKey: `${d.getMonth() + 1}/${d.getDate()}`,
      });
    }

    const tTransform = performance.now();

    // ----------------------------------------------------------
    // 4. ユーザー名解決
    // ----------------------------------------------------------
    await resolveUserNamesLight(events);

    const tUserNames = performance.now();

    // ----------------------------------------------------------
    // 5. セッション構築（ユーザー別 + 件数のみ、イベント詳細は不要）
    // ----------------------------------------------------------
    events.sort((a, b) => b.tsMs - a.tsMs);
    const sessions = buildLightSessions(events);

    const tSessions = performance.now();

    // ----------------------------------------------------------
    // 6. 1パス集計 — events を1回だけループして全集計データを同時構築
    // ----------------------------------------------------------
    const summary = aggregateInSinglePass(events, sessions, totalDbChanges, params.days);

    const tEnd = performance.now();

    // ----------------------------------------------------------
    // パフォーマンス計測ログ
    // ----------------------------------------------------------
    logger.info("[Dashboard perf]", {
      days: params.days,
      pvCount: pvResult.data.length,
      opCount: opResult.data.length,
      dcCount: dcResult.data.length,
      eventCount: events.length,
      sessionCount: sessions.length,
      ms_auth: Math.round(tAuth - t0),
      ms_query: Math.round(tQuery - tAuth),
      ms_transform: Math.round(tTransform - tQuery),
      ms_userNames: Math.round(tUserNames - tTransform),
      ms_sessions: Math.round(tSessions - tUserNames),
      ms_aggregate: Math.round(tEnd - tSessions),
      ms_total: Math.round(tEnd - t0),
    });

    return { ok: true, summary };
  } catch (error) {
    logger.error("予期せぬエラー", error as Error);
    return { ok: false, summary: EMPTY_SUMMARY, error: "サーバーエラーが発生しました" };
  }
}

// =============================================================
// 1パス集計
// =============================================================

type LightEvent = {
  timestamp: string;
  tsMs: number;
  userId: string;
  userEmail: string | null;
  userName: string | null;
  eventType: "page_view" | "operation";
  action: string;
  category: string | null;
  description: string | null;
  resourceType: string | null;
  traceId: string | null;
  ipAddress: string | null;
  dcCount: number;
  hour: number;
  dayIndex: number;
  dateKey: string;
};

/**
 * events を1回だけループして全集計データを同時構築する
 *
 * 旧方式: 7つの集計関数が各々 events をループ → 7回走査 + Date パース多重実行
 * 新方式: 1回のループで日別推移・カテゴリ・ヒートマップ・時間帯・注目操作を同時集計
 */
function aggregateInSinglePass(
  events: LightEvent[],
  sessions: LightSession[],
  totalDbChanges: number,
  days: number
): CmAuditDashboardSummary {
  // --- 日別推移バケット初期化 ---
  const dailyBuckets = new Map<string, { pageViews: number; operations: number; dataChanges: number }>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dailyBuckets.set(`${d.getMonth() + 1}/${d.getDate()}`, { pageViews: 0, operations: 0, dataChanges: 0 });
  }

  // --- 集計用変数 ---
  let operationCount = 0;
  let pageViewCount = 0;
  const categoryCounts = new Map<string, number>();
  const hourlyBuckets = Array.from({ length: 24 }, () => ({ operations: 0, pageViews: 0 }));
  const heatmapGrid = new Map<string, number>();
  for (let d = 0; d < 7; d++) {
    for (let h = 6; h <= 21; h++) {
      heatmapGrid.set(`${d}-${h}`, 0);
    }
  }
  const importantCandidates: CmAuditImportantOp[] = [];

  // --- 1パスループ ---
  for (const ev of events) {
    const isOp = ev.eventType === "operation";

    if (isOp) {
      operationCount++;

      // カテゴリ集計
      if (ev.category) {
        categoryCounts.set(ev.category, (categoryCounts.get(ev.category) ?? 0) + 1);
      }

      // 注目操作候補（severity が high/medium のみ収集、最大20件で打ち止め）
      if (importantCandidates.length < 20) {
        const severity = getSeverity(ev.action);
        if (severity !== "low") {
          const displayName = ev.userName ?? ev.userEmail?.split("@")[0] ?? ev.userId.slice(0, 8);
          importantCandidates.push({
            time: formatTime(ev.timestamp),
            user: displayName,
            action: ev.action,
            target: ev.description ?? ev.resourceType ?? "",
            severity,
          });
        }
      }
    } else {
      pageViewCount++;
    }

    // 日別推移
    const dailyBucket = dailyBuckets.get(ev.dateKey);
    if (dailyBucket) {
      if (isOp) {
        dailyBucket.operations++;
        dailyBucket.dataChanges += ev.dcCount;
      } else {
        dailyBucket.pageViews++;
      }
    }

    // 時間帯別
    if (isOp) {
      hourlyBuckets[ev.hour].operations++;
    } else {
      hourlyBuckets[ev.hour].pageViews++;
    }

    // ヒートマップ
    if (ev.hour >= 6 && ev.hour <= 21) {
      const key = `${ev.dayIndex}-${ev.hour}`;
      heatmapGrid.set(key, (heatmapGrid.get(key) ?? 0) + 1);
    }
  }

  // --- 後処理 ---

  // 日別推移
  const dailyTrend: CmAuditDailyTrendItem[] = Array.from(dailyBuckets.entries()).map(
    ([date, vals]) => ({ date, ...vals })
  );

  // カテゴリ内訳（上位6件）
  const categoryData: CmAuditCategoryItem[] = Array.from(categoryCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([cat, count]) => ({
      name: CM_AUDIT_CATEGORY_LABELS[cat] ?? cat,
      value: count,
      color: CM_AUDIT_CATEGORY_COLORS[cat] ?? CM_AUDIT_DEFAULT_CATEGORY_COLOR,
    }));

  // 時間帯別
  const hourlyTimeline: CmAuditHourlyItem[] = hourlyBuckets.map((b, i) => ({
    hour: `${String(i).padStart(2, "0")}:00`,
    operations: b.operations,
    pageViews: b.pageViews,
  }));

  // ヒートマップ
  const dayLabels = ["月", "火", "水", "木", "金", "土", "日"];
  const heatmapData: CmAuditHeatmapCell[] = [];
  for (let d = 0; d < 7; d++) {
    for (let h = 6; h <= 21; h++) {
      heatmapData.push({
        day: dayLabels[d],
        dayIndex: d,
        hour: h,
        count: heatmapGrid.get(`${d}-${h}`) ?? 0,
      });
    }
  }

  // 注目操作（severity 順ソート、上位8件）
  const severityOrder: Record<CmAuditSeverity, number> = { high: 0, medium: 1, low: 2 };
  const importantOps = importantCandidates
    .sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])
    .slice(0, 8);

  // ユーザー別アクティビティ（sessions から構築）
  const userStats = buildUserStatsFromSessions(sessions);

  return {
    activeUsers: new Set(sessions.map((s) => s.userId)).size,
    operationCount,
    pageViewCount,
    dbChangeCount: totalDbChanges,
    sessionCount: sessions.length,
    dailyTrend,
    categoryData,
    userStats,
    importantOps,
    heatmapData,
    hourlyTimeline,
  };
}

// =============================================================
// 軽量セッション
// =============================================================

type LightSession = {
  userId: string;
  userName: string | null;
  userEmail: string | null;
  firstTimestamp: string;
  lastTimestamp: string;
  operations: number;
  pageViews: number;
  changes: number;
};

function buildLightSessions(events: LightEvent[]): LightSession[] {
  if (events.length === 0) return [];

  const byUser = new Map<string, LightEvent[]>();
  for (const ev of events) {
    const list = byUser.get(ev.userId) ?? [];
    list.push(ev);
    byUser.set(ev.userId, list);
  }

  const sessions: LightSession[] = [];

  for (const [userId, userEvents] of byUser) {
    // 昇順（セッション区切り用）
    userEvents.sort((a, b) => a.tsMs - b.tsMs);

    const namedEvent = userEvents.find((e) => e.userName || e.userEmail);

    let sessionOps = 0;
    let sessionPvs = 0;
    let sessionChanges = 0;
    let sessionStart = userEvents[0];

    const flushSession = (startEv: LightEvent, endEv: LightEvent) => {
      sessions.push({
        userId,
        userName: namedEvent?.userName ?? null,
        userEmail: namedEvent?.userEmail ?? null,
        firstTimestamp: startEv.timestamp,
        lastTimestamp: endEv.timestamp,
        operations: sessionOps,
        pageViews: sessionPvs,
        changes: sessionChanges,
      });
    };

    for (let i = 0; i < userEvents.length; i++) {
      const ev = userEvents[i];

      if (i > 0 && ev.tsMs - userEvents[i - 1].tsMs > SESSION_GAP_MS) {
        flushSession(sessionStart, userEvents[i - 1]);
        sessionStart = ev;
        sessionOps = 0;
        sessionPvs = 0;
        sessionChanges = 0;
      }

      if (ev.eventType === "operation") {
        sessionOps++;
        sessionChanges += ev.dcCount;
      } else {
        sessionPvs++;
      }
    }

    // 最後のセッション
    flushSession(sessionStart, userEvents[userEvents.length - 1]);
  }

  sessions.sort((a, b) =>
    new Date(b.lastTimestamp).getTime() - new Date(a.lastTimestamp).getTime()
  );

  return sessions;
}

function buildUserStatsFromSessions(sessions: LightSession[]): CmAuditUserStat[] {
  const userMap = new Map<string, CmAuditUserStat>();

  for (const s of sessions) {
    const displayName = s.userName ?? s.userEmail?.split("@")[0] ?? s.userId.slice(0, 8);
    const existing = userMap.get(s.userId) ?? {
      name: displayName,
      userId: s.userId,
      operations: 0,
      pageViews: 0,
      lastAccess: "",
      changes: 0,
    };

    existing.operations += s.operations;
    existing.pageViews += s.pageViews;
    existing.changes += s.changes;
    if (!existing.lastAccess || s.lastTimestamp > existing.lastAccess) {
      existing.lastAccess = s.lastTimestamp;
    }

    userMap.set(s.userId, existing);
  }

  return Array.from(userMap.values()).sort((a, b) => b.operations - a.operations);
}

// =============================================================
// ユーティリティ
// =============================================================

function getSeverity(action: string): CmAuditSeverity {
  const lower = action.toLowerCase();
  if (CM_AUDIT_HIGH_SEVERITY_ACTIONS.some((k) => lower.includes(k))) return "high";
  if (CM_AUDIT_MEDIUM_SEVERITY_ACTIONS.some((k) => lower.includes(k))) return "medium";
  return "low";
}

function formatTime(timestamp: string): string {
  const d = new Date(timestamp);
  return d.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}

// =============================================================
// 内部ヘルパー: 軽量クエリ
// =============================================================

type LightResult<T> = { data: T[]; error: string | null };

async function fetchPageViewsLight(
  startDate: string
): Promise<LightResult<CmPageView>> {
  const { data, error } = await supabaseAdmin
    .schema("audit")
    .from("page_views")
    .select(PV_COLUMNS)
    .gte("timestamp", startDate)
    .order("timestamp", { ascending: false })
    .limit(CM_DASHBOARD_PV_LIMIT);

  return { data: (data as CmPageView[]) ?? [], error: error?.message ?? null };
}

async function fetchOperationLogsLight(
  startDate: string
): Promise<LightResult<CmOperationLog>> {
  const { data, error } = await supabaseAdmin
    .schema("audit")
    .from("operation_logs")
    .select(OP_COLUMNS)
    .gte("timestamp", startDate)
    .order("timestamp", { ascending: false })
    .limit(CM_DASHBOARD_OP_LIMIT);

  return { data: (data as CmOperationLog[]) ?? [], error: error?.message ?? null };
}

async function fetchDcTraceIds(
  startDate: string
): Promise<LightResult<{ context_trace_id: string | null }>> {
  const { data, error } = await supabaseAdmin
    .schema("audit")
    .from("data_change_logs")
    .select(DC_COLUMNS)
    .gte("timestamp", startDate)
    .order("timestamp", { ascending: false })
    .limit(CM_DASHBOARD_DC_LIMIT);

  return { data: (data ?? []) as { context_trace_id: string | null }[], error: error?.message ?? null };
}

// =============================================================
// 内部ヘルパー: ユーザー名解決（軽量イベント用）
// =============================================================

async function resolveUserNamesLight(events: LightEvent[]): Promise<void> {
  const userMap = new Map<string, { name: string | null; email: string | null }>();
  for (const ev of events) {
    if (ev.eventType === "operation" && (ev.userName || ev.userEmail)) {
      if (!userMap.has(ev.userId)) {
        userMap.set(ev.userId, { name: ev.userName, email: ev.userEmail });
      }
    }
  }

  const missingUserIds = new Set<string>();
  for (const ev of events) {
    if (!ev.userName && !ev.userEmail && !userMap.has(ev.userId)) {
      missingUserIds.add(ev.userId);
    }
  }

  if (missingUserIds.size > 0) {
    const lookupPromises = [...missingUserIds].map(async (uid) => {
      try {
        const { data } = await supabaseAdmin.auth.admin.getUserById(uid);
        if (data?.user) {
          const meta = data.user.user_metadata ?? {};
          const name = meta.full_name ?? meta.name ?? null;
          const email = data.user.email ?? null;
          userMap.set(uid, { name, email });
        }
      } catch {
        logger.warn("auth.users からのユーザー情報取得に失敗", { user_id: uid });
      }
    });
    await Promise.all(lookupPromises);
  }

  for (const ev of events) {
    if (!ev.userName && !ev.userEmail) {
      const resolved = userMap.get(ev.userId);
      if (resolved) {
        ev.userName = resolved.name;
        ev.userEmail = resolved.email;
      }
    }
  }
}