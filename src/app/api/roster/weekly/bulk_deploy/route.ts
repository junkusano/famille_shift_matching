// /src/app/api/roster/weekly/bulk_deploy/route.ts (新規ファイル)

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/service';
// page.tsx で定義された DeployPolicy 型をインポートします (実際のパスに合わせてください)
import type { DeployPolicy } from '@/app/portal/roster/weekly/page'; 

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * 週間シフトテンプレートに基づき、全利用者に対して月間シフトを一括生成・展開する
 * PostgreSQL関数 (deploy_weekly_template_bulk) を呼び出す
 */
export async function POST(req: Request) {
    let body: { month: string; policy: DeployPolicy };
    try {
        body = await req.json();
        if (!body.month || !body.policy) {
            return NextResponse.json({ error: 'month, policy は必須です' }, { status: 400 });
        }
    } catch {
        return NextResponse.json({ error: '不正なJSON形式です' }, { status: 400 });
    }

    const { month, policy } = body;

    console.log(`[weekly/bulk_deploy] deploying all clients for ${month} with policy: ${policy}`);

    // 【重要】PostgreSQLファンクションの呼び出し
    // 'deploy_weekly_template_bulk' ファンクションを呼び出す
    const { data, error } = await supabaseAdmin.rpc('deploy_weekly_template_bulk', {
        p_month: month,
        p_policy: policy,
    });

    if (error) {
        console.error('[weekly/bulk_deploy] RPC error:', error);
        return NextResponse.json({ error: `一括シフト展開ファンクションエラー: ${error.message}` }, { status: 500 });
    }

    // 正常終了時、PostgreSQLからの合計結果をそのまま返す
    // data の型は { inserted_count: number, updated_count: number, deleted_count: number } を想定
    return NextResponse.json(data || { inserted_count: 0, updated_count: 0, deleted_count: 0 });
}