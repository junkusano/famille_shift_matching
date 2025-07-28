// ファイルパス: src/app/api/init-group/route.ts

import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';
import { FIXED_GROUP_MASTERS, HELPER_MANAGER_GROUP_ID, ORG_RECURSION_LIMIT } from '@/lib/lineworks/groupDefaults';
import { SupabaseClient } from '@supabase/supabase-js';
import { getAccessToken } from '@/lib/getAccessToken';

const DOMAIN_ID = parseInt(process.env.LINEWORKS_DOMAIN_ID || '0');
const API_BASE = 'https://www.worksapis.com/v1.0';

export async function POST(req: Request) {
    const { userId, orgUnitId } = await req.json();
    const accessToken = await getAccessToken();

    console.log('[init-group] lwUserId (UUID):', userId, 'orgUnitId:', orgUnitId);

    const { data: entryUser } = await supabase
        .from('user_entry_united_view')
        .select('user_id, last_name_kanji, first_name_kanji, level_sort')
        .eq('lw_userid', userId)
        .single();

    if (!entryUser) {
        console.error('[init-group] user_entry_united_view からの情報取得失敗');
        return NextResponse.json({ error: 'ユーザー情報取得失敗' }, { status: 400 });
    }

    const fullName = `${entryUser.last_name_kanji}${entryUser.first_name_kanji}`;
    const localUserId = entryUser.user_id;
    const levelSort = entryUser.level_sort;

    const { data: sameOrgUpperUsers } = await supabase
        .from('user_entry_united_view')
        .select('lw_userid')
        .eq('org_unit_id', orgUnitId)
        .lt('level_sort', levelSort)
        .not('lw_userid', 'is', null);

    const parentOrgIds = await getParentOrgUnits(supabase, orgUnitId);
    const { data: upperOrgUpperUsers } = await supabase
        .from('user_entry_united_view')
        .select('lw_userid')
        .in('org_unit_id', parentOrgIds)
        .lt('level_sort', levelSort)
        .not('lw_userid', 'is', null);

    const fixedAdmins = await fetchFixedAdmins(supabase);

    const supportGroup: GroupCreatePayload = {
        groupName: `${fullName}さん 人事労務サポートルーム@${localUserId}`,
        groupExternalKey: `support_${userId}`,
        administrators: [
            ...fixedAdmins.map(id => ({ userId: id })),
            ...(sameOrgUpperUsers || []).map(u => ({ userId: u.lw_userid })),
            ...(upperOrgUpperUsers || []).map(u => ({ userId: u.lw_userid }))
        ],
        members: [
            { id: userId, type: 'USER' as const },
            ...(sameOrgUpperUsers || []).map(u => ({ id: u.lw_userid, type: 'USER' as const })),
            ...(upperOrgUpperUsers || []).map(u => ({ id: u.lw_userid, type: 'USER' as const }))
        ]
    };

    const careerGroup: GroupCreatePayload = {
        groupName: `${fullName}さん 勤務キャリア・コーディネートルーム@${localUserId}`,
        groupExternalKey: `career_${userId}`,
        administrators: fixedAdmins.map(id => ({ userId: id })),
        members: [
            { id: userId, type: 'USER' },
            { id: HELPER_MANAGER_GROUP_ID, type: 'GROUP' }
        ]
    };

    console.log('[init-group] creating support group:', supportGroup);
    console.log('[init-group] creating career group:', careerGroup);

    await Promise.all([
        createGroup(supportGroup, accessToken),
        createGroup(careerGroup, accessToken)
    ]);

    return NextResponse.json({ success: true });
}

interface GroupCreatePayload {
    groupName: string;
    groupExternalKey: string;
    administrators: { userId: string }[];
    members: { id: string; type: 'USER' | 'GROUP' }[];
}

async function createGroup(group: GroupCreatePayload, token: string) {
    const createRes = await fetch(`${API_BASE}/groups`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
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
        console.warn(`[init-group] グループ作成済 (${group.groupName})、メンバー追加に切り替え`);
        for (const member of group.members) {
            const addRes = await fetch(`${API_BASE}/groups/externalKey:${group.groupExternalKey}/members`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(member)
            });
            if (!addRes.ok) {
                const msg = await addRes.text();
                console.error(`[init-group] メンバー追加失敗 (${member.id}):`, msg);
            } else {
                console.log(`[init-group] メンバー追加成功 (${member.id})`);
            }
        }
    } else if (!createRes.ok) {
        const error = await createRes.text();
        console.error('[init-group] グループ作成失敗:', group.groupName, error);
    } else {
        console.log('[init-group] グループ作成成功:', group.groupName);
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
