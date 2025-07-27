// ファイルパス: src/app/api/init-group/route.ts

import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';
import { FIXED_GROUP_MASTERS, HELPER_MANAGER_GROUP_ID, ORG_RECURSION_LIMIT } from '@/lib/lineworks/groupDefaults';

const DOMAIN_ID = parseInt(process.env.LINEWORKS_DOMAIN_ID || '0');
const API_BASE = 'https://www.worksapis.com/v1.0';

async function getAccessToken(): Promise<string> {
  const res = await fetch('/api/lineworks/token');
  const data = await res.json();
  return data.token;
}

export async function POST(req: Request) {
  const { userId, orgUnitId, levelSort } = await req.json();
  const accessToken = await getAccessToken();

  // 対象ユーザー情報（lw_userid, 氏名）取得
  const { data: targetUser } = await supabase
    .from('user_entry_united_view')
    .select('lw_userid, first_name_kanji, last_name_kanji')
    .eq('user_id', userId)
    .single();

  const lwUserId = targetUser?.lw_userid;
  const fullName = `${targetUser?.last_name_kanji ?? ''}${targetUser?.first_name_kanji ?? ''}`;

  if (!lwUserId || !fullName) {
    return NextResponse.json({ error: 'ユーザー情報取得に失敗しました' }, { status: 400 });
  }

  // 上位ユーザー取得（同一組織）
  const { data: sameOrgUpperUsers } = await supabase
    .from('user_entry_united_view')
    .select('lw_userid')
    .eq('org_unit_id', orgUnitId)
    .lt('level_sort', levelSort)
    .not('lw_userid', 'is', null);

  // 上位組織
  const parentOrgIds = await getParentOrgUnits(orgUnitId);
  const { data: upperOrgUpperUsers } = await supabase
    .from('user_entry_united_view')
    .select('lw_userid')
    .in('org_unit_id', parentOrgIds)
    .lt('level_sort', levelSort)
    .not('lw_userid', 'is', null);

  const fixedAdmins = await fetchFixedAdmins();

  const supportGroup = {
    groupName: `${fullName}さん_人事労務サポートルーム`,
    groupExternalKey: `support_${userId}`,
    administrators: [
      ...fixedAdmins.map(id => ({ userId: id })),
      { userId: lwUserId },
      ...sameOrgUpperUsers.map(u => ({ userId: u.lw_userid })),
      ...upperOrgUpperUsers.map(u => ({ userId: u.lw_userid }))
    ],
    members: [
      { id: lwUserId, type: 'USER' },
      ...sameOrgUpperUsers.map(u => ({ id: u.lw_userid, type: 'USER' })),
      ...upperOrgUpperUsers.map(u => ({ id: u.lw_userid, type: 'USER' }))
    ]
  };

  const careerGroup = {
    groupName: `${fullName}さん_勤務キャリア・コーディネートルーム`,
    groupExternalKey: `career_${userId}`,
    administrators: fixedAdmins.map(id => ({ userId: id })),
    members: [
      { id: lwUserId, type: 'USER' },
      { id: HELPER_MANAGER_GROUP_ID, type: 'GROUP' }
    ]
  };

  await Promise.all([
    createGroup(supportGroup, accessToken),
    createGroup(careerGroup, accessToken)
  ]);

  return NextResponse.json({ success: true });
}

async function createGroup(group: any, token: string) {
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
    console.error('グループ作成失敗:', group.groupName, error);
  }
}

async function getParentOrgUnits(orgId: string): Promise<string[]> {
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

async function fetchFixedAdmins(): Promise<string[]> {
  const { data } = await supabase
    .from('user_entry_united_view')
    .select('lw_userid')
    .in('user_id', FIXED_GROUP_MASTERS)
    .not('lw_userid', 'is', null);

  return (data || []).map(u => u.lw_userid);
}
