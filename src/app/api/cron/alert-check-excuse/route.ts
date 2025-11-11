// /src/app/api/cron/alert-check-excuse/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextRequest, NextResponse } from 'next/server';
import { assertCronAuth, getIncomingCronToken, getServerCronSecret } from '../../alert_add/_shared';


type CheckItem = { path: string; label?: string; enabled?: boolean };
type ChildOk = { ok: true;[k: string]: unknown };
type ChildNg = { ok: false; error?: string;[k: string]: unknown };
type ChildResp = ChildOk | ChildNg;

const CHECKS: CheckItem[] = [
    { path: '/api/alert_add/postal_code_check', label: '郵便番号未設定', enabled: true },
    { path: '/api/alert_add/resigner_shift_check', label: '退職者シフト残り', enabled: true },
    { path: '/api/alert_add/shift_record_unfinish_check', label: '実施記録 未提出', enabled: true },
];

export async function GET(req: NextRequest) {
    try {
        assertCronAuth(req);

        const url = new URL(req.url);
        // 受け取ったトークンを抽出。無ければサーバのシークレットを使う
        const incoming = getIncomingCronToken(req);
        const token = incoming ?? getServerCronSecret() ?? '';

        const debug = url.searchParams.get('debug') === '1';
        const only = (url.searchParams.get('only') ?? '').split(',').map(s => s.trim()).filter(Boolean);

        const targets = CHECKS
            .filter(c => c.enabled !== false)
            .filter(c => {
                if (!only.length) return true;
                const last = c.path.split('/').filter(Boolean).pop() ?? '';
                return only.includes(last);
            });

        console.log('[cron][hub] start', { targets: targets.map(t => t.path), debug, hasToken: !!token });

        const settled = await Promise.allSettled(targets.map(async (t) => {
            const u = new URL(t.path, url.origin);
            if (debug) u.searchParams.set('debug', '1');

            // ★ 子APIへ Authorization と x-cron-token を両方付与
            const res = await fetch(u.toString(), {
                method: 'GET',
                headers: {
                    'authorization': token ? `Bearer ${token}` : '',
                    'x-cron-token': token,
                },
                cache: 'no-store',
                next: { revalidate: 0 },
            });

            const text = await res.text();
            let body: ChildResp;
            try { body = JSON.parse(text) as ChildResp; } catch { body = { ok: false, error: 'Invalid JSON', raw: text }; }

            console.log('[cron][hub] done', { path: t.path, status: res.status, ok: res.ok });
            return { path: t.path, label: t.label ?? t.path, ok: res.ok, status: res.status, body };
        }));

        const report = settled.map(r => r.status === 'fulfilled'
            ? r.value
            : { path: 'unknown', label: 'unknown', ok: false, status: 500, body: { ok: false, error: String(r.reason) } });

        const summary = {
            total: report.length,
            success: report.filter(r => r.ok).length,
            failure: report.filter(r => !r.ok).length,
        };

        return NextResponse.json({ ok: true, summary, report }, { status: 200 });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[cron][hub] fatal', msg);
        return NextResponse.json({ ok: false, error: msg }, { status: 500 });
    }
}
