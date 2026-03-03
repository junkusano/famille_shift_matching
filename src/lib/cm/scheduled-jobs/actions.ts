// src/lib/cm/scheduled-jobs/actions.ts
// 定期スケジュール更新系のServer Actions
//
// セキュリティ:
//   全アクションで requireCmSession(token) による認証を必須実施。
//   - クライアントから渡された access_token を検証（認証）
//   - 操作ログにユーザーIDを記録（監査証跡）
// =============================================================

'use server';

import { supabaseAdmin } from '@/lib/supabase/service';
import { createLogger } from '@/lib/common/logger';
import { requireCmSession, CmAuthError } from '@/lib/cm/auth/requireCmSession';
import { revalidatePath } from 'next/cache';
import { withAuditLog } from '@/lib/cm/audit/withAuditLog';
import {
  CM_OP_LOG_SCHEDULE_ADD,
  CM_OP_LOG_SCHEDULE_UPDATE,
  CM_OP_LOG_SCHEDULE_REMOVE,
  CM_OP_LOG_SCHEDULE_REORDER,
  CM_OP_LOG_SCHEDULE_TOGGLE,
} from '@/constants/cm/operationLogActions';
import type {
  AddScheduleParams,
  UpdateScheduleParams,
  ReorderSchedulesParams,
  UpdateScheduleResult,
} from '@/types/cm/scheduledJobs';

const logger = createLogger('lib/cm/scheduled-jobs/actions');

// =============================================================
// スケジュール追加（ジョブタイプを定期実行に設定）
// =============================================================

export async function addSchedule(params: AddScheduleParams, token: string): Promise<UpdateScheduleResult> {
  const {
    jobTypeId,
    schedulePayload = {},
    scheduleCancelPending = true,
    isScheduled = true,
  } = params;

  try {
    const auth = await requireCmSession(token);

    return withAuditLog(
      {
        auth,
        action: CM_OP_LOG_SCHEDULE_ADD,
        resourceType: "schedule",
        resourceId: String(jobTypeId),
      },
      async () => {
        logger.info('スケジュール追加開始', { jobTypeId, userId: auth.userId });

        // 現在の最大 schedule_order を取得
        const { data: maxOrderData } = await supabaseAdmin
          .from('cm_job_types')
          .select('schedule_order')
          .eq('is_scheduled', true)
          .order('schedule_order', { ascending: false, nullsFirst: false })
          .limit(1)
          .single();

        const nextOrder = (maxOrderData?.schedule_order ?? 0) + 1;

        // ジョブタイプを更新
        const { error } = await supabaseAdmin
          .from('cm_job_types')
          .update({
            is_scheduled: isScheduled,
            schedule_order: nextOrder,
            schedule_payload: schedulePayload,
            schedule_cancel_pending: scheduleCancelPending,
          })
          .eq('id', jobTypeId);

        if (error) {
          logger.error('スケジュール追加エラー', { message: error.message, code: error.code });
          return { ok: false, error: 'スケジュールの追加に失敗しました' };
        }

        logger.info('スケジュール追加完了', { jobTypeId, order: nextOrder, userId: auth.userId });

        revalidatePath('/cm-portal/rpa-jobs/schedules');
        return { ok: true };
      },
    );
  } catch (error) {
    if (error instanceof CmAuthError) {
      return { ok: false, error: error.message };
    }
    logger.error('予期せぬエラー', error as Error);
    return { ok: false, error: '予期せぬエラーが発生しました' };
  }
}

// =============================================================
// スケジュール設定更新
// =============================================================

export async function updateSchedule(params: UpdateScheduleParams, token: string): Promise<UpdateScheduleResult> {
  const { jobTypeId, schedulePayload, scheduleCancelPending, isScheduled } = params;

  try {
    const auth = await requireCmSession(token);

    return withAuditLog(
      {
        auth,
        action: CM_OP_LOG_SCHEDULE_UPDATE,
        resourceType: "schedule",
        resourceId: String(jobTypeId),
      },
      async () => {
        logger.info('スケジュール更新開始', { jobTypeId, userId: auth.userId });

        const updateData: Record<string, unknown> = {};

        if (schedulePayload !== undefined) {
          updateData.schedule_payload = schedulePayload;
        }
        if (scheduleCancelPending !== undefined) {
          updateData.schedule_cancel_pending = scheduleCancelPending;
        }
        if (isScheduled !== undefined) {
          updateData.is_scheduled = isScheduled;
        }

        if (Object.keys(updateData).length === 0) {
          return { ok: true }; // 更新なし
        }

        const { error } = await supabaseAdmin
          .from('cm_job_types')
          .update(updateData)
          .eq('id', jobTypeId);

        if (error) {
          logger.error('スケジュール更新エラー', { message: error.message, code: error.code });
          return { ok: false, error: 'スケジュールの更新に失敗しました' };
        }

        logger.info('スケジュール更新完了', { jobTypeId, userId: auth.userId });

        revalidatePath('/cm-portal/rpa-jobs/schedules');
        return { ok: true };
      },
    );
  } catch (error) {
    if (error instanceof CmAuthError) {
      return { ok: false, error: error.message };
    }
    logger.error('予期せぬエラー', error as Error);
    return { ok: false, error: '予期せぬエラーが発生しました' };
  }
}

// =============================================================
// スケジュール除外（定期実行から外す）
// =============================================================

export async function removeSchedule(jobTypeId: number, token: string): Promise<UpdateScheduleResult> {
  try {
    const auth = await requireCmSession(token);

    return withAuditLog(
      {
        auth,
        action: CM_OP_LOG_SCHEDULE_REMOVE,
        resourceType: "schedule",
        resourceId: String(jobTypeId),
      },
      async () => {
        logger.info('スケジュール除外開始', { jobTypeId, userId: auth.userId });

        const { error } = await supabaseAdmin
          .from('cm_job_types')
          .update({
            is_scheduled: false,
            schedule_order: null,
          })
          .eq('id', jobTypeId);

        if (error) {
          logger.error('スケジュール除外エラー', { message: error.message, code: error.code });
          return { ok: false, error: 'スケジュールの除外に失敗しました' };
        }

        logger.info('スケジュール除外完了', { jobTypeId, userId: auth.userId });

        revalidatePath('/cm-portal/rpa-jobs/schedules');
        return { ok: true };
      },
    );
  } catch (error) {
    if (error instanceof CmAuthError) {
      return { ok: false, error: error.message };
    }
    logger.error('予期せぬエラー', error as Error);
    return { ok: false, error: '予期せぬエラーが発生しました' };
  }
}

// =============================================================
// 並び順更新
// =============================================================

export async function reorderSchedules(params: ReorderSchedulesParams, token: string): Promise<UpdateScheduleResult> {
  const { order } = params;

  try {
    const auth = await requireCmSession(token);

    return withAuditLog(
      {
        auth,
        action: CM_OP_LOG_SCHEDULE_REORDER,
        resourceType: "schedule",
        metadata: { order },
      },
      async () => {
        logger.info('並び順更新開始', { count: order.length, userId: auth.userId });

        // 各ジョブタイプの schedule_order を更新
        const updates = order.map((jobTypeId, index) => ({
          id: jobTypeId,
          schedule_order: index + 1,
        }));

        // バッチ更新（1件ずつ）
        for (const update of updates) {
          const { error } = await supabaseAdmin
            .from('cm_job_types')
            .update({ schedule_order: update.schedule_order })
            .eq('id', update.id);

          if (error) {
            logger.error('並び順更新エラー', { id: update.id, message: error.message });
            return { ok: false, error: '並び順の更新に失敗しました' };
          }
        }

        logger.info('並び順更新完了', { count: order.length, userId: auth.userId });

        revalidatePath('/cm-portal/rpa-jobs/schedules');
        return { ok: true };
      },
    );
  } catch (error) {
    if (error instanceof CmAuthError) {
      return { ok: false, error: error.message };
    }
    logger.error('予期せぬエラー', error as Error);
    return { ok: false, error: '予期せぬエラーが発生しました' };
  }
}

// =============================================================
// 有効/無効切り替え
// =============================================================

export async function toggleScheduleActive(jobTypeId: number, isScheduled: boolean, token: string): Promise<UpdateScheduleResult> {
  try {
    const auth = await requireCmSession(token);

    return withAuditLog(
      {
        auth,
        action: CM_OP_LOG_SCHEDULE_TOGGLE,
        resourceType: "schedule",
        resourceId: String(jobTypeId),
        metadata: { isScheduled },
      },
      async () => {
        logger.info('有効/無効切り替え', { jobTypeId, isScheduled, userId: auth.userId });

        const { error } = await supabaseAdmin
          .from('cm_job_types')
          .update({ is_scheduled: isScheduled })
          .eq('id', jobTypeId);

        if (error) {
          logger.error('有効/無効切り替えエラー', { message: error.message, code: error.code });
          return { ok: false, error: '有効/無効の切り替えに失敗しました' };
        }

        logger.info('有効/無効切り替え完了', { jobTypeId, isScheduled, userId: auth.userId });

        revalidatePath('/cm-portal/rpa-jobs/schedules');
        return { ok: true };
      },
    );
  } catch (error) {
    if (error instanceof CmAuthError) {
      return { ok: false, error: error.message };
    }
    logger.error('予期せぬエラー', error as Error);
    return { ok: false, error: '予期せぬエラーが発生しました' };
  }
}