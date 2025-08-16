// ファイル: src/app/api/lineworks/init-group/route.ts
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';
import { FIXED_GROUP_MASTERS, HELPER_MANAGER_GROUP_ID, ORG_RECURSION_LIMIT } from '@/lib/lineworks/groupDefaults';
import { SupabaseClient } from '@supabase/supabase-js';
import { getAccessToken } from '@/lib/getAccessToken';

const DOMAIN_ID = parseInt(process.env.LINEWORKS_DOMAIN_ID || '0', 10);
const API_BASE = 'https://www.worksapis.com/v1.0';

export async function POST(req: Request) {
    const { userId, orgUnitId, extraMemberIds = [] } = await req.json();
    const accessToken = await getAccessToken();

    console.log(`[init-group] lwUserId=${userId}, orgUnitId=${orgUnitId}`);

    // 1) 新規ユーザーの氏名など
    const { data: entryUser, error: ueErr } = await supabase
        .from('user_entry_united_view')
        .select('user_id, last_name_kanji, first_name_kanji, level_sort')
        .eq('lw_userid', userId)
        .single();
    if (ueErr || !entryUser) {
        console.error(`user_entry_united_view取得失敗: ${ueErr?.message ?? 'no row'}`);
        return NextResponse.json({ error: 'ユーザー情報取得失敗' }, { status: 400 });
    }
    const fullName = `${entryUser.last_name_kanji}${entryUser.first_name_kanji}`;
    const localUserId = entryUser.user_id;
    const levelSort = parseInt(String(entryUser.level_sort ?? '0'), 10);

    // 2) 同組織/上位組織の上位者
    const { data: sameOrgUpperUsers = [] } = await supabase
        .from('user_entry_united_view')
        .select('lw_userid')
        .eq('org_unit_id', orgUnitId)
        .lt('level_sort', levelSort)
        .not('lw_userid', 'is', null);

    const parentOrgIds = await getParentOrgUnits(supabase, orgUnitId);
    const { data: upperOrgUpperUsers = [] } = await supabase
        .from('user_entry_united_view')
        .select('lw_userid')
        .in('org_unit_id', parentOrgIds.length ? parentOrgIds : ['dummy'])
        .lt('level_sort', levelSort)
        .not('lw_userid', 'is', null);

    // 3) 固定管理者
    const fixedAdmins = await fetchFixedAdmins(supabase);

    // 4) ②-1: 上司（orgs.mgr_user_id）→ lw_userid を自動同席（extraMemberIds に無ければ追加）
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
                .from('user_entry_united_view') // lw_userid を持つビューを優先
                .select('lw_userid')
                .eq('user_id', mgrUserId)
                .eq('group_type', "人事労務サポートルーム")
                .not('lw_userid', 'is', null)
                .maybeSingle();
            mgrLwUserId = mgrEntry?.lw_userid ?? null;
        }
    } catch (e) {
        console.warn(`mgr_user_id 解決スキップ: ${e instanceof Error ? e.message : String(e)}`);
    }

    // 5) 管理者 & メンバーの最終セット（重複排除）
    const adminIds = new Set<string>([
        ...fixedAdmins,
        ...sameOrgUpperUsers.map(u => u.lw_userid),
        ...upperOrgUpperUsers.map(u => u.lw_userid)
    ]);
    const extraSet = new Set<string>([
        ...extraMemberIds.filter(Boolean),
        ...(mgrLwUserId ? [mgrLwUserId] : [])
    ]);

    const supportAdmins = Array.from(adminIds).map(id => ({ userId: id }));
    // ②-2: 管理者はメンバーにも必ず入れる
    const supportMembers = dedupeUsers([
        { id: userId, type: 'USER' as const },
        ...Array.from(adminIds).map(id => ({ id, type: 'USER' as const })),
        ...sameOrgUpperUsers.map(u => ({ id: u.lw_userid, type: 'USER' as const })),
        ...upperOrgUpperUsers.map(u => ({ id: u.lw_userid, type: 'USER' as const })),
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
        ...fixedAdmins.map(id => ({ id, type: 'USER' as const })) // 管理者もメンバーに
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

    try {
        for (const child of GLOBAL_CHILD_ORG_UNITS) {
            await ensureChildOrgInGlobalParents(child, accessToken); // ← ここで毎回ensure
        }
        console.log('[ensure-global] 完了');
    } catch (e) {
        console.warn(`[ensure-global] エラー: ${e instanceof Error ? e.message : String(e)}`);
    }

    return NextResponse.json({ success: true });
}

interface GroupCreatePayload {
    groupName: string;
    groupExternalKey: string;
    administrators: { userId: string }[];
    members: { id: string; type: 'USER' | 'GROUP' }[];
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

async function createOrEnsureGroup(group: GroupCreatePayload, token: string) {
    // まず作成
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
        // 既存 → メンバーensure
        console.warn(`[init-group] 既存 (${group.groupName}) → members ensure`);
        await ensureMembersByExternalKey(group.groupExternalKey, group.members, token);
        return;
    }

    if (!createRes.ok) {
        const msg = await createRes.text();
        console.error(`[init-group] 作成失敗: ${group.groupName} ${msg}`);
        // 失敗時でも後続でメンバーensure試行（リトライ戦略）
        await ensureMembersByExternalKey(group.groupExternalKey, group.members, token);
        return;
    }

    console.log(`[init-group] 作成成功: ${group.groupName}`);
}

async function ensureMembersByExternalKey(externalKey: string, members: { id: string; type: 'USER' | 'GROUP' }[], token: string) {
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

async function fetchFixedAdmins(supabase: SupabaseClient): Promise<string[]> {
    const { data } = await supabase
        .from('user_entry_united_view')
        .select('lw_userid')
        .in('user_id', FIXED_GROUP_MASTERS)
        .not('lw_userid', 'is', null);
    return (data || []).map(u => u.lw_userid);
}


const GLOBAL_PARENT_GROUPS = [
    'c4a97fc2-865d-440d-3e60-05043231c290', // 全ヘルパーグループ
    '8237ba83-f9ca-4c9f-3f15-052e9ea0a678'  // 全社員グループ
] as const;

// ★ここに固定で入れる（必要なら複数OK）
const GLOBAL_CHILD_ORG_UNITS = [
    '572f07a2-999d-4a48-20fd-0517ecd2d6af' // ファミーユヘルパーサービス愛知（orgunitid）
];

/**
 * orgUnitId から 子グループID を解決して、親グループへ GROUP として ensure する
 * - まずは orgUnitId をそのまま groupId として試す（既に groupId を渡せる運用なら通る）
 * - ダメなら externalKey 想定（例: unit_<orgUnitId>, org_<orgUnitId>）を順に試す
 */
async function ensureChildOrgInGlobalParents(
    childOrgUnitId: string,
    token: string
) {
    const childCandidates: Array<{ type: 'ID' | 'EXTERNAL_KEY'; value: string }> = [
        { type: 'ID', value: childOrgUnitId },
        { type: 'EXTERNAL_KEY', value: `unit_${childOrgUnitId}` },
        { type: 'EXTERNAL_KEY', value: `org_${childOrgUnitId}` },
    ];

    // 子グループIDの最終決定
    let childGroupId: string | null = null;

    // 1) まずは “ID として” 直接追加を試す（成功したら確定）
    for (const parentId of GLOBAL_PARENT_GROUPS) {
        const tryRes = await fetch(`${API_BASE}/groups/${parentId}/members`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: childOrgUnitId, type: 'GROUP' })
        });
        if (tryRes.ok || tryRes.status === 409) {
            childGroupId = childOrgUnitId;
            console.log(`[ensure-global] 直接IDで成功/既存: 親=${parentId} 子=${childOrgUnitId}`);
            // 他の親にも流用できるので break はしない（この loop は都度追加）
        } else {
            const t = await tryRes.text();
            console.warn(`[ensure-global] 直接ID 失敗: 親=${parentId} 子=${childOrgUnitId} ${t}`);
        }
    }

    // 2) 外部キー経由の解決（まだ決まってなければ）
    if (!childGroupId) {
        for (const c of childCandidates.filter(c => c.type === 'EXTERNAL_KEY')) {
            const infoRes = await fetch(`${API_BASE}/groups/externalKey:${c.value}`, {
                method: 'GET',
                headers: { Authorization: `Bearer ${token}` }
            });
            if (infoRes.ok) {
                const info = await infoRes.json();
                childGroupId = info?.groupId || info?.id || null;
                console.log(`[ensure-global] externalKey 解決: ${c.value} -> ${childGroupId}`);
                if (childGroupId) break;
            }
        }
    }

    if (!childGroupId) {
        console.error('[ensure-global] 子グループIDの解決に失敗: orgUnitId=', childOrgUnitId);
        return;
    }

    // 3) 親グループへ ensure（重複は409でOK）
    for (const parentId of GLOBAL_PARENT_GROUPS) {
        const res = await fetch(`${API_BASE}/groups/${parentId}/members`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: childGroupId, type: 'GROUP' })
        });
        if (res.ok || res.status === 409) {
            console.log(`[ensure-global] 追加OK/既存: 親=${parentId} 子=${childGroupId}`);
        } else {
            const t = await res.text();
            console.error(`[ensure-global] 追加失敗: 親=${parentId} 子=${childGroupId} ${t}`);
        }
    }
}
