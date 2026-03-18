// =============================================================
// src/lib/cm/audit/dashboardAggregation.ts
// 監査ダッシュボード用の集計関数・ユーティリティ
//
// CmAuditDashboardPage から切り出した純粋関数群。
// DB アクセスなし・副作用なし。
// =============================================================

import {
  CM_AUDIT_CATEGORY_LABELS,
  CM_AUDIT_CATEGORY_COLORS,
  CM_AUDIT_DEFAULT_CATEGORY_COLOR,
  CM_AUDIT_HIGH_SEVERITY_ACTIONS,
  CM_AUDIT_MEDIUM_SEVERITY_ACTIONS,
} from '@/constants/cm/auditDashboard';
import type {
  CmAuditSeverity,
  CmAuditPeriod,
  CmAuditUserStat,
  CmAuditImportantOp,
  CmAuditHeatmapCell,
} from '@/types/cm/auditDashboard';
import type {
  CmAuditSession,
  CmTimelineEvent,
} from '@/types/cm/operationLog';

// =============================================================
// 期間ラベル
// =============================================================

/** 期間に応じた表示ラベルを返す（サマリーカード用） */
export function cmAuditPeriodLabel(period: CmAuditPeriod): string {
  switch (period) {
    case 'today': return '本日';
    case '7d':    return '7日間';
    case '30d':   return '30日間';
  }
}

/** 期間に応じた接頭辞ラベルを返す（ナビカード・チャートタイトル用） */
export function cmAuditPeriodPrefix(period: CmAuditPeriod): string {
  switch (period) {
    case 'today': return '本日の';
    case '7d':    return '7日間の';
    case '30d':   return '30日間の';
  }
}

// =============================================================
// 汎用ユーティリティ
// =============================================================

/** 指定日数前の 00:00:00 を ISO 文字列で返す */
export function cmAuditDaysAgoStart(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/** セッションからユーザー表示名 */
export function cmAuditSessionDisplayName(session: CmAuditSession): string {
  if (session.user_name) return session.user_name;
  if (session.user_email) return session.user_email.split('@')[0];
  return session.user_id.slice(0, 8);
}

/** イベントからユーザー表示名 */
export function cmAuditDisplayName(event: CmTimelineEvent): string {
  if (event.user_name) return event.user_name;
  if (event.user_email) return event.user_email.split('@')[0];
  return event.user_id.slice(0, 8);
}

/** 時刻フォーマット HH:mm */
export function cmAuditFormatTime(timestamp: string): string {
  const d = new Date(timestamp);
  return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
}

/** アクションの severity 判定 */
export function cmAuditGetSeverity(action: string): CmAuditSeverity {
  const lower = action.toLowerCase();
  if (CM_AUDIT_HIGH_SEVERITY_ACTIONS.some((k) => lower.includes(k))) return 'high';
  if (CM_AUDIT_MEDIUM_SEVERITY_ACTIONS.some((k) => lower.includes(k))) return 'medium';
  return 'low';
}

/** ヒートマップカラー算出 */
export function cmAuditHeatmapColor(intensity: number): { bg: string; text: string } {
  if (intensity === 0) return { bg: '#f1f5f9', text: '#475569' };
  if (intensity < 0.25) return { bg: '#bfdbfe', text: '#475569' };
  if (intensity < 0.5) return { bg: '#60a5fa', text: '#fff' };
  if (intensity < 0.75) return { bg: '#3b82f6', text: '#fff' };
  return { bg: '#1e40af', text: '#fff' };
}

// =============================================================
// 集計関数: イベント配列 → チャート用データ
// =============================================================

/** 日別推移データを構築 */
export function cmAuditBuildDailyTrend(
  events: CmTimelineEvent[],
  days: number
): { date: string; pageViews: number; operations: number; dataChanges: number }[] {
  const buckets = new Map<string, { pageViews: number; operations: number; dataChanges: number }>();

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = `${d.getMonth() + 1}/${d.getDate()}`;
    buckets.set(key, { pageViews: 0, operations: 0, dataChanges: 0 });
  }

  for (const ev of events) {
    const d = new Date(ev.timestamp);
    const key = `${d.getMonth() + 1}/${d.getDate()}`;
    const bucket = buckets.get(key);
    if (!bucket) continue;
    if (ev.event_type === 'page_view') {
      bucket.pageViews++;
    } else {
      bucket.operations++;
      bucket.dataChanges += ev.db_changes.length;
    }
  }

  return Array.from(buckets.entries()).map(([date, vals]) => ({ date, ...vals }));
}

/** カテゴリ内訳データを構築 */
export function cmAuditBuildCategoryData(
  events: CmTimelineEvent[]
): { name: string; value: number; color: string }[] {
  const counts = new Map<string, number>();
  for (const ev of events) {
    if (ev.event_type !== 'operation' || !ev.category) continue;
    counts.set(ev.category, (counts.get(ev.category) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([cat, count]) => ({
      name: CM_AUDIT_CATEGORY_LABELS[cat] ?? cat,
      value: count,
      color: CM_AUDIT_CATEGORY_COLORS[cat] ?? CM_AUDIT_DEFAULT_CATEGORY_COLOR,
    }));
}

/** ユーザー別アクティビティを構築 */
export function cmAuditBuildUserStats(sessions: CmAuditSession[]): CmAuditUserStat[] {
  const userMap = new Map<string, CmAuditUserStat>();

  for (const session of sessions) {
    const name = cmAuditSessionDisplayName(session);
    const existing = userMap.get(session.user_id) ?? {
      name,
      userId: session.user_id,
      operations: 0,
      pageViews: 0,
      lastAccess: '',
      changes: 0,
    };

    for (const ev of session.events) {
      if (ev.event_type === 'page_view') {
        existing.pageViews++;
      } else {
        existing.operations++;
        existing.changes += ev.db_changes.length;
      }
    }

    const sessionLast = session.last_timestamp;
    if (!existing.lastAccess || sessionLast > existing.lastAccess) {
      existing.lastAccess = sessionLast;
    }

    userMap.set(session.user_id, existing);
  }

  return Array.from(userMap.values())
    .sort((a, b) => b.operations - a.operations);
}

/** 注目操作（高 severity）を抽出 */
export function cmAuditBuildImportantOps(events: CmTimelineEvent[]): CmAuditImportantOp[] {
  return events
    .filter((ev) => ev.event_type === 'operation')
    .map((ev) => ({
      time: cmAuditFormatTime(ev.timestamp),
      user: cmAuditDisplayName(ev),
      action: ev.action,
      target: ev.description ?? ev.resource_type ?? '',
      severity: cmAuditGetSeverity(ev.action),
    }))
    .sort((a, b) => {
      const order: Record<CmAuditSeverity, number> = { high: 0, medium: 1, low: 2 };
      return order[a.severity] - order[b.severity];
    })
    .slice(0, 8);
}

/** 曜日×時間帯ヒートマップを構築 */
export function cmAuditBuildHeatmap(events: CmTimelineEvent[]): CmAuditHeatmapCell[] {
  const days = ['月', '火', '水', '木', '金', '土', '日'];
  const grid = new Map<string, number>();

  for (let d = 0; d < 7; d++) {
    for (let h = 6; h <= 21; h++) {
      grid.set(`${d}-${h}`, 0);
    }
  }

  for (const ev of events) {
    const date = new Date(ev.timestamp);
    const jsDay = date.getDay();
    const dayIdx = jsDay === 0 ? 6 : jsDay - 1;
    const h = date.getHours();
    if (h >= 6 && h <= 21) {
      const key = `${dayIdx}-${h}`;
      grid.set(key, (grid.get(key) ?? 0) + 1);
    }
  }

  const data: CmAuditHeatmapCell[] = [];
  for (let d = 0; d < 7; d++) {
    for (let h = 6; h <= 21; h++) {
      data.push({
        day: days[d],
        dayIndex: d,
        hour: h,
        count: grid.get(`${d}-${h}`) ?? 0,
      });
    }
  }
  return data;
}

/** 時間帯別バーチャートデータを構築 */
export function cmAuditBuildHourlyTimeline(
  events: CmTimelineEvent[]
): { hour: string; operations: number; pageViews: number }[] {
  const buckets = Array.from({ length: 24 }, (_, i) => ({
    hour: `${String(i).padStart(2, '0')}:00`,
    operations: 0,
    pageViews: 0,
  }));

  for (const ev of events) {
    const h = new Date(ev.timestamp).getHours();
    if (ev.event_type === 'page_view') {
      buckets[h].pageViews++;
    } else {
      buckets[h].operations++;
    }
  }

  return buckets;
}
