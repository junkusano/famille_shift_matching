// =============================================================
// src/lib/cm/audit/getDashboardSummary.ts
// 監査ダッシュボード専用 Server Action
//
// cmGetTimeline はイベント全件をクライアントに返すため、
// 30日間で数千件になるとレスポンスが大きすぎて通信エラーになる。
//
// この関数はサーバー側で集計を完了し、集計結果のみを返す。
// クライアントに送るデータは数KB程度に収まる。
//
// 経緯:
//   旧: cmGetTimeline（全イベント返却） → クライアント側で useMemo 集計
//   新: getDashboardSummary（サーバー集計） → 集計結果のみ返却
//   操作ログ一覧・経路フローは従来通り cmGetTimeline を使用（detail表示に全件必要）
// =============================================================

"use server";

import { supabaseAdmin } from "@/lib/supabase/service";
import { requireCmSession, CmAuthError } from "@/lib/cm/auth/requireCmSession";
import { createLogger } from "@/lib/common/logger";
import {
  cmAuditBuildDailyTrend,
  cmAuditBuildCategoryData,
  cmAuditBuildUserStats,
  cmAuditBuildImportantOps,
  cmAuditBuildHeatmap,
  cmAuditBuildHourlyTimeline,
} from "@/lib/cm/audit/dashboardAggregation";
import type {
  CmPageView,
  CmOperationLog,
  CmDataChangeLog,
  CmTimelineEvent,
  CmAuditSession,
} from "@/types/cm/operationLog";
import type { CmAuditDashboardSummary } from "@/types/cm/auditDashboard";

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

/** ダッシュボード用の取得上限（日付フィルターあり前提） */
const CM_DASHBOARD_PV_LIMIT = 5000;
const CM_DASHBOARD_OP_LIMIT = 5000;
const CM_DASHBOARD_DC_LIMIT = 10000;

/** 軽量 select カラム（ダッシュボードで必要な最小限） */
const PV_COLUMNS = "id,timestamp,user_id,path,ip_address";
const OP_COLUMNS =
  "id,timestamp,user_id,user_email,user_name,action,category,description,resource_type,resource_id,trace_id,ip_address";
const DC_COLUMNS = "id,timestamp,context_trace_id,context_user_id";

// =============================================================
// メイン関数
// =============================================================

/**
 * ダッシュボード用の集計データを取得する
 *
 * サーバー側で以下を実行し、集計結果のみをクライアントに返す:
 *   1. page_views / operation_logs / data_change_logs を軽量カラムで取得
 *   2. イベントに変換・セッション構築
 *   3. 各集計関数（dailyTrend, category, userStats 等）を実行
 *   4. 集計結果を CmAuditDashboardSummary として返却
 */
export async function cmGetDashboardSummary(
  params: GetDashboardSummaryParams,
  token: string
): Promise<GetDashboardSummaryResult> {
  try {
    await requireCmSession(token);
  } catch (e) {
    if (e instanceof CmAuthError) {
      return { ok: false, summary: EMPTY_SUMMARY, error: e.message };
    }
    throw e;
  }

  try {
    // ----------------------------------------------------------
    // 1. 3テーブル並行取得（軽量カラム）
    // ----------------------------------------------------------
    const [pvResult, opResult, dcResult] = await Promise.all([
      fetchPageViewsLight(params.startDate),
      fetchOperationLogsLight(params.startDate),
      fetchDataChangeLogsLight(params.startDate),
    ]);

    if (pvResult.error || opResult.error || dcResult.error) {
      const errorMsg = pvResult.error ?? opResult.error ?? dcResult.error ?? "";
      logger.error("ダッシュボードデータ取得エラー", undefined, { error: errorMsg });
      return { ok: false, summary: EMPTY_SUMMARY, error: "データ取得に失敗しました" };
    }

    // ----------------------------------------------------------
    // 2. trace_id で data_change_logs をマップ化（件数カウント用）
    // ----------------------------------------------------------
    const dcCountByTraceId = new Map<string, number>();
    for (const dc of dcResult.data) {
      if (!dc.context_trace_id) continue;
      dcCountByTraceId.set(
        dc.context_trace_id,
        (dcCountByTraceId.get(dc.context_trace_id) ?? 0) + 1
      );
    }

    // ----------------------------------------------------------
    // 3. CmTimelineEvent[] に変換
    // ----------------------------------------------------------
    const events: CmTimelineEvent[] = [];

    for (const pv of pvResult.data) {
      events.push({
        timestamp: pv.timestamp,
        user_id: pv.user_id,
        user_email: null,
        user_name: null,
        event_type: "page_view",
        action: pv.path,
        category: null,
        description: `${pv.path} を閲覧`,
        resource_type: null,
        resource_id: null,
        trace_id: null,
        ip_address: pv.ip_address,
        db_changes: [],
      });
    }

    for (const op of opResult.data) {
      // db_changes は件数だけ必要。ダミー配列で長さを表現する
      const dcCount = op.trace_id ? (dcCountByTraceId.get(op.trace_id) ?? 0) : 0;
      const dbChangesPlaceholder = dcCount > 0
        ? Array.from({ length: dcCount }, () => ({} as CmDataChangeLog))
        : [];

      events.push({
        timestamp: op.timestamp,
        user_id: op.user_id,
        user_email: op.user_email,
        user_name: op.user_name,
        event_type: "operation",
        action: op.action,
        category: op.category,
        description: op.description,
        resource_type: op.resource_type,
        resource_id: op.resource_id,
        trace_id: op.trace_id,
        ip_address: op.ip_address,
        db_changes: dbChangesPlaceholder,
      });
    }

    // ----------------------------------------------------------
    // 4. ユーザー名解決
    // ----------------------------------------------------------
    await resolveUserNames(events);

    // ----------------------------------------------------------
    // 5. セッション構築
    // ----------------------------------------------------------
    events.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    const sessions = buildSessions(events);

    // ----------------------------------------------------------
    // 6. 集計実行
    // ----------------------------------------------------------
    const summary: CmAuditDashboardSummary = {
      activeUsers: new Set(sessions.map((s) => s.user_id)).size,
      operationCount: events.filter((e) => e.event_type === "operation").length,
      pageViewCount: events.filter((e) => e.event_type === "page_view").length,
      dbChangeCount: events.reduce((sum, e) => sum + e.db_changes.length, 0),
      sessionCount: sessions.length,
      dailyTrend: cmAuditBuildDailyTrend(events, params.days),
      categoryData: cmAuditBuildCategoryData(events),
      userStats: cmAuditBuildUserStats(sessions),
      importantOps: cmAuditBuildImportantOps(events),
      heatmapData: cmAuditBuildHeatmap(events),
      hourlyTimeline: cmAuditBuildHourlyTimeline(events),
    };

    return { ok: true, summary };
  } catch (error) {
    logger.error("予期せぬエラー", error as Error);
    return { ok: false, summary: EMPTY_SUMMARY, error: "サーバーエラーが発生しました" };
  }
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

async function fetchDataChangeLogsLight(
  startDate: string
): Promise<LightResult<Pick<CmDataChangeLog, "id" | "timestamp" | "context_trace_id" | "context_user_id">>> {
  const { data, error } = await supabaseAdmin
    .schema("audit")
    .from("data_change_logs")
    .select(DC_COLUMNS)
    .gte("timestamp", startDate)
    .order("timestamp", { ascending: false })
    .limit(CM_DASHBOARD_DC_LIMIT);

  return { data: (data ?? []) as Pick<CmDataChangeLog, "id" | "timestamp" | "context_trace_id" | "context_user_id">[], error: error?.message ?? null };
}

// =============================================================
// 内部ヘルパー: ユーザー名解決（getTimeline.ts と同一ロジック）
// =============================================================

async function resolveUserNames(events: CmTimelineEvent[]): Promise<void> {
  const userMap = new Map<string, { name: string | null; email: string | null }>();
  for (const ev of events) {
    if (ev.event_type === "operation" && (ev.user_name || ev.user_email)) {
      if (!userMap.has(ev.user_id)) {
        userMap.set(ev.user_id, { name: ev.user_name, email: ev.user_email });
      }
    }
  }

  const missingUserIds = new Set<string>();
  for (const ev of events) {
    if (!ev.user_name && !ev.user_email && !userMap.has(ev.user_id)) {
      missingUserIds.add(ev.user_id);
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
    if (!ev.user_name && !ev.user_email) {
      const resolved = userMap.get(ev.user_id);
      if (resolved) {
        ev.user_name = resolved.name;
        ev.user_email = resolved.email;
      }
    }
  }
}

// =============================================================
// 内部ヘルパー: セッション構築（getTimeline.ts と同一ロジック）
// =============================================================

function buildSessions(events: CmTimelineEvent[]): CmAuditSession[] {
  if (events.length === 0) return [];

  const byUser = new Map<string, CmTimelineEvent[]>();
  for (const ev of events) {
    const userEvents = byUser.get(ev.user_id) ?? [];
    userEvents.push(ev);
    byUser.set(ev.user_id, userEvents);
  }

  const allSessions: CmAuditSession[] = [];

  for (const [userId, userEvents] of byUser) {
    userEvents.sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const namedEvent = userEvents.find((e) => e.user_name || e.user_email);
    const userName = namedEvent?.user_name ?? null;
    const userEmail = namedEvent?.user_email ?? null;

    let currentSession: CmTimelineEvent[] = [userEvents[0]];

    for (let i = 1; i < userEvents.length; i++) {
      const prevTime = new Date(userEvents[i - 1].timestamp).getTime();
      const currTime = new Date(userEvents[i].timestamp).getTime();

      if (currTime - prevTime > SESSION_GAP_MS) {
        allSessions.push(createSession(userId, userName, userEmail, currentSession));
        currentSession = [];
      }
      currentSession.push(userEvents[i]);
    }

    if (currentSession.length > 0) {
      allSessions.push(createSession(userId, userName, userEmail, currentSession));
    }
  }

  allSessions.sort(
    (a, b) => new Date(b.last_timestamp).getTime() - new Date(a.last_timestamp).getTime()
  );

  return allSessions;
}

function createSession(
  userId: string,
  userName: string | null,
  userEmail: string | null,
  events: CmTimelineEvent[]
): CmAuditSession {
  return {
    session_key: `${userId}:${events[0].timestamp}`,
    user_id: userId,
    user_name: userName,
    user_email: userEmail,
    first_timestamp: events[0].timestamp,
    last_timestamp: events[events.length - 1].timestamp,
    is_active: Date.now() - new Date(events[events.length - 1].timestamp).getTime() < SESSION_GAP_MS,
    events: [], // ダッシュボード用なのでイベント詳細は不要
  };
}