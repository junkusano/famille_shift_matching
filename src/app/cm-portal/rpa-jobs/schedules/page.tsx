// =============================================================
// src/app/cm-portal/rpa-jobs/schedules/page.tsx
// 定期スケジュール管理画面（Server Component）
// =============================================================

import { getScheduledJobTypes } from '@/lib/cm/scheduled-jobs/getScheduledJobTypes';
import { getAvailableJobTypes } from '@/lib/cm/scheduled-jobs/getAvailableJobTypes';
import { CmSchedulesPageContent } from '@/components/cm-components/rpa-jobs/schedules/CmSchedulesPageContent';

export const dynamic = 'force-dynamic';

export default async function SchedulesPage() {
  // Server側でデータ取得
  const [scheduledResult, availableResult] = await Promise.all([
    getScheduledJobTypes(),
    getAvailableJobTypes(),
  ]);

  if (scheduledResult.ok === false) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-slate-800">定期スケジュール</h1>
        <p className="text-red-500 mt-4">{scheduledResult.error}</p>
      </div>
    );
  }

  return (
    <CmSchedulesPageContent
      scheduledJobTypes={scheduledResult.jobTypes}
      availableJobTypes={availableResult.ok ? availableResult.jobTypes : []}
    />
  );
}