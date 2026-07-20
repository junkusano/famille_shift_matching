// /src/app/api/roster/weekly/bulk_deploy/route.ts

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/service';
import type { DeployPolicy } from '@/app/portal/roster/weekly/page';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type BulkDeployRequest = {
    month: string;
    policy?: DeployPolicy;
};

type DeployFunctionResult = {
    success?: boolean;
    function?: string;
    month?: string;
    template_type?: string;
    template_count?: number;
    candidate_count?: number;
    inserted_count?: number;
    skipped_count?: number;
};

type DeployStepResult = {
    name: string;
    result: DeployFunctionResult;
};

/**
 * PostgreSQL RPCの戻り値をオブジェクトとして正規化する。
 *
 * Supabase RPCの戻り値が配列になる場合にも対応する。
 */
function normalizeRpcResult(data: unknown): DeployFunctionResult {
    if (Array.isArray(data)) {
        const first = data[0];

        if (first && typeof first === 'object') {
            return first as DeployFunctionResult;
        }

        return {};
    }

    if (data && typeof data === 'object') {
        return data as DeployFunctionResult;
    }

    return {};
}

/**
 * 週間シフトテンプレートから月間シフトを一括生成する。
 *
 * 現在の処理順：
 * 1. 通常毎週テンプレート
 * 2. nth_weeks指定テンプレート
 *
 * 連続隔週テンプレートは、専用関数の完成後に追加する。
 */
export async function POST(req: Request) {
    let body: BulkDeployRequest;

    try {
        body = (await req.json()) as BulkDeployRequest;
    } catch {
        return NextResponse.json(
            {
                success: false,
                error: '不正なJSON形式です',
            },
            { status: 400 },
        );
    }

    const month = body.month?.trim();
    const policy = body.policy;

    if (!month) {
        return NextResponse.json(
            {
                success: false,
                error: 'month は必須です',
            },
            { status: 400 },
        );
    }

    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
        return NextResponse.json(
            {
                success: false,
                error: 'month は YYYY-MM 形式で指定してください',
            },
            { status: 400 },
        );
    }

    console.log(
        `[weekly/bulk_deploy] start month=${month} policy=${policy ?? 'not-specified'}`,
    );

    const steps: DeployStepResult[] = [];

    /*
     * 1．通常毎週テンプレート
     *
     * 対象：
     * is_biweekly = false または null
     * かつ nth_weeks が空
     */
    const {
        data: regularData,
        error: regularError,
    } = await supabaseAdmin.rpc(
        'deploy_weekly_template_regular_only',
        {
            p_month: month,
        },
    );

    if (regularError) {
        console.error(
            '[weekly/bulk_deploy] regular weekly RPC error:',
            regularError,
        );

        return NextResponse.json(
            {
                success: false,
                failed_step: 'regular_weekly',
                error:
                    `通常毎週シフト展開エラー: ${regularError.message}`,
                steps,
            },
            { status: 500 },
        );
    }

    const regularResult = normalizeRpcResult(regularData);

    steps.push({
        name: 'regular_weekly',
        result: regularResult,
    });

    /*
     * 2．nth_weeks指定テンプレート
     *
     * 対象：
     * nth_weeks に1件以上の週番号が入っているもの
     *
     * is_biweekly の値は問わない。
     */
    const {
        data: fixedNthData,
        error: fixedNthError,
    } = await supabaseAdmin.rpc(
        'deploy_weekly_template_fixed_nth_only',
        {
            p_month: month,
        },
    );

    if (fixedNthError) {
        console.error(
            '[weekly/bulk_deploy] fixed nth RPC error:',
            fixedNthError,
        );

        return NextResponse.json(
            {
                success: false,
                partial_success: true,
                failed_step: 'fixed_nth_weeks',
                error:
                    `指定週シフト展開エラー: ${fixedNthError.message}`,
                steps,
            },
            { status: 500 },
        );
    }

    const fixedNthResult = normalizeRpcResult(fixedNthData);

    steps.push({
        name: 'fixed_nth_weeks',
        result: fixedNthResult,
    });

    const totalTemplateCount = steps.reduce(
        (total, step) =>
            total + (step.result.template_count ?? 0),
        0,
    );

    const totalCandidateCount = steps.reduce(
        (total, step) =>
            total + (step.result.candidate_count ?? 0),
        0,
    );

    const totalInsertedCount = steps.reduce(
        (total, step) =>
            total + (step.result.inserted_count ?? 0),
        0,
    );

    const totalSkippedCount = steps.reduce(
        (total, step) =>
            total + (step.result.skipped_count ?? 0),
        0,
    );

    console.log(
        '[weekly/bulk_deploy] completed',
        {
            month,
            policy,
            template_count: totalTemplateCount,
            candidate_count: totalCandidateCount,
            inserted_count: totalInsertedCount,
            skipped_count: totalSkippedCount,
        },
    );

    return NextResponse.json({
        success: true,
        month,

        /*
         * 現在のDB関数はskip_conflict固定。
         * policyは画面との互換性のため返すだけ。
         */
        requested_policy: policy ?? null,
        applied_policy: 'skip_conflict',

        template_count: totalTemplateCount,
        candidate_count: totalCandidateCount,
        inserted_count: totalInsertedCount,
        skipped_count: totalSkippedCount,

        updated_count: 0,
        deleted_count: 0,

        steps,
    });
}