// =============================================================
// src/lib/common/logger.ts
// 共通ロガーモジュール - DB保存機能付き
// =============================================================

// =============================================================
// 型定義
// =============================================================

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogContext = Record<string, unknown>;

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  module: string;
  action?: string;
  message: string;
  traceId?: string;
  context?: LogContext;
  env: Environment;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

export interface Environment {
  /** production / preview / development */
  name: string;
  /** Vercel上で動作しているか */
  isVercel: boolean;
  /** 本番環境か */
  isProduction: boolean;
}

// =============================================================
// 環境判定
// =============================================================

function detectEnvironment(): Environment {
  const vercelEnv = process.env.VERCEL_ENV; // production | preview | development
  const nodeEnv = process.env.NODE_ENV;     // production | development
  const isVercel = process.env.VERCEL === "1";

  let name: string;
  if (vercelEnv) {
    name = vercelEnv; // Vercel上なら VERCEL_ENV を使用
  } else if (nodeEnv === "production") {
    name = "production";
  } else {
    name = "development";
  }

  return {
    name,
    isVercel,
    isProduction: name === "production",
  };
}

// 起動時に一度だけ判定（パフォーマンス）
const ENV = detectEnvironment();

/**
 * 現在の環境情報を取得
 */
export function getEnvironment(): Environment {
  return ENV;
}

// =============================================================
// Supabase クライアント（ログ保存用）
// =============================================================

// 遅延インポートで循環参照を回避
let supabaseForLog: Awaited<typeof import("@/lib/supabase/service")>["supabaseAdmin"] | null = null;
let supabaseImportFailed = false;

async function getSupabaseForLog() {
  // クライアントサイドではDB保存しない（supabaseAdminはサーバー専用）
  if (typeof window !== "undefined") {
    return null;
  }

  if (supabaseForLog) return supabaseForLog;
  if (supabaseImportFailed) return null;

  try {
    const { supabaseAdmin } = await import("@/lib/supabase/service");
    supabaseForLog = supabaseAdmin;
    return supabaseForLog;
  } catch {
    // インポート失敗時は以後スキップ
    supabaseImportFailed = true;
    return null;
  }
}

// =============================================================
// 設定
// =============================================================

// 環境変数でログレベルを制御（デフォルト: 開発=debug, 本番=info）
const LOG_LEVEL: LogLevel = (process.env.LOG_LEVEL as LogLevel) 
  || (ENV.isProduction ? "info" : "debug");

// ログレベルの優先度
const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[LOG_LEVEL];
}

// =============================================================
// DB保存（warn / error のみ）
// =============================================================

async function saveToDatabase(entry: LogEntry): Promise<void> {
  // warn / error のみDB保存
  if (entry.level !== "warn" && entry.level !== "error") {
    return;
  }

  const supabase = await getSupabaseForLog();
  if (!supabase) {
    return;
  }

  try {
    const { error } = await supabase
      .schema("audit")
      .from("system_logs")
      .insert({
        timestamp: entry.timestamp,
        level: entry.level,
        module: entry.module,
        action: entry.action || null,
        message: entry.message,
        context: entry.context || null,
        trace_id: entry.traceId || null,
        env: entry.env.name,
        error_name: entry.error?.name || null,
        error_message: entry.error?.message || null,
        error_stack: entry.error?.stack || null,
      });

    if (error) {
      console.error("[logger] Failed to save log to DB:", error.message);
    }
  } catch (e) {
    console.error("[logger] Exception saving log to DB:", e);
  }
}

// =============================================================
// ログ出力
// =============================================================

function formatForConsole(entry: LogEntry): void {
  // 本番/Vercel: JSON形式（検索しやすい）
  // 開発: 読みやすい形式
  if (ENV.isProduction || ENV.isVercel) {
    const jsonOutput = JSON.stringify(entry);
    switch (entry.level) {
      case "error":
        console.error(jsonOutput);
        break;
      case "warn":
        console.warn(jsonOutput);
        break;
      default:
        console.log(jsonOutput);
    }
  } else {
    // 開発環境: 読みやすいフォーマット
    const envTag = `[${entry.env.name}]`;
    const prefix = `${envTag} [${entry.level.toUpperCase()}] [${entry.module}]`;
    const actionPart = entry.action ? `[${entry.action}]` : "";
    const tracePart = entry.traceId ? ` trace=${entry.traceId}` : "";
    const msg = `${prefix}${actionPart}${tracePart} ${entry.message}`;

    switch (entry.level) {
      case "error":
        console.error(msg, entry.context || "", entry.error || "");
        break;
      case "warn":
        console.warn(msg, entry.context || "");
        break;
      default:
        console.log(msg, entry.context || "");
    }
  }
}

function emitLog(
  level: LogLevel,
  module: string,
  message: string,
  options?: {
    action?: string;
    traceId?: string;
    context?: LogContext;
    error?: Error;
  }
): void {
  if (!shouldLog(level)) return;

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    module,
    message,
    env: ENV,
  };

  if (options?.action) entry.action = options.action;
  if (options?.traceId) entry.traceId = options.traceId;
  if (options?.context) entry.context = options.context;

  if (options?.error) {
    entry.error = {
      name: options.error.name,
      message: options.error.message,
      stack: options.error.stack,
    };
  }

  // コンソール出力
  formatForConsole(entry);

  // DB保存（非同期、エラーは握りつぶす）
  saveToDatabase(entry).catch(() => {
    // 握りつぶす（コンソール出力は saveToDatabase 内で行う）
  });
}

// =============================================================
// Logger クラス
// =============================================================

export class Logger {
  private module: string;
  private defaultContext?: LogContext;

  constructor(module: string, defaultContext?: LogContext) {
    this.module = module;
    this.defaultContext = defaultContext;
  }

  child(action: string, additionalContext?: LogContext): ChildLogger {
    return new ChildLogger(this.module, action, {
      ...this.defaultContext,
      ...additionalContext,
    });
  }

  withTrace(traceId: string): TracedLogger {
    return new TracedLogger(this.module, traceId, this.defaultContext);
  }

  debug(message: string, context?: LogContext): void {
    emitLog("debug", this.module, message, {
      context: { ...this.defaultContext, ...context },
    });
  }

  info(message: string, context?: LogContext): void {
    emitLog("info", this.module, message, {
      context: { ...this.defaultContext, ...context },
    });
  }

  warn(message: string, context?: LogContext): void {
    emitLog("warn", this.module, message, {
      context: { ...this.defaultContext, ...context },
    });
  }

  error(message: string, error?: Error | unknown, context?: LogContext): void {
    const err = error instanceof Error ? error : undefined;
    emitLog("error", this.module, message, {
      context: { ...this.defaultContext, ...context },
      error: err,
    });
  }
}

// =============================================================
// ChildLogger（アクション付き）
// =============================================================

class ChildLogger {
  private module: string;
  private action: string;
  private context?: LogContext;

  constructor(module: string, action: string, context?: LogContext) {
    this.module = module;
    this.action = action;
    this.context = context;
  }

  debug(message: string, ctx?: LogContext): void {
    emitLog("debug", this.module, message, {
      action: this.action,
      context: { ...this.context, ...ctx },
    });
  }

  info(message: string, ctx?: LogContext): void {
    emitLog("info", this.module, message, {
      action: this.action,
      context: { ...this.context, ...ctx },
    });
  }

  warn(message: string, ctx?: LogContext): void {
    emitLog("warn", this.module, message, {
      action: this.action,
      context: { ...this.context, ...ctx },
    });
  }

  error(message: string, error?: Error | unknown, ctx?: LogContext): void {
    const err = error instanceof Error ? error : undefined;
    emitLog("error", this.module, message, {
      action: this.action,
      context: { ...this.context, ...ctx },
      error: err,
    });
  }
}

// =============================================================
// TracedLogger（traceId付き）
// =============================================================

class TracedLogger {
  private module: string;
  private traceId: string;
  private context?: LogContext;

  constructor(module: string, traceId: string, context?: LogContext) {
    this.module = module;
    this.traceId = traceId;
    this.context = context;
  }

  child(action: string, additionalContext?: LogContext): TracedChildLogger {
    return new TracedChildLogger(this.module, action, this.traceId, {
      ...this.context,
      ...additionalContext,
    });
  }

  debug(message: string, ctx?: LogContext): void {
    emitLog("debug", this.module, message, {
      traceId: this.traceId,
      context: { ...this.context, ...ctx },
    });
  }

  info(message: string, ctx?: LogContext): void {
    emitLog("info", this.module, message, {
      traceId: this.traceId,
      context: { ...this.context, ...ctx },
    });
  }

  warn(message: string, ctx?: LogContext): void {
    emitLog("warn", this.module, message, {
      traceId: this.traceId,
      context: { ...this.context, ...ctx },
    });
  }

  error(message: string, error?: Error | unknown, ctx?: LogContext): void {
    const err = error instanceof Error ? error : undefined;
    emitLog("error", this.module, message, {
      traceId: this.traceId,
      context: { ...this.context, ...ctx },
      error: err,
    });
  }
}

// =============================================================
// TracedChildLogger（traceId + アクション付き）
// =============================================================

class TracedChildLogger {
  private module: string;
  private action: string;
  private traceId: string;
  private context?: LogContext;

  constructor(module: string, action: string, traceId: string, context?: LogContext) {
    this.module = module;
    this.action = action;
    this.traceId = traceId;
    this.context = context;
  }

  debug(message: string, ctx?: LogContext): void {
    emitLog("debug", this.module, message, {
      action: this.action,
      traceId: this.traceId,
      context: { ...this.context, ...ctx },
    });
  }

  info(message: string, ctx?: LogContext): void {
    emitLog("info", this.module, message, {
      action: this.action,
      traceId: this.traceId,
      context: { ...this.context, ...ctx },
    });
  }

  warn(message: string, ctx?: LogContext): void {
    emitLog("warn", this.module, message, {
      action: this.action,
      traceId: this.traceId,
      context: { ...this.context, ...ctx },
    });
  }

  error(message: string, error?: Error | unknown, ctx?: LogContext): void {
    const err = error instanceof Error ? error : undefined;
    emitLog("error", this.module, message, {
      action: this.action,
      traceId: this.traceId,
      context: { ...this.context, ...ctx },
      error: err,
    });
  }
}

// =============================================================
// ファクトリ関数
// =============================================================

/**
 * モジュール用ロガーを作成
 */
export function createLogger(module: string, defaultContext?: LogContext): Logger {
  return new Logger(module, defaultContext);
}

/**
 * traceIdを生成
 */
export function generateTraceId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

// =============================================================
// デフォルトエクスポート
// =============================================================

export const logger = createLogger("app");