// =============================================================
// src/lib/cm/rpa-jobs/actions.ts
// RPAジョブ管理 Server Actions（Client Component用・認証必須）
//
// ビジネスロジックは core.ts に集約。
// このファイルは認証 → core 呼び出しのみ。
// =============================================================

"use server";

import { createLogger } from "@/lib/common/logger";
import { requireCmSession, CmAuthError } from "@/lib/cm/auth/requireCmSession";
import { withAuditLog } from "@/lib/cm/audit/withAuditLog";
import {
  CM_OP_LOG_RPA_JOB_CREATE,
  CM_OP_LOG_RPA_JOB_UPDATE,
} from "@/constants/cm/operationLogActions";
import {
  cmGetJobMasterCore,
  cmGetJobsCore,
  cmGetJobDetailCore,
  cmCreateJobCore,
  cmUpdateJobCore,
} from "./core";

// 型を re-export（Client hook の import パスを維持するため）
export type {
  GetJobMasterResult,
  GetJobsParams,
  GetJobsResult,
  GetJobDetailResult,
  CreateJobParams,
  CreateJobResult,
  UpdateJobParams,
  UpdateJobResult,
} from "./core";

const logger = createLogger("lib/cm/rpa-jobs/actions");

// =============================================================
// getJobMaster - マスタ取得（読み取り専用 — 操作ログ不要）
// =============================================================

export async function getJobMaster(
  queueCode: string | undefined,
  token: string,
) {
  try {
    await requireCmSession(token);
    return cmGetJobMasterCore(queueCode);
  } catch (error) {
    if (error instanceof CmAuthError) {
      return { ok: false as const, error: error.message };
    }
    logger.error("マスタ取得例外", error as Error);
    return { ok: false as const, error: "予期せぬエラーが発生しました" };
  }
}

// =============================================================
// getJobs - ジョブ一覧取得（読み取り専用 — 操作ログ不要）
// =============================================================

export async function getJobs(
  params: Parameters<typeof cmGetJobsCore>[0],
  token: string,
) {
  try {
    await requireCmSession(token);
    return cmGetJobsCore(params);
  } catch (error) {
    if (error instanceof CmAuthError) {
      return { ok: false as const, error: error.message };
    }
    logger.error("ジョブ一覧取得例外", error as Error);
    return { ok: false as const, error: "予期せぬエラーが発生しました" };
  }
}

// =============================================================
// getJobDetail - ジョブ詳細取得（読み取り専用 — 操作ログ不要）
// =============================================================

export async function getJobDetail(
  jobId: number,
  token: string,
) {
  try {
    await requireCmSession(token);
    return cmGetJobDetailCore(jobId);
  } catch (error) {
    if (error instanceof CmAuthError) {
      return { ok: false as const, error: error.message };
    }
    logger.error("ジョブ詳細取得例外", error as Error);
    return { ok: false as const, error: "予期せぬエラーが発生しました" };
  }
}

// =============================================================
// createJob - ジョブ作成
// =============================================================

export async function createJob(
  params: Parameters<typeof cmCreateJobCore>[0],
  token: string,
) {
  try {
    const auth = await requireCmSession(token);

    return withAuditLog(
      {
        auth,
        action: CM_OP_LOG_RPA_JOB_CREATE,
        resourceType: "rpa-job",
      },
      async () => {
        logger.info("ジョブ作成", { userId: auth.userId });
        return cmCreateJobCore(params);
      },
    );
  } catch (error) {
    if (error instanceof CmAuthError) {
      return { ok: false as const, error: error.message };
    }
    logger.error("ジョブ作成例外", error as Error);
    return { ok: false as const, error: "予期せぬエラーが発生しました" };
  }
}

// =============================================================
// updateJob - ジョブ更新
// =============================================================

export async function updateJob(
  jobId: number,
  params: Parameters<typeof cmUpdateJobCore>[1],
  token: string,
) {
  try {
    const auth = await requireCmSession(token);

    return withAuditLog(
      {
        auth,
        action: CM_OP_LOG_RPA_JOB_UPDATE,
        resourceType: "rpa-job",
        resourceId: String(jobId),
      },
      async () => {
        logger.info("ジョブ更新", { jobId, userId: auth.userId });
        return cmUpdateJobCore(jobId, params);
      },
    );
  } catch (error) {
    if (error instanceof CmAuthError) {
      return { ok: false as const, error: error.message };
    }
    logger.error("ジョブ更新例外", error as Error);
    return { ok: false as const, error: "予期せぬエラーが発生しました" };
  }
}