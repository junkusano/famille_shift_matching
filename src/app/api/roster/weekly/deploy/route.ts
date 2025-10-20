// /src/app/api/roster/weekly/deploy/route.ts (新規ファイル)

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/service';
// page.tsx で定義された DeployPolicy 型をインポートします
// 実際のパスに合わせて修正してください。例: '@/app/portal/roster/weekly/page'
import type { DeployPolicy } from '@/app/portal/roster/weekly/page';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * 週間シフトテンプレートに基づき、月間シフトを生成・展開する
 * PostgreSQL関数 (deploy_weekly_template) を呼び出す
 */
export async function POST(req: Request) {
    let body: { month: string; kaipoke_cs_id: string; policy: DeployPolicy };
    try {
        body = await req.json();
        if (!body.month || !body.kaipoke_cs_id || !body.policy) {
            return NextResponse.json({ error: 'month, kaipoke_cs_id, policy は必須です' }, { status: 400 });
        }
    } catch {
        return NextResponse.json({ error: '不正なJSON形式です' }, { status: 400 });
    }

    const { month, kaipoke_cs_id, policy } = body;

    console.log(`[weekly/deploy] deploying ${kaipoke_cs_id} for ${month} with policy: ${policy}`);

    // 【重要】PostgreSQLファンクションの呼び出し
    // ファンクションの返り値は、挿入/更新/削除件数を含むJSONBを想定
    const { data, error } = await supabaseAdmin.rpc('deploy_weekly_template', {
        p_month: month,
        p_cs_id: kaipoke_cs_id,
        p_policy: policy,
    });

    if (error) {
        console.error('[weekly/deploy] RPC error:', error);
        return NextResponse.json({ error: `シフト展開ファンクションエラー: ${error.message}` }, { status: 500 });
    }

    // 正常終了時、PostgreSQLからの結果をそのまま返す
    // data の型は { inserted_count: number, updated_count: number, deleted_count: number } を想定
    return NextResponse.json(data || { inserted_count: 0, updated_count: 0, deleted_count: 0 });
}