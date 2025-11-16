// /src/app/api/alert_add/_shared.ts
import 'server-only';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// ここからは lib への単なる橋渡し
export {
  getServerCronSecret,
  getIncomingCronToken,
  assertCronAuth,
} from '@/lib/cron/auth';

export {
  ensureSystemAlert,
} from '@/lib/alert/ensureSystemAlert';
