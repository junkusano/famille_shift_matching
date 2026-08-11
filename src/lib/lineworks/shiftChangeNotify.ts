// src/lib/lineworks/shiftChangeNotify.ts
import { supabaseAdmin } from "@/lib/supabase/service";
import { sendLWBotMentionMessage, type MentionTarget } from "@/lib/lineworks/sendLWBotMentionMessage";
import { SignJWT, importPKCS8 } from "jose";

/**
 * 送信先（ヘルパーマネジャー固定チャンネル）
 * ※ご指定：Channel_id：99142491
 */
//const MANAGER_CHANNEL_ID = "99142491";
const MANAGER_CHANNEL_ID = "52e31296-6764-0a1e-5b37-11023360216b";

const LW_CLIENT_ID =
  process.env.LINEWORKS_CLIENT_ID ||
  process.env.WORKS_CLIENT_ID ||
  process.env.LW_CLIENT_ID ||
  "";

const LW_CLIENT_SECRET =
  process.env.LINEWORKS_CLIENT_SECRET ||
  process.env.WORKS_CLIENT_SECRET ||
  process.env.LW_CLIENT_SECRET ||
  "";

const LW_SERVICE_ACCOUNT =
  process.env.LINEWORKS_SERVICE_ACCOUNT ||
  process.env.WORKS_SERVICE_ACCOUNT ||
  process.env.LW_SERVICE_ACCOUNT ||
  "";

const LW_PRIVATE_KEY =
  (process.env.LINEWORKS_PRIVATE_KEY ||
    process.env.WORKS_PRIVATE_KEY ||
    process.env.LW_PRIVATE_KEY ||
    "").replace(/\\n/g, "\n");

const LW_SCOPE =
  process.env.LINEWORKS_SCOPE ||
  process.env.WORKS_SCOPE ||
  process.env.LW_SCOPE ||
  "bot";

const LW_BOT_NO =
  process.env.LINEWORKS_BOT_NO ||
  process.env.WORKS_BOT_NO ||
  process.env.LW_BOT_NO ||
  "";

const JST_TZ = "Asia/Tokyo";
const DAY_MS = 24 * 60 * 60 * 1000;

async function resolveActorMentionUserId(actorAuthUserId: string): Promise<string | null> {
  // actorAuthUserId = auth.users.id (uuid)
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("lw_userid")
    .eq("auth_user_id", actorAuthUserId)
    .maybeSingle();

  if (error) {
    console.warn("[shiftChangeNotify] resolveActorMentionUserId error", error);
    return null;
  }

  console.info("[shiftChangeNotify] users row =", data);

  const userId = data?.lw_userid ? String(data.lw_userid) : null;


  return userId || null;
}


function parseYMDToUtcDate(ymd: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  return new Date(Date.UTC(y, mo - 1, d));
}

function todayYmdInJst(): string {
  // サーバがUTCでも JST の「日付」だけは確実に取れる
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: JST_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(new Date())
    .reduce<Record<string, string>>((acc, p) => {
      if (p.type !== "literal") acc[p.type] = p.value;
      return acc;
    }, {});

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function shouldNotifyByDate(shiftYmd: string): boolean {
  const today = parseYMDToUtcDate(todayYmdInJst());
  const shiftDay = parseYMDToUtcDate(shiftYmd);
  if (!today || !shiftDay) return false;

  const diffDays = Math.round((shiftDay.getTime() - today.getTime()) / DAY_MS);
  return diffDays >= -1 && diffDays <= 3;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getLineWorksAccessToken(): Promise<string> {
  if (!LW_CLIENT_ID || !LW_CLIENT_SECRET || !LW_SERVICE_ACCOUNT || !LW_PRIVATE_KEY) {
    throw new Error(
      "LINE WORKS env is missing. Need CLIENT_ID / CLIENT_SECRET / SERVICE_ACCOUNT / PRIVATE_KEY."
    );
  }

  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }

  const now = Math.floor(Date.now() / 1000);
  const key = await importPKCS8(LW_PRIVATE_KEY, "RS256");
  const assertion = await new SignJWT({})
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(LW_CLIENT_ID)
    .setSubject(LW_SERVICE_ACCOUNT)
    .setIssuedAt(now)
    .setExpirationTime(now + 60 * 30)
    .sign(key);

  const form = new URLSearchParams();
  form.set("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer");
  form.set("assertion", assertion);
  form.set("client_id", LW_CLIENT_ID);
  form.set("client_secret", LW_CLIENT_SECRET);
  form.set("scope", LW_SCOPE);

  const tokenRes = await fetch("https://auth.worksmobile.com/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const tokenJson = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok) {
    throw new Error(`LINE WORKS token error: ${tokenRes.status} ${JSON.stringify(tokenJson)}`);
  }

  const accessToken = String(tokenJson.access_token ?? "");
  const expiresIn = Number(tokenJson.expires_in ?? 3600);
  if (!accessToken) {
    throw new Error(`LINE WORKS token response missing access_token: ${JSON.stringify(tokenJson)}`);
  }

  cachedToken = { token: accessToken, expiresAt: Date.now() + expiresIn * 1000 };
  return accessToken;
}

type ShiftInfo = {
  shift_id: number | string;
  kaipoke_cs_id: string;
  shift_start_date: string; // YYYY-MM-DD
  shift_start_time: string; // HH:mm:ss 等
  shift_end_time: string | null;
  staff_01_user_id: string | null;
};

export type NotifyShiftChangeArgs = {
  action: "INSERT" | "UPDATE" | "DELETE";
  requestPath: string;
  actorUserIdText: string;
  shift: ShiftInfo;
  deleteChangedCols?: {
    shift_id: number | string;
    kaipoke_cs_id: string;
    shift_start_date: string;
    shift_start_time: string;
    staff_01_user_id: string | null;
  };
};

function buildText(
  args: NotifyShiftChangeArgs,
  csName: string,
  clientChannelId: string | null,
  mentions: MentionTarget[],
  recoveryNotes: string[],
  actorMentionUserId: string | null,
  staffMentionUserId: string | null
) {
  const s = args.shift;
  const del = args.deleteChangedCols;
  const activeMentionUserIds = new Set(mentions.map((mention) => mention.userId));
  const actorMention = actorMentionUserId && activeMentionUserIds.has(actorMentionUserId);
  const staffMention = staffMentionUserId && activeMentionUserIds.has(staffMentionUserId);

  const header = "直近シフトがマネジャーによって変更されました。内容：";
  const lines: string[] = [
    header,
    `変更者：${actorMention ? `<m userId="${actorMentionUserId}">` : args.actorUserIdText ? `(${args.actorUserIdText})` : "(不明)"}`,
    `利用者：${csName}（${s.kaipoke_cs_id}）`,
    `開始：${s.shift_start_date} ${s.shift_start_time}`,
    `担当：${staffMention ? `<m userId="${staffMentionUserId}">` : s.staff_01_user_id ? `(${s.staff_01_user_id})` : "(担当者なし)"}`,
    `操作：${args.action}`,
    `画面：${args.requestPath}`,
    clientChannelId
      ? `送付先：利用者部屋(${clientChannelId}) / マネジャー(${MANAGER_CHANNEL_ID})`
      : `送付先：マネジャー(${MANAGER_CHANNEL_ID})`,
  ];

  if (args.action === "DELETE" && del) {
    lines.push("----");
    lines.push("削除時点：");
    lines.push(`開始：${del.shift_start_date} ${del.shift_start_time}`);
    lines.push(`担当：${del.staff_01_user_id ? `@${del.staff_01_user_id}` : "(担当者なし)"}`);
  }

  if (recoveryNotes.length > 0) {
    lines.push("----");
    lines.push(...recoveryNotes);
  }

  return lines.join("\n");
}

export async function notifyShiftChange(args: NotifyShiftChangeArgs): Promise<void> {

  // ★ DELETE のときは deleteChangedCols の日付を優先（削除後に shift が変な値でもOK）
  const ymd =
    args.action === "DELETE"
      ? (args.deleteChangedCols?.shift_start_date ?? args.shift.shift_start_date)
      : args.shift.shift_start_date;

  if (!shouldNotifyByDate(ymd)) {
    console.log(`[shiftChangeNotify] skip notify (out of range): action=${args.action} date=${ymd}`);
    return;
  }

  const { data: cs, error: csErr } = await supabaseAdmin
    .from("cs_kaipoke_info")
    .select("name, kaipoke_cs_id")
    .eq("kaipoke_cs_id", args.shift.kaipoke_cs_id)
    .maybeSingle();

  if (csErr) throw csErr;
  const csName = cs?.name ?? "(利用者名不明)";

  const { data: ch, error: chErr } = await supabaseAdmin
    .from("group_lw_channel_view")
    .select("channel_id")
    .eq("group_account", args.shift.kaipoke_cs_id)
    .maybeSingle();

  if (chErr) throw chErr;
  const clientChannelId: string | null = ch?.channel_id ? String(ch.channel_id) : null;

  const actorMentionUserId = args.actorUserIdText
    ? await resolveActorMentionUserId(args.actorUserIdText)
    : null;

  const staffUserId = String(args.shift.staff_01_user_id ?? "").trim();
  let staffMentionUserId: string | null = null;
  if (staffUserId) {
    const { data: staff, error: staffError } = await supabaseAdmin
      .from("user_entry_united_view_single")
      .select("lw_userid")
      .eq("user_id", staffUserId)
      .maybeSingle();
    if (staffError) {
      console.warn("[shiftChangeNotify] resolve staff mention user error", staffError);
    } else {
      staffMentionUserId = staff?.lw_userid ? String(staff.lw_userid) : null;
    }
  }

  const mentions: MentionTarget[] = [
    ...(actorMentionUserId ? [{ userId: actorMentionUserId, label: "変更者" }] : []),
    ...(staffMentionUserId ? [{ userId: staffMentionUserId, label: "担当者" }] : []),
  ];

  if (!LW_BOT_NO) throw new Error("LINEWORKS_BOT_NO is missing.");
  const accessToken = await getLineWorksAccessToken();

  if (clientChannelId) {
    await sendLWBotMentionMessage({
      botId: LW_BOT_NO,
      channelId: clientChannelId,
      accessToken,
      mentions,
      buildText: (activeMentions, recoveryNotes) =>
        buildText(
          args,
          csName,
          clientChannelId,
          activeMentions,
          recoveryNotes,
          actorMentionUserId,
          staffMentionUserId
        ),
    });
  }
  await sendLWBotMentionMessage({
    botId: LW_BOT_NO,
    channelId: MANAGER_CHANNEL_ID,
    accessToken,
    mentions,
    buildText: (activeMentions, recoveryNotes) =>
      buildText(
        args,
        csName,
        clientChannelId,
        activeMentions,
        recoveryNotes,
        actorMentionUserId,
        staffMentionUserId
      ),
  });
}
