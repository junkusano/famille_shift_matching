import { supabaseAdmin } from "@/lib/supabase/service";

export type MentionTarget = {
  /** LINE WORKS の userId */
  userId: string;
  /** 追加失敗時に通知本文へ表示する識別名 */
  label: string;
};

/**
 * 既存のメンションタグ入り本文を、新しい送信処理の再送結果に合わせて整形する。
 * グループへ追加できなかった対象は @ラベル の通常文字列に戻し、理由を末尾へ付ける。
 */
export function buildRecoveredMentionText(
  text: string,
  requestedMentions: MentionTarget[],
  activeMentions: MentionTarget[],
  recoveryNotes: string[]
): string {
  const activeUserIds = new Set(activeMentions.map((mention) => mention.userId.trim()));
  let recoveredText = text;

  for (const mention of requestedMentions) {
    const userId = mention.userId.trim();
    if (!userId || activeUserIds.has(userId)) continue;
    recoveredText = recoveredText.replaceAll(`<m userId="${userId}">`, `@${mention.label}`);
  }

  if (recoveryNotes.length === 0) return recoveredText;
  return `${recoveredText}\n\n----\n${recoveryNotes.join("\n")}`;
}

type SendLWBotMentionMessageArgs = {
  botId: string;
  channelId: string;
  accessToken: string;
  mentions: MentionTarget[];
  /**
   * activeMentions には、その時点でメンション可能なユーザーだけが入る。
   * recoveryNotes はグループ追加に失敗した理由で、再送時の本文に含める。
   */
  buildText: (activeMentions: MentionTarget[], recoveryNotes: string[]) => string;
};

function dedupeMentions(mentions: MentionTarget[]): MentionTarget[] {
  const seen = new Set<string>();
  return mentions.filter((mention) => {
    const userId = mention.userId.trim();
    if (!userId || seen.has(userId)) return false;
    seen.add(userId);
    return true;
  });
}

async function sendMessage(params: {
  botId: string;
  channelId: string;
  text: string;
  accessToken: string;
}): Promise<void> {
  const response = await fetch(
    `https://www.worksapis.com/v1.0/bots/${encodeURIComponent(params.botId)}/channels/${encodeURIComponent(params.channelId)}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content: { type: "text", text: params.text } }),
    }
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`LINE WORKS message send failed: ${response.status} ${detail}`);
  }
}

async function resolveGroupId(channelId: string): Promise<string> {
  const { data: channelInfo, error: channelInfoError } = await supabaseAdmin
    .from("group_lw_channel_info")
    .select("group_id")
    .or(`channel_id.eq.${channelId},channel_id_secondary.eq.${channelId}`)
    .maybeSingle();

  if (channelInfoError) {
    throw new Error(`グループ情報の取得に失敗しました: ${channelInfoError.message}`);
  }

  const groupId = String(channelInfo?.group_id ?? "").trim();
  if (groupId) return groupId;

  const { data: channelView, error: channelViewError } = await supabaseAdmin
    .from("group_lw_channel_view")
    .select("group_id")
    .eq("channel_id", channelId)
    .maybeSingle();

  if (channelViewError) {
    throw new Error(`グループ情報の取得に失敗しました: ${channelViewError.message}`);
  }

  const fallbackGroupId = String(channelView?.group_id ?? "").trim();
  if (!fallbackGroupId) {
    throw new Error(`channel_id=${channelId} に対応するグループIDが見つかりません`);
  }
  return fallbackGroupId;
}

async function addUserToGroup(params: {
  groupId: string;
  userId: string;
  accessToken: string;
}): Promise<void> {
  const response = await fetch(
    `https://www.worksapis.com/v1.0/groups/${encodeURIComponent(params.groupId)}/members`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id: params.userId, type: "USER" }),
    }
  );

  if (response.ok) return;

  const detail = await response.text().catch(() => "");
  // 同時実行などで既に追加済みになった場合は、メンション可能として再送する。
  if (detail.includes("Group member already exist")) return;

  throw new Error(`${response.status} ${detail}`.trim());
}

/**
 * メンション付き送信の共通処理。
 *
 * まず通常送信を試し、失敗時だけ、メンション対象を送付先グループへ追加して再送する。
 * 追加できないユーザーは再送本文に理由を記載し、該当ユーザーのメンションだけ外す。
 */
export async function sendLWBotMentionMessage(
  args: SendLWBotMentionMessageArgs
): Promise<void> {
  const mentions = dedupeMentions(args.mentions);
  const accessToken = args.accessToken;

  try {
    await sendMessage({
      botId: args.botId,
      channelId: args.channelId,
      text: args.buildText(mentions, []),
      accessToken,
    });
    return;
  } catch (initialError) {
    if (mentions.length === 0) throw initialError;
    console.warn("[sendLWBotMentionMessage] initial send failed; attempting group-member recovery", {
      channelId: args.channelId,
      error: initialError instanceof Error ? initialError.message : String(initialError),
    });
  }

  let groupId: string | null = null;
  let groupResolveError: string | null = null;
  try {
    groupId = await resolveGroupId(args.channelId);
  } catch (error) {
    groupResolveError = error instanceof Error ? error.message : String(error);
  }

  const activeMentions: MentionTarget[] = [];
  const recoveryNotes: string[] = [];
  for (const mention of mentions) {
    try {
      if (!groupId) throw new Error(groupResolveError ?? "グループIDを取得できませんでした");
      await addUserToGroup({ groupId, userId: mention.userId, accessToken });
      activeMentions.push(mention);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      recoveryNotes.push(
        `【メンション未達】${mention.label}（LINE WORKS ID: ${mention.userId}）をグループに追加できませんでした: ${detail}`
      );
    }
  }

  await sendMessage({
    botId: args.botId,
    channelId: args.channelId,
    text: args.buildText(activeMentions, recoveryNotes),
    accessToken,
  });
}
