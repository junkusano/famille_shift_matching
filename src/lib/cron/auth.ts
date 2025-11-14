// src/lib/cron/auth.ts
import { NextRequest } from 'next/server';

const SERVER_SECRET = process.env.CRON_SECRET ?? '';

export function assertCronAuth(req: NextRequest): void {
  const url = new URL(req.url);
  const path = url.pathname;

  const token = req.headers.get('x-server-secret') ?? '';

  const ok = !!SERVER_SECRET && token === SERVER_SECRET;

  console.info('[cron][auth]', {
    path,
    src: 'auth',
    hasServerSecret: ok,
    serverSecretLen: SERVER_SECRET.length,
    tokenPreview: token ? `${token.slice(0, 2)}...(${token.length})` : '',
  });

  if (!ok) {
    throw new Error('unauthorized_cron');
  }
}
