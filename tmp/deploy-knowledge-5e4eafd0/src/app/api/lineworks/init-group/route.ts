// ファイル: src/app/api/lineworks/init-group/route.ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
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
    entry_id?: string | null;
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
    const body = await req.json();

    const {
        userId,
        orgUnitId,
        extraMemberIds = [],
        applicantName,
        fullName: bodyFullName,
        name,
    } = body;
    const accessToken = await getAccessToken();

    console.log(`[init-group] lwUserId=${userId}, orgUnitId=${orgUnitId}`);

    // === 1) 対象ユーザー情報（ビュー重複に強い取得） ===
    const { data: entryRowsRaw, error: ueErr } = await supabaseAdmin
        .from('users')
        .select('*')
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

    const localUserId = entryUser.user_id;

    let dbFullName = "";

    if (entryUser.entry_id) {
        const { data: entryData } = await supabaseAdmin
            .from("form_entries")
            .select("last_name_kanji, first_name_kanji")
            .eq("id", entryUser.entry_id)
            .maybeSingle();

        dbFullName = `${entryData?.last_name_kanji ?? ""}${entryData?.first_name_kanji ?? ""}`;
    }

    const fullName =
        String(bodyFullName || "").trim() ||
        String(applicantName || "").trim() ||
        String(name || "").trim() ||
        dbFullName ||
        localUserId;

    const levelSort = Number(entryUser.level_sort ?? 0);

    // === 2) 同組織 / 上位組織の上位者（1250000は除外） ===
    const { data: sameOrgUpperRaw } = await supabaseAdmin
        .from('user_entry_united_view')
        .select('lw_userid')
        .eq('org_unit_id', orgUnitId)
        .eq('group_type', '人事労務サポートルーム')
        .lt('level_sort', levelSort)
        .neq('level_sort', 1250000)
        .not('lw_userid', 'is', null);

    const sameOrgUpperUsers: LwUserIdRow[] = (sameOrgUpperRaw ?? []) as LwUserIdRow[];

    const parentOrgIds = await getParentOrgUnits(supabaseAdmin, orgUnitId);

    const { data: upperOrgUpperRaw } = await supabaseAdmin
        .from('user_entry_united_view')
        .select('lw_userid')
        .eq('group_type', '人事労務サポートルーム')
        .in('org_unit_id', parentOrgIds.length ? parentOrgIds : ['dummy'])
        .lt('level_sort', levelSort)
        .neq('level_sort', 1250000)
        .not('lw_userid', 'is', null);

    const upperOrgUpperUsers: LwUserIdRow[] = (upperOrgUpperRaw ?? []) as LwUserIdRow[];

    // === 3) 固定管理者（usersから取得してユニーク化） ===
    const fixedAdmins = await fetchFixedAdmins(supabaseAdmin);

    // === 3-1) サービスサポートのLINE WORKSユーザーID取得 ===
    const { data: serviceSupportUser, error: serviceSupportError } = await supabaseAdmin
        .from("user_entry_united_view_single")
        .select("user_id, lw_userid")
        .eq("user_id", "servicesuport")
        .not("lw_userid", "is", null)
        .maybeSingle();

    if (serviceSupportError) {
        console.warn(
            "[init-group] サービスサポートのlw_userid取得失敗:",
            serviceSupportError.message
        );
    }

    const serviceSupportLwUserId =
        typeof serviceSupportUser?.lw_userid === "string"
            ? serviceSupportUser.lw_userid.trim()
            : null;

    console.log("[init-group] service support resolved", {
        user_id: serviceSupportUser?.user_id ?? null,
        lw_userid: serviceSupportLwUserId,
    });

    // === 4) 上司（orgs.mgr_user_id → lw_userid） ===
    let mgrLwUserId: string | null = null;
    try {
        const { data: orgRow } = await supabaseAdmin
            .from('orgs')
            .select('mgr_user_id')
            .eq('orgunitid', orgUnitId)
            .maybeSingle();

        const mgrUserId = orgRow?.mgr_user_id || null;
        if (mgrUserId) {
            const { data: mgrEntry } = await supabaseAdmin
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

        ...(serviceSupportLwUserId
            ? [{ id: serviceSupportLwUserId, type: 'USER' as const }]
            : []),

        ...Array.from(adminIds).map(id => ({ id, type: 'USER' as const })),
        ...sameOrgUpperUsers.map((u: LwUserIdRow) => ({
            id: u.lw_userid,
            type: 'USER' as const
        })),
        ...upperOrgUpperUsers.map((u: LwUserIdRow) => ({
            id: u.lw_userid,
            type: 'USER' as const
        })),
        ...Array.from(extraSet).map(id => ({
            id,
            type: 'USER' as const
        }))
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

    // 再応募では過去のグループIDを最優先する。外部キーは過去実装で
    // 変わっている可能性があるため、groups_lw に同期済みの実IDで直接追加する。
    const { data: priorGroups, error: priorGroupsError } = await supabaseAdmin
        .from('groups_lw')
        .select('group_id,group_name')
        .eq('group_account', localUserId)
        .or('is_active.is.true,is_active.is.null');
    if (priorGroupsError) {
        console.warn('[init-group] 過去個人グループの検索失敗:', priorGroupsError.message);
    }
    const supportExistingGroupId = (priorGroups ?? []).find((g) => (g.group_name ?? '').includes('人事労務サポートルーム'))?.group_id;
    const careerExistingGroupId = (priorGroups ?? []).find((g) => (g.group_name ?? '').includes('勤務キャリア'))?.group_id;

    const groupResults = await Promise.all([
        createOrEnsureGroup(supportGroup, accessToken, supportExistingGroupId),
        createOrEnsureGroup(careerGroup, accessToken, careerExistingGroupId)
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

    return NextResponse.json({ success: true, groups: groupResults });
}

/** 作成 or 既存グループに admin/member を ensure */
async function createOrEnsureGroup(group: GroupCreatePayload, token: string, knownGroupId?: string) {
    if (knownGroupId) {
        await ensureAdministratorsByGroupId(knownGroupId, group.administrators, token);
        await ensureMembersByGroupId(knownGroupId, group.members, token);
        return { externalKey: group.groupExternalKey, groupId: knownGroupId, reused: true };
    }
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
        const existingGroupId = await getGroupIdByExternalKey(group.groupExternalKey, token);
        if (!existingGroupId) throw new Error(`既存個人グループを特定できません: ${group.groupExternalKey}`);
        await ensureAdministratorsByGroupId(existingGroupId, group.administrators, token);
        await ensureMembersByGroupId(existingGroupId, group.members, token);
        return { externalKey: group.groupExternalKey, groupId: existingGroupId, reused: true };
    }

    if (!createRes.ok) {
        const msg = await createRes.text();
        console.error(`[init-group] 作成失敗: ${group.groupName} ${msg}`);
        throw new Error(`個人グループ作成に失敗しました (${group.groupExternalKey}): ${msg}`);
    }

    const created = await createRes.json().catch(() => ({}));
    const groupId = typeof created.groupId === 'string' ? created.groupId : await getGroupIdByExternalKey(group.groupExternalKey, token);
    if (!groupId) throw new Error(`作成した個人グループIDを取得できません: ${group.groupExternalKey}`);
    // 作成APIがメンバーを受け付けた場合でも、再実行して存在を保証する。
    await ensureAdministratorsByGroupId(groupId, group.administrators, token);
    await ensureMembersByGroupId(groupId, group.members, token);
    console.log(`[init-group] 作成成功: ${group.groupName}`);
    return { externalKey: group.groupExternalKey, groupId, reused: false };
}

async function getGroupIdByExternalKey(externalKey: string, token: string): Promise<string | null> {
    const res = await fetch(`${API_BASE}/groups/externalKey:${encodeURIComponent(externalKey)}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => ({}));
    return typeof data.groupId === 'string' ? data.groupId : null;
}

/** group ID 指定でメンバーを確実に追加。409 は既に参加済みとして成功。 */
async function ensureMembersByGroupId(
    groupId: string,
    members: { id: string; type: 'USER' | 'GROUP' }[],
    token: string
) {
    for (const m of members) {
        const res = await fetch(`${API_BASE}/groups/${encodeURIComponent(groupId)}/members`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(m)
        });
        if (!res.ok && res.status !== 409) {
            const t = await res.text();
            throw new Error(`個人グループへの追加に失敗しました (${groupId} :: ${m.type}:${m.id}): ${t}`);
        } else {
            console.log(`[init-group] メンバー追加OK/既存 (${groupId} :: ${m.type}:${m.id})`);
        }
    }
}

async function ensureAdministratorsByGroupId(
    groupId: string,
    administrators: { userId: string }[],
    token: string
) {
    for (const a of administrators) {
        if (!a?.userId) continue;
        const res = await fetch(`${API_BASE}/groups/${encodeURIComponent(groupId)}/administrators`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(a)
        });
        if (!res.ok && res.status !== 409) {
            const t = await res.text();
            throw new Error(`個人グループ管理者の設定に失敗しました (${groupId} :: ${a.userId}): ${t}`);
        } else {
            console.log(`[init-group] 管理者追加OK/既存 (${groupId} :: ${a.userId})`);
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
