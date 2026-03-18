// =============================================================
// src/constants/cm/auditDashboard.ts
// 監査ダッシュボードのランタイム定数
//
// カラーパレット、severityスタイル、カテゴリラベル/カラー、
// severity判定キーワード、ナビカード定義
// =============================================================

import { List, GitBranch, Terminal } from 'lucide-react';
import type {
  CmAuditColorSet,
  CmAuditSeverity,
  CmAuditNavCardDef,
} from '@/types/cm/auditDashboard';

// =============================================================
// カラーパレット
// =============================================================

export const CM_AUDIT_PALETTE: Record<string, CmAuditColorSet> = {
  blue:    { main: '#2563eb', light: '#dbeafe', muted: '#93bbfd' },
  violet:  { main: '#7c3aed', light: '#ede9fe', muted: '#b4a0f4' },
  cyan:    { main: '#0891b2', light: '#cffafe', muted: '#67d9ef' },
  emerald: { main: '#059669', light: '#d1fae5', muted: '#6ee7b7' },
  amber:   { main: '#d97706', light: '#fef3c7', muted: '#fbbf24' },
};

// =============================================================
// severity スタイル
// =============================================================

export const CM_AUDIT_SEVERITY_STYLES: Record<CmAuditSeverity, {
  bg: string;
  border: string;
  dot: string;
  text: string;
}> = {
  high:   { bg: '#fef2f2', border: '#fecaca', dot: '#ef4444', text: '#b91c1c' },
  medium: { bg: '#fffbeb', border: '#fed7aa', dot: '#f59e0b', text: '#b45309' },
  low:    { bg: '#ffffff', border: '#e2e8f0', dot: '#cbd5e1', text: '#64748b' },
};

// =============================================================
// severity 判定キーワード
// =============================================================

export const CM_AUDIT_HIGH_SEVERITY_ACTIONS = ['delete', 'remove', 'destroy'];
export const CM_AUDIT_MEDIUM_SEVERITY_ACTIONS = ['create', 'insert', 'batch', 'execute', 'rpa', 'update'];

// =============================================================
// カテゴリ定義
// =============================================================

export const CM_AUDIT_CATEGORY_LABELS: Record<string, string> = {
  client: '利用者',
  contract: '契約',
  fax: 'FAX',
  phonebook: 'FAX電話帳',
  'other-office': '他事業所',
  schedule: 'スケジュール',
  credential: '認証情報',
  'rpa-api': 'RPA API',
  'rpa-job': 'RPAジョブ',
  'alert-batch': 'アラートバッチ',
  plaud: 'Plaud',
  master: 'マスタ',
};

export const CM_AUDIT_CATEGORY_COLORS: Record<string, string> = {
  client: CM_AUDIT_PALETTE.blue.main,
  contract: CM_AUDIT_PALETTE.violet.main,
  fax: CM_AUDIT_PALETTE.cyan.main,
  'rpa-api': CM_AUDIT_PALETTE.amber.main,
  'rpa-job': CM_AUDIT_PALETTE.amber.main,
  master: CM_AUDIT_PALETTE.emerald.main,
};

export const CM_AUDIT_DEFAULT_CATEGORY_COLOR = '#94a3b8';

// =============================================================
// ナビカード定義
// =============================================================

export const CM_AUDIT_NAV_CARDS: CmAuditNavCardDef[] = [
  {
    id: 'operations',
    label: '操作ログ一覧',
    description: 'ユーザー操作・DB変更をフィルター検索',
    href: '/cm-portal/audit/operations',
    Icon: List,
    color: CM_AUDIT_PALETTE.blue,
    statLabel: '本日の操作',
  },
  {
    id: 'flow',
    label: '経路フロー',
    description: '操作の因果関係をトレースID単位で可視化',
    href: '/cm-portal/audit/flow',
    Icon: GitBranch,
    color: CM_AUDIT_PALETTE.violet,
    statLabel: '本日のセッション',
  },
  {
    id: 'logs',
    label: 'システムログ',
    description: 'warn / error レベルのログを確認',
    href: '/cm-portal/audit/logs',
    Icon: Terminal,
    color: CM_AUDIT_PALETTE.cyan,
    statLabel: 'ログ管理',
  },
];
