// ファイル: src/app/api/lineworks/init-group/route.ts
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';
import { FIXED_GROUP_MASTERS, HELPER_MANAGER_GROUP_ID, ORG_RECURSION_LIMIT } from '@/lib/lineworks/groupDefaults';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getAccessToken } from '@/lib/getAccessToken';

const DOMAIN_ID = parseInt(process.env.LINEWORKS_DOMAIN_ID || '0', 10);
const API_BASE = 'https://www.worksapis.com/v1.0';

// 親グループ（固定）
const GLOBAL_PARENT_GROUPS = [
    'c4a97fc2-865d-440d-3e60-05043231c290', // 全ヘルパー
    '8237ba83-f9ca-4c9f-3f15-052e9ea0a678',  // 全社員
    'ddc1ce56-fef0-480d-3220-05f8ed15163d'  // 訪問記録エラー通知
] as const;

// 親に必ずぶら下げたい orgunitid（固定）
const GLOBAL_CHILD_ORG_UNITS = [
    '572f07a2-999d-4a48-20fd-0517ecd2d6af' // ファミーユヘルパーサービス愛知
];

// ===== 型 =====
interface EntryViewRow {
    user_id: string;
    last_name_kanji: string;
    first_name_kanji: string;
    level_sort: number | string;
    lw_userid?: string | null;
    org_unit_id?: string | null;
    group_type?: string | null;
    is_primary?: boolean | null;
    end_at?: string | null;
    updated_at?: string | null;
}
interface LwUserIdRow { lw_userid: string }

interface GroupCreatePayload {
    groupName: string;
    groupExternalKey: string;
    administrators: { userId: string }[];
    members: { id: string; type: 'USER' | 'GROUP' }[];
}

export async function POST(req: Request) {
    const { userId, orgUnitId, extraMemberIds = [] } = await req.json();
    const accessToken = await getAccessToken();

    console.log(`[init-group] lwUserId=${userId}, orgUnitId=${orgUnitId}`);

    // === 1) 対象ユーザー情報（ビュー重複に強い取得） ===
    const { data: entryRowsRaw, error: ueErr } = await supabase
        .from('user_entry_united_view')
        .select('*')
        .eq('group_type', '人事労務サポートルーム')
        .eq('lw_userid', userId);

    if (ueErr || !entryRowsRaw || entryRowsRaw.length === 0) {
        console.error(`user_entry_united_view取得失敗: ${ueErr?.message ?? 'no row'}`);
        return NextResponse.json({ error: 'ユーザー情報取得失敗' }, { status: 400 });
    }

    const entryRows: EntryViewRow[] = entryRowsRaw as EntryViewRow[];

    // JS側で primary優先 → 新しい方優先
    const entryRowsSorted = [...entryRows].sort((a: EntryViewRow, b: EntryViewRow) => {
        const ap = a?.is_primary ? 1 : 0;
        const bp = b?.is_primary ? 1 : 0;
        if (ap !== bp) return bp - ap;
        const aTime = Date.parse(a?.end_at ?? a?.updated_at ?? '');
        const bTime = Date.parse(b?.end_at ?? b?.updated_at ?? '');
        return (isNaN(bTime) ? 0 : bTime) - (isNaN(aTime) ? 0 : aTime);
    });
    const entryUser = entryRowsSorted[0];

    const fullName = `${entryUser.last_name_kanji}${entryUser.first_name_kanji}`;
    const localUserId = entryUser.user_id;
    const levelSort = Number(entryUser.level_sort ?? 0);

    // === 2) 同組織 / 上位組織の上位者（1250000は除外） ===
    const { data: sameOrgUpperRaw } = await supabase
        .from('user_entry_united_view')
        .select('lw_userid')
        .eq('org_unit_id', orgUnitId)
        .eq('group_type', '人事労務サポートルーム')
        .lt('level_sort', levelSort)
        .neq('level_sort', 1250000)
        .not('lw_userid', 'is', null);

    const sameOrgUpperUsers: LwUserIdRow[] = (sameOrgUpperRaw ?? []) as LwUserIdRow[];

    const parentOrgIds = await getParentOrgUnits(supabase, orgUnitId);

    const { data: upperOrgUpperRaw } = await supabase
        .from('user_entry_united_view')
        .select('lw_userid')
        .eq('group_type', '人事労務サポートルーム')
        .in('org_unit_id', parentOrgIds.length ? parentOrgIds : ['dummy'])
        .lt('level_sort', levelSort)
        .neq('level_sort', 1250000)
        .not('lw_userid', 'is', null);

    const upperOrgUpperUsers: LwUserIdRow[] = (upperOrgUpperRaw ?? []) as LwUserIdRow[];

    // === 3) 固定管理者（usersから取得してユニーク化） ===
    const fixedAdmins = await fetchFixedAdmins(supabase);

    // === 4) 上司（orgs.mgr_user_id → lw_userid） ===
    let mgrLwUserId: string | null = null;
    try {
        const { data: orgRow } = await supabase
            .from('orgs')
            .select('mgr_user_id')
            .eq('orgunitid', orgUnitId)
            .maybeSingle();

        const mgrUserId = orgRow?.mgr_user_id || null;
        if (mgrUserId) {
            const { data: mgrEntry } = await supabase
                .from('user_entry_united_view')
                .select('lw_userid')
                .eq('user_id', mgrUserId)
                .eq('group_type', '人事労務サポートルーム')
                .not('lw_userid', 'is', null)
                .maybeSingle();
            mgrLwUserId = (mgrEntry?.lw_userid as string | undefined) ?? null;
        }
    } catch (e) {
        console.warn(`mgr_user_id 解決スキップ: ${e instanceof Error ? e.message : String(e)}`);
    }

    // === 5) 管理者/メンバー集合（重複排除）===
    const adminIds = new Set<string>([
        ...fixedAdmins,
        ...sameOrgUpperUsers.map((u: LwUserIdRow) => u.lw_userid),
        ...upperOrgUpperUsers.map((u: LwUserIdRow) => u.lw_userid),
        ...(mgrLwUserId ? [mgrLwUserId] : [])
    ]);

    const extraSet = new Set<string>([
        ...extraMemberIds.filter(Boolean),
        ...(mgrLwUserId ? [mgrLwUserId] : [])
    ]);

    const supportAdmins = Array.from(adminIds).map(id => ({ userId: id }));
    const supportMembers = dedupeUsers([
        { id: userId, type: 'USER' as const },
        ...Array.from(adminIds).map(id => ({ id, type: 'USER' as const })),
        ...sameOrgUpperUsers.map((u: LwUserIdRow) => ({ id: u.lw_userid, type: 'USER' as const })),
        ...upperOrgUpperUsers.map((u: LwUserIdRow) => ({ id: u.lw_userid, type: 'USER' as const })),
        ...Array.from(extraSet).map(id => ({ id, type: 'USER' as const }))
    ]);

    const supportGroup: GroupCreatePayload = {
        groupName: `${fullName}さん 人事労務サポートルーム@${localUserId}`,
        groupExternalKey: `support_${userId}`,
        administrators: supportAdmins,
        members: supportMembers
    };

    const careerAdmins = fixedAdmins.map(id => ({ userId: id }));
    const careerMembers = dedupeUsers([
        { id: userId, type: 'USER' as const },
        { id: HELPER_MANAGER_GROUP_ID, type: 'GROUP' as const },
        ...fixedAdmins.map(id => ({ id, type: 'USER' as const }))
    ]);

    const careerGroup: GroupCreatePayload = {
        groupName: `${fullName}さん 勤務キャリア・コーディネートルーム@${localUserId}`,
        groupExternalKey: `career_${userId}`,
        administrators: careerAdmins,
        members: careerMembers
    };

    console.log('[init-group] creating support group:', supportGroup);
    console.log('[init-group] creating career group:', careerGroup);

    await Promise.all([
        createOrEnsureGroup(supportGroup, accessToken),
        createOrEnsureGroup(careerGroup, accessToken)
    ]);

    // === 6) 親2グループへ orgunit を必ずぶら下げる（type: ORGUNIT）===
    try {
        // 固定の orgunit に加えて、今回の所属 orgUnit も ensure する
        const targets = new Set<string>([...GLOBAL_CHILD_ORG_UNITS, orgUnitId]);
        await Promise.all(
            Array.from(targets).map(id => ensureChildOrgInGlobalParents(id, accessToken))
        );
        // ② ユーザー本人を直接、親グループに追加（ここが“確実に入る”肝）
        await ensureUserInGlobalParents(userId, accessToken);
        console.log('[ensure-global] 完了');
    } catch (e) {
        console.warn(`[ensure-global] エラー: ${e instanceof Error ? e.message : String(e)}`);
    }

    return NextResponse.json({ success: true });
}

/** 作成 or 既存グループに admin/member を ensure */
async function createOrEnsureGroup(group: GroupCreatePayload, token: string) {
    const createRes = await fetch(`${API_BASE}/groups`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            domainId: DOMAIN_ID,
            groupName: group.groupName,
            groupExternalKey: group.groupExternalKey,
            visible: true,
            serviceManageable: true,
            useMessage: true,
            useNote: true,
            useCalendar: true,
            useTask: true,
            useFolder: true,
            administrators: group.administrators,
            members: group.members
        })
    });

    if (createRes.status === 409) {
        console.warn(`[init-group] 既存 (${group.groupName}) → admins & members ensure`);
        await ensureAdministratorsByExternalKey(group.groupExternalKey, group.administrators, token);
        await ensureMembersByExternalKey(group.groupExternalKey, group.members, token);
        return;
    }

    if (!createRes.ok) {
        const msg = await createRes.text();
        console.error(`[init-group] 作成失敗: ${group.groupName} ${msg}`);
        // 失敗時でも ensure は試す（部分的に復旧できる場合がある）
        await ensureAdministratorsByExternalKey(group.groupExternalKey, group.administrators, token);
        await ensureMembersByExternalKey(group.groupExternalKey, group.members, token);
        return;
    }

    console.log(`[init-group] 作成成功: ${group.groupName}`);
}

/** externalKey 指定でメンバーを1件ずつ ensure（POST /groups/externalKey:{key}/members） */
async function ensureMembersByExternalKey(
    externalKey: string,
    members: { id: string; type: 'USER' | 'GROUP' }[],
    token: string
) {
    for (const m of members) {
        const res = await fetch(`${API_BASE}/groups/externalKey:${externalKey}/members`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(m)
        });
        if (!res.ok) {
            const t = await res.text();
            console.error(`[init-group] メンバー追加失敗 (${externalKey} :: ${m.type}:${m.id}) ${t}`);
        } else {
            console.log(`[init-group] メンバー追加OK (${externalKey} :: ${m.type}:${m.id})`);
        }
    }
}

/** externalKey 指定で管理者を1件ずつ ensure（POST /groups/externalKey:{key}/administrators） */
async function ensureAdministratorsByExternalKey(
    externalKey: string,
    administrators: { userId: string }[],
    token: string
) {
    for (const a of administrators) {
        if (!a?.userId) continue;
        const res = await fetch(`${API_BASE}/groups/externalKey:${externalKey}/administrators`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(a)
        });
        if (!res.ok) {
            const t = await res.text();
            console.error(`[init-group] 管理者追加失敗 (${externalKey} :: ${a.userId}) ${t}`);
        } else {
            console.log(`[init-group] 管理者追加OK (${externalKey} :: ${a.userId})`);
        }
    }
}

/** org階層（親）を上へ辿る */
async function getParentOrgUnits(supabase: SupabaseClient, orgId: string): Promise<string[]> {
    const visited = new Set<string>();
    let current = orgId;
    let count = 0;

    while (current && count < ORG_RECURSION_LIMIT) {
        const { data, error } = await supabase
            .from('orgs')
            .select('parentorgunitid')
            .eq('orgunitid', current)
            .single();

        if (error || !data?.parentorgunitid) break;
        visited.add(data.parentorgunitid);
        current = data.parentorgunitid;
        count++;
    }
    return Array.from(visited);
}

/** 固定マスターの lw_userid を users から収集（ユニーク化） */
async function fetchFixedAdmins(supabase: SupabaseClient): Promise<string[]> {
    const { data, error } = await supabase
        .from('users')
        .select('user_id, lw_userid')
        .in('user_id', FIXED_GROUP_MASTERS)
        .not('lw_userid', 'is', null);

    if (error) {
        console.warn('fetchFixedAdmins error:', error.message);
        return [];
    }
    return Array.from(new Set((data || []).map(r => r.lw_userid as string)));
}

function dedupeUsers(list: { id: string; type: 'USER' | 'GROUP' }[]) {
    const seen = new Set<string>();
    const out: typeof list = [];
    for (const m of list) {
        const key = `${m.type}:${m.id}`;
        if (!m.id) continue;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(m);
    }
    return out;
}

/** ORGUNIT を親グループに ensure（POST /groups/{parentId}/members） */
async function ensureChildOrgInGlobalParents(childOrgUnitId: string, token: string) {
    for (const parentId of GLOBAL_PARENT_GROUPS) {
        const res = await fetch(`${API_BASE}/groups/${parentId}/members`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: childOrgUnitId, type: 'ORGUNIT' })
        });

        if (res.ok || res.status === 409) {
            console.log(`[ensure-global] 追加OK/既存: 親=${parentId} 子(orgunit)=${childOrgUnitId}`);
        } else {
            const t = await res.text();
            console.error(`[ensure-global] 追加失敗: 親=${parentId} 子(orgunit)=${childOrgUnitId} ${t}`);
        }
    }
}

/** USER を親グループに ensure（POST /groups/{parentId}/members） */
async function ensureUserInGlobalParents(lwUserId: string, token: string): Promise<void> {
    for (const parentId of GLOBAL_PARENT_GROUPS) {
        const res = await fetch(`${API_BASE}/groups/${parentId}/members`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: lwUserId, type: 'USER' })
        });
        if (res.ok || res.status === 409) {
            console.log(`[ensure-global-user] 追加OK/既存: 親=${parentId} 子(user)=${lwUserId}`);
        } else {
            const t = await res.text();
            console.error(`[ensure-global-user] 追加失敗: 親=${parentId} 子(user)=${lwUserId} ${t}`);
        }
    }
}