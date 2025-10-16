//lib/auth/cronAuthCache
import { NextRequest } from "next/server";

type CacheEntry = {
  ok: true;
  setAt: number;     // epoch ms
  expiresAt: number; // epoch ms
};

type CronAuthCache = Map<string, CacheEntry>;

// グローバルにキャッシュを保持（リージョン/インスタンスは跨げません）
const g = globalThis as unknown as { __CRON_AUTH_CACHE__?: CronAuthCache };
function store(): CronAuthCache {
  if (!g.__CRON_AUTH_CACHE__) g.__CRON_AUTH_CACHE__ = new Map<string, CacheEntry>();
  return g.__CRON_AUTH_CACHE__;
}

export type AuthOptions = {
  routeId: string;     // 例: "cron:shift-record-check"
  ttlMs: number;       // 例: 10 * 60 * 1000
  allowLocal?: boolean; // dev 環境を常に許可するなら true
};

export type AuthResult =
  | { ok: true; source: "header" | "cache" }
  | { ok: false; reason: "no_header_and_cache_miss"; hint: { hasBearer: boolean; xVercelCron: string | null; ua: string | null } };

function headerAuthorized(req: NextRequest): boolean {
  const isLocal = process.env.NODE_ENV !== "production";
  if (isLocal) return true;

  // 1) Vercel Scheduler（ヘッダ or UA）
  const cronHdr = (req.headers.get("x-vercel-cron") ?? "").toLowerCase();
  const ua = req.headers.get("user-agent") ?? "";
  const isVercelCronHeader = cronHdr === "1" || cronHdr === "true";
  const isVercelCronUA = /vercel[- ]cron/i.test(ua);

  if (isVercelCronHeader || isVercelCronUA) return true;

  // 2) Bearer（手動/内部）
  const auth = req.headers.get("authorization") ?? "";
  if (auth.startsWith("Bearer ")) {
    const token = auth.slice(7);
    if (token && token === process.env.CRON_SECRET) return true;
  }
  return false;
}

/**
 * 仕組み:
 *  1) ヘッダで承認できたら、routeId 単位で TTL キャッシュして ok:true (source: 'header')
 *  2) ヘッダ NG でも、未失効のキャッシュがあれば ok:true (source: 'cache')
 *  3) 両方ダメなら ok:false を返す（ヒント付き）
 */
export function checkOrCacheAuth(req: NextRequest, opts: AuthOptions): AuthResult {
  const s = store();
  const now = Date.now();

  if (opts.allowLocal && process.env.NODE_ENV !== "production") {
    // ローカル開発は常にOK、ただし source は header 扱いでキャッシュも更新
    s.set(opts.routeId, { ok: true, setAt: now, expiresAt: now + opts.ttlMs });
    return { ok: true, source: "header" };
  }

  if (headerAuthorized(req)) {
    s.set(opts.routeId, { ok: true, setAt: now, expiresAt: now + opts.ttlMs });
    return { ok: true, source: "header" };
  }

  const entry = s.get(opts.routeId);
  if (entry && entry.expiresAt > now) {
    return { ok: true, source: "cache" };
  }
  if (entry && entry.expiresAt <= now) {
    s.delete(opts.routeId);
  }

  const hasBearer = (req.headers.get("authorization") ?? "").startsWith("Bearer ");
  return {
    ok: false,
    reason: "no_header_and_cache_miss",
    hint: {
      hasBearer,
      xVercelCron: req.headers.get("x-vercel-cron"),
      ua: req.headers.get("user-agent"),
    },
  };
}
