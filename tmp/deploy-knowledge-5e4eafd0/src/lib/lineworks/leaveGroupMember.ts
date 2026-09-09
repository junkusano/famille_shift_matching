import "server-only";

import { getAccessToken } from "@/lib/getAccessToken";
import { supabaseAdmin } from "@/lib/supabase/service";

export type LeaveGroupMemberResult =
  | { success: true }
  | { success: false; status: number; error: string };

export async function leaveGroupMember(channelId: string, userId: string): Promise<LeaveGroupMemberResult> {
  const { data, error } = await supabaseAdmin
    .from("group_lw_channel_info")
    .select("group_id")
    .or(`channel_id.eq.${channelId},channel_id_secondary.eq.${channelId}`)
    .maybeSingle();

  if (error || !data?.group_id) {
    return { success: false, status: 404, error: "退出するグループを特定できませんでした。" };
  }

  const domainIdRaw = process.env.NEXT_PUBLIC_LINEWORKS_DOMAIN_ID;
  if (!domainIdRaw) {
    return { success: false, status: 500, error: "LINE WORKSのドメイン設定が不足しています。" };
  }

  const accessToken = await getAccessToken();
  const groupId = encodeURIComponent(String(data.group_id));
  const memberId = encodeURIComponent(userId);
  const domainId = encodeURIComponent(domainIdRaw);
  const response = await fetch(
    `https://www.worksapis.com/v1.0/groups/${groupId}/members/${memberId}?type=USER&domainId=${domainId}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (response.status === 204) return { success: true };

  console.error("[lineworks leave-group-member] API error", { status: response.status });
  return { success: false, status: response.status, error: "LINE WORKSで退出処理を完了できませんでした。" };
}
