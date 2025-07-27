// ファイルパス: src/app/api/init-group/route.ts

import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';
import { FIXED_GROUP_MASTERS, HELPER_MANAGER_GROUP_ID, ORG_RECURSION_LIMIT } from '@/lib/lineworks/groupDefaults';
import { SupabaseClient } from '@supabase/supabase-js';
import { getAccessToken } from '@/lib/getAccessToken';

const DOMAIN_ID = parseInt(process.env.LINEWORKS_DOMAIN_ID || '0');
const API_BASE = 'https://www.worksapis.com/v1.0';

export async function POST(req: Request) {
  const { userId, orgUnitId, levelSort } = await req.json();
  const accessToken = await getAccessToken();

  console.log('[init-group] lwUserId (UUID):', userId, 'orgUnitId:', orgUnitId, 'levelSort:', levelSort);

  const { data: targetUser } = await supabase
    .from('user_entry_united_view')
    .select('lw_userid, first_name_kanji, last_name_kanji')
    .eq('lw_userid', userId)
    .single();

  console.log('[init-group] targetUser:', targetUser);

  const lwUserId = targetUser?.lw_userid;
  const fullName = `${targetUser?.last_name_kanji ?? ''}${targetUser?.first_name_kanji ?? ''}`;

  if (!lwUserId || !fullName) {
    console.error('[init-group] ユーザー情報取得失敗');
    return NextResponse.json({ error: 'ユーザー情報取得に失敗しました' }, { status: 400 });
  }

  const { data: sameOrgUpperUsers } = await supabase
    .from('user_entry_united_view')
    .select('lw_userid')
    .eq('org_unit_id', orgUnitId)
    .lt('level_sort', levelSort)
    .not('lw_userid', 'is', null);

  console.log('[init-group] sameOrgUpperUsers:', sameOrgUpperUsers);

  const parentOrgIds = await getParentOrgUnits(supabase, orgUnitId);
  console.log('[init-group] parentOrgIds:', parentOrgIds);

  const { data: upperOrgUpperUsers } = await supabase
    .from('user_entry_united_view')
    .select('lw_userid')
    .in('org_unit_id', parentOrgIds)
    .lt('level_sort', levelSort)
    .not('lw_userid', 'is', null);

  console.log('[init-group] upperOrgUpperUsers:', upperOrgUpperUsers);

  const fixedAdmins = await fetchFixedAdmins(supabase);
  console.log('[init-group] fixedAdmins:', fixedAdmins);

  const supportGroup: GroupCreatePayload = {
    groupName: `${fullName}さん_人事労務サポートルーム`,
    groupExternalKey: `support_${lwUserId}`,
    administrators: [
      ...fixedAdmins.map(id => ({ userId: id })),
      { userId: lwUserId },
      ...(sameOrgUpperUsers || []).map((u: { lw_userid: string }) => ({ userId: u.lw_userid })),
      ...(upperOrgUpperUsers || []).map((u: { lw_userid: string }) => ({ userId: u.lw_userid }))
    ],
    members: [
      { id: lwUserId, type: 'USER' as const },
      ...(sameOrgUpperUsers || []).map((u: { lw_userid: string }) => ({ id: u.lw_userid, type: 'USER' as const })),
      ...(upperOrgUpperUsers || []).map((u: { lw_userid: string }) => ({ id: u.lw_userid, type: 'USER' as const }))
    ]
  };

  const careerGroup: GroupCreatePayload = {
    groupName: `${fullName}さん_勤務キャリア・コーディネートルーム`,
    groupExternalKey: `career_${lwUserId}`,
    administrators: fixedAdmins.map(id => ({ userId: id })),
    members: [
      { id: lwUserId, type: 'USER' },
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
  const res = await fetch(`${API_BASE}/groups`, {
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

  if (!res.ok) {
    const error = await res.text();
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

  return (data || []).map((u: { lw_userid: string }) => u.lw_userid);
}
