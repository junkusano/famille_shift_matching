// =============================================================
// src/lib/cm/audit/getTimeline.ts
// タイムライン統合クエリ（方式B: Promise.all並行取得 → TS側で結合）
//
// 処理フロー:
//   1. Promise.all で page_views / operation_logs / data_change_logs を並行取得
//   2. page_views + operation_logs をタイムスタンプ順にマージ → CmTimelineEvent[]
//   3. operation_logs の trace_id で data_change_logs を紐付け
//   4. ユーザー名解決（operation_logs のマップ → auth.users から補完）
//   5. user_id + 30分間隔で区切り → CmAuditSession[]
//
// 前提: Supabase Dashboard → API Settings → Exposed schemas に audit を追加済み
// =============================================================

"use server";

import { supabaseAdmin } from "@/lib/supabase/service";
import { requireCmSession, CmAuthError } from "@/lib/cm/auth/requireCmSession";
import { createLogger } from "@/lib/common/logger";
import type {
  CmPageView,
  CmOperationLog,
  CmDataChangeLog,
  CmTimelineEvent,
  CmAuditSession,
  CmAuditLogFilter,
} from "@/types/cm/operationLog";

const logger = createLogger("lib/cm/audit/getTimeline");

// =============================================================
// 型定義
// =============================================================

type GetTimelineResult = {
  ok: boolean;
  sessions: CmAuditSession[];
  total_events: number;
  error?: string;
};

/** セッション区切りの閾値（ミリ秒） — 30分 */
const SESSION_GAP_MS = 30 * 60 * 1000;

/**
 * 内部クエリの取得上限
 *
 * 日付フィルター（start_date）がある場合は期間で絞り込まれるため
 * 上限を大きくしても問題ない。日付フィルターがない場合は安全のため
 * 小さい上限を使用する。
 *
 * 旧: 全ケースで 500 固定 → 30日間で操作件数が 500 件を超えるとデータ欠落していた
 */
const CM_TIMELINE_LIMIT_WITH_DATE = 5000;
const CM_TIMELINE_LIMIT_WITHOUT_DATE = 500;
const CM_TIMELINE_DC_LIMIT_WITH_DATE = 10000;
const CM_TIMELINE_DC_LIMIT_WITHOUT_DATE = 2000;

// =============================================================
// メイン関数
// =============================================================

/**
 * タイムライン統合データを取得する
 *
 * - page_views + operation_logs を時系列マージ
 * - trace_id で data_change_logs を紐付け
 * - user_id + 30分間隔でセッションに分割
 * - old_data / new_data は最初から全取得（遅延ロードしない — 設計書の決定）
 */
export async function cmGetTimeline(
  filter: CmAuditLogFilter,
  token: string
): Promise<GetTimelineResult> {
  try {
    await requireCmSession(token);
  } catch (e) {
    if (e instanceof CmAuthError) {
      return { ok: false, sessions: [], total_events: 0, error: e.message };
    }
    throw e;
  }

  try {
    // ----------------------------------------------------------
    // 1. 3テーブル並行取得
    // ----------------------------------------------------------
    const [pvResult, opResult, dcResult] = await Promise.all([
      fetchPageViews(filter),
      fetchOperationLogs(filter),
      fetchDataChangeLogs(filter),
    ]);

    if (pvResult.error || opResult.error || dcResult.error) {
      const errorMsg = pvResult.error ?? opResult.error ?? dcResult.error ?? "";
      logger.error("タイムラインデータ取得エラー", undefined, { error: errorMsg });
      return { ok: false, sessions: [], total_events: 0, error: "データ取得に失敗しました" };
    }

    // ----------------------------------------------------------
    // 2. trace_id で data_change_logs をマップ化
    // ----------------------------------------------------------
    const dcByTraceId = new Map<string, CmDataChangeLog[]>();
    for (const dc of dcResult.data) {
      if (!dc.context_trace_id) continue;
      const existing = dcByTraceId.get(dc.context_trace_id) ?? [];
      existing.push(dc);
      dcByTraceId.set(dc.context_trace_id, existing);
    }

    // ----------------------------------------------------------
    // 3. page_views + operation_logs → CmTimelineEvent[] にマージ
    // ----------------------------------------------------------
    const events: CmTimelineEvent[] = [];

    // page_views → CmTimelineEvent
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

    // operation_logs → CmTimelineEvent（trace_id で db_changes を紐付け）
    for (const op of opResult.data) {
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
        db_changes: op.trace_id ? (dcByTraceId.get(op.trace_id) ?? []) : [],
      });
    }

    // ----------------------------------------------------------
    // 4. ユーザー名を解決する
    //    operation_logs には user_name / user_email があるが
    //    page_views には user_id しかない。
    //    → operation_logs から得たマップで補完
    //    → それでも不足する場合は auth.users から取得
    // ----------------------------------------------------------
    await resolveUserNames(events);

    // タイムスタンプ降順ソート（新しい順）
    events.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    // ----------------------------------------------------------
    // 5. ユーザーごとに分けてからセッション区切り
    // ----------------------------------------------------------
    const sessions = buildSessions(events);

    return {
      ok: true,
      sessions,
      total_events: events.length,
    };
  } catch (error) {
    logger.error("予期せぬエラー", error as Error);
    return { ok: false, sessions: [], total_events: 0, error: "サーバーエラーが発生しました" };
  }
}

// =============================================================
// 内部ヘルパー: 個別テーブル取得
// =============================================================

type QueryResult<T> = { data: T[]; error: string | null };

async function fetchPageViews(
  filter: CmAuditLogFilter
): Promise<QueryResult<CmPageView>> {
  let query = supabaseAdmin
    .schema("audit")
    .from("page_views")
    .select("*");

  if (filter.start_date) query = query.gte("timestamp", filter.start_date);
  if (filter.end_date) query = query.lte("timestamp", filter.end_date);
  if (filter.user_id) query = query.eq("user_id", filter.user_id);

  // 日付フィルターがある場合は期間で絞り込まれるため上限を大きくする
  const limit = filter.start_date
    ? CM_TIMELINE_LIMIT_WITH_DATE
    : CM_TIMELINE_LIMIT_WITHOUT_DATE;
  query = query.order("timestamp", { ascending: false }).limit(limit);

  const { data, error } = await query;
  return { data: (data as CmPageView[]) ?? [], error: error?.message ?? null };
}

async function fetchOperationLogs(
  filter: CmAuditLogFilter
): Promise<QueryResult<CmOperationLog>> {
  let query = supabaseAdmin
    .schema("audit")
    .from("operation_logs")
    .select("*");

  if (filter.start_date) query = query.gte("timestamp", filter.start_date);
  if (filter.end_date) query = query.lte("timestamp", filter.end_date);
  if (filter.user_id) query = query.eq("user_id", filter.user_id);
  if (filter.category) query = query.eq("category", filter.category);

  // 日付フィルターがある場合は期間で絞り込まれるため上限を大きくする
  const limit = filter.start_date
    ? CM_TIMELINE_LIMIT_WITH_DATE
    : CM_TIMELINE_LIMIT_WITHOUT_DATE;
  query = query.order("timestamp", { ascending: false }).limit(limit);

  const { data, error } = await query;
  return { data: (data as CmOperationLog[]) ?? [], error: error?.message ?? null };
}

async function fetchDataChangeLogs(
  filter: CmAuditLogFilter
): Promise<QueryResult<CmDataChangeLog>> {
  let query = supabaseAdmin
    .schema("audit")
    .from("data_change_logs")
    .select("*");

  if (filter.start_date) query = query.gte("timestamp", filter.start_date);
  if (filter.end_date) query = query.lte("timestamp", filter.end_date);
  if (filter.user_id) query = query.eq("context_user_id", filter.user_id);

  // data_change_logs は operation_logs より件数が多くなるため上限を大きめにする
  const limit = filter.start_date
    ? CM_TIMELINE_DC_LIMIT_WITH_DATE
    : CM_TIMELINE_DC_LIMIT_WITHOUT_DATE;
  query = query.order("timestamp", { ascending: false }).limit(limit);

  const { data, error } = await query;
  return { data: (data as CmDataChangeLog[]) ?? [], error: error?.message ?? null };
}

// =============================================================
// 内部ヘルパー: ユーザー名解決
// =============================================================

/**
 * page_views イベントに不足しているユーザー名を補完する
 *
 * 1. operation_logs から取得済みのイベントでユーザー名マップを構築
 * 2. マップに存在しない user_id は auth.users から個別取得
 * 3. 全イベントの user_name / user_email を埋める
 */
async function resolveUserNames(events: CmTimelineEvent[]): Promise<void> {
  // Step 1: operation イベントからユーザー名マップを構築
  const userMap = new Map<string, { name: string | null; email: string | null }>();
  for (const ev of events) {
    if (ev.event_type === "operation" && (ev.user_name || ev.user_email)) {
      if (!userMap.has(ev.user_id)) {
        userMap.set(ev.user_id, { name: ev.user_name, email: ev.user_email });
      }
    }
  }

  // Step 2: page_view で名前が不足している user_id を収集
  const missingUserIds = new Set<string>();
  for (const ev of events) {
    if (!ev.user_name && !ev.user_email && !userMap.has(ev.user_id)) {
      missingUserIds.add(ev.user_id);
    }
  }

  // Step 3: 不足分を auth.users から取得
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
        // auth 取得失敗は無視（UUID 表示にフォールバック）
        logger.warn("auth.users からのユーザー情報取得に失敗", { user_id: uid });
      }
    });
    await Promise.all(lookupPromises);
  }

  // Step 4: 全イベントに反映
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
// 内部ヘルパー: セッション構築
// =============================================================

/**
 * イベント配列を user_id + 30分間隔でセッションに分割する
 *
 * - 同一ユーザーのイベントが30分以上離れていたら別セッション
 * - イベントは降順（新しい順）で入ってくるが、セッション内は昇順にする
 * - user_name / user_email は resolveUserNames() で事前に補完済み
 */
function buildSessions(events: CmTimelineEvent[]): CmAuditSession[] {
  if (events.length === 0) return [];

  // ユーザーごとにグループ化
  const byUser = new Map<string, CmTimelineEvent[]>();
  for (const ev of events) {
    const userEvents = byUser.get(ev.user_id) ?? [];
    userEvents.push(ev);
    byUser.set(ev.user_id, userEvents);
  }

  const allSessions: CmAuditSession[] = [];

  for (const [userId, userEvents] of byUser) {
    // 昇順にソート（古い順 → セッション区切りロジック用）
    userEvents.sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    // ユーザー名/メールは resolveUserNames() で補完済み
    // 最初に見つかったものを使用
    const namedEvent = userEvents.find((e) => e.user_name || e.user_email);
    const userName = namedEvent?.user_name ?? null;
    const userEmail = namedEvent?.user_email ?? null;

    // 30分間隔でセッション分割
    let currentSession: CmTimelineEvent[] = [userEvents[0]];

    for (let i = 1; i < userEvents.length; i++) {
      const prevTime = new Date(userEvents[i - 1].timestamp).getTime();
      const currTime = new Date(userEvents[i].timestamp).getTime();

      if (currTime - prevTime > SESSION_GAP_MS) {
        // 新しいセッションを開始
        allSessions.push(
          createSession(userId, userName, userEmail, currentSession)
        );
        currentSession = [];
      }
      currentSession.push(userEvents[i]);
    }

    // 最後のセッションを追加
    if (currentSession.length > 0) {
      allSessions.push(
        createSession(userId, userName, userEmail, currentSession)
      );
    }
  }

  // セッションを最終イベント時刻の降順でソート
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
  const firstTs = events[0].timestamp;
  const lastTs = events[events.length - 1].timestamp;
  const now = Date.now();
  const lastTime = new Date(lastTs).getTime();

  return {
    session_key: `${userId}:${firstTs}`,
    user_id: userId,
    user_name: userName,
    user_email: userEmail,
    first_timestamp: firstTs,
    last_timestamp: lastTs,
    is_active: now - lastTime < SESSION_GAP_MS,
    events,
  };
}