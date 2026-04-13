//api/webhook/route.ts
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/service";
import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/getAccessToken";
import crypto from "crypto";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// const BOT_ID = process.env.LW_BOT_ID!;
const BOT_ID = "6807751"; // ヘルパーサービス管理者

const DIALOGFLOW_PROJECT_ID = process.env.DIALOGFLOW_PROJECT_ID!;
const DIALOGFLOW_AGENT_ID = process.env.DIALOGFLOW_AGENT_ID!;
const DIALOGFLOW_LOCATION = process.env.DIALOGFLOW_LOCATION || "global";
const DIALOGFLOW_LANGUAGE_CODE = process.env.DIALOGFLOW_LANGUAGE_CODE || "ja";
const GOOGLE_ACCESS_TOKEN_URL = "https://oauth2.googleapis.com/token";

function normalizeString(v: unknown): string | null {
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    return s ? s : null;
}

function buildDialogflowSessionId(channelId: string, requesterLwUserid: string | null) {
    const raw = `${channelId}--${requesterLwUserid ?? "unknown"}`;
    return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 36);
}

function extractMentionLwUserIds(data: Record<string, unknown>): string[] {
    const ids = new Set<string>();

    const content = (data.content ?? {}) as Record<string, unknown>;
    const mentions = content.mentions;

    if (Array.isArray(mentions)) {
        for (const m of mentions) {
            const obj = m as Record<string, unknown>;
            const userId =
                normalizeString(obj.userId) ??
                normalizeString(obj.userid) ??
                normalizeString(obj.user_id) ??
                normalizeString(obj.mentionedUserId);

            if (userId) ids.add(userId);
        }
    }

    const sourceUserId = normalizeString((data.source as Record<string, unknown> | undefined)?.userId);
    if (sourceUserId) {
        ids.delete(sourceUserId);
    }

    return Array.from(ids);
}

function extractDialogflowReplyText(dfResponse: Record<string, unknown>): string | null {
    const queryResult = dfResponse.queryResult as Record<string, unknown> | undefined;
    if (!queryResult) return null;

    const responseMessages = queryResult.responseMessages;
    if (Array.isArray(responseMessages)) {
        const texts: string[] = [];

        for (const msg of responseMessages) {
            const obj = msg as Record<string, unknown>;
            const textObj = obj.text as Record<string, unknown> | undefined;
            const textArr = textObj?.text;

            if (Array.isArray(textArr)) {
                for (const t of textArr) {
                    const s = normalizeString(t);
                    if (s) texts.push(s);
                }
            }
        }

        if (texts.length > 0) {
            return texts.join("\n");
        }
    }

    const match = queryResult.match as Record<string, unknown> | undefined;
    const intentObj = match?.intent as Record<string, unknown> | undefined;
    const displayName = normalizeString(intentObj?.displayName);
    const intentName = normalizeString(intentObj?.name);

    if (displayName) {
        //return `[intent matched] ${displayName}`;
    }
    if (intentName) {
        //return `[intent matched] ${intentName}`;
    }

    return null;
}

async function getGoogleAccessToken(): Promise<string> {
    const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
    let privateKey = process.env.GOOGLE_PRIVATE_KEY;

    if (!clientEmail || !privateKey) {
        throw new Error("GOOGLE_CLIENT_EMAIL or GOOGLE_PRIVATE_KEY is missing");
    }

    privateKey = privateKey.replace(/\\n/g, "\n");

    const now = Math.floor(Date.now() / 1000);
    const header = {
        alg: "RS256",
        typ: "JWT",
    };

    const payload = {
        iss: clientEmail,
        scope: "https://www.googleapis.com/auth/cloud-platform",
        aud: GOOGLE_ACCESS_TOKEN_URL,
        exp: now + 3600,
        iat: now,
    };

    function toBase64Url(input: string) {
        return Buffer.from(input)
            .toString("base64")
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=+$/g, "");
    }

    const headerBase64 = toBase64Url(JSON.stringify(header));
    const payloadBase64 = toBase64Url(JSON.stringify(payload));
    const unsignedToken = `${headerBase64}.${payloadBase64}`;

    const crypto = await import("crypto");
    const signer = crypto.createSign("RSA-SHA256");
    signer.update(unsignedToken);
    signer.end();

    const signature = signer.sign(privateKey, "base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "");

    const jwt = `${unsignedToken}.${signature}`;

    const tokenRes = await fetch(GOOGLE_ACCESS_TOKEN_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
            grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
            assertion: jwt,
        }),
    });

    if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        throw new Error(`Failed to get Google access token: ${errText}`);
    }

    const tokenJson = (await tokenRes.json()) as { access_token?: string };
    if (!tokenJson.access_token) {
        throw new Error("Google access token missing in response");
    }

    return tokenJson.access_token;
}

async function callDialogflowDetectIntent(params: {
    text: string;
    channelId: string;
    requesterLwUserid: string | null;
    mentionLwUserids: string[];
    originalMessage: string | null;
}) {
    const accessToken = await getGoogleAccessToken();
    const sessionId = buildDialogflowSessionId(
        params.channelId,
        params.requesterLwUserid
    );

    const sessionPath =
        DIALOGFLOW_LOCATION === "global"
            ? `projects/${DIALOGFLOW_PROJECT_ID}/agent/sessions/${sessionId}`
            : `projects/${DIALOGFLOW_PROJECT_ID}/locations/${DIALOGFLOW_LOCATION}/agents/${DIALOGFLOW_AGENT_ID}/sessions/${sessionId}`;

    const apiHost =
        DIALOGFLOW_LOCATION === "global"
            ? "https://dialogflow.googleapis.com"
            : `https://${DIALOGFLOW_LOCATION}-dialogflow.googleapis.com`;

    const url = `${apiHost}/v3/${sessionPath}:detectIntent`;

    console.log("[dialogflow] location=", DIALOGFLOW_LOCATION);
    console.log("[dialogflow] url=", url);

    const reqBody = {
        queryInput: {
            text: {
                text: params.text,
            },
            languageCode: DIALOGFLOW_LANGUAGE_CODE,
        },
        queryParams: {
            parameters: {
                channel_id: params.channelId,
                requester_lw_userid: params.requesterLwUserid,
                mention_lw_userids: params.mentionLwUserids,
                original_message: params.originalMessage,
            },
        },
    };

    const res = await fetch(url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(reqBody),
    });

    const raw = await res.text();

    if (!res.ok) {
        throw new Error(`Dialogflow detectIntent failed: ${raw}`);
    }

    try {
        return JSON.parse(raw) as Record<string, unknown>;
    } catch {
        throw new Error(`Dialogflow detectIntent returned non-JSON response: ${raw}`);
    }
}

async function getGroupTypeFromChannelId(channelId: string): Promise<string | null> {
    const { data, error } = await supabaseAdmin
        .from("group_lw_channel_view")
        .select("group_type")
        .eq("channel_id", channelId)
        .maybeSingle();

    if (error) {
        console.error("[lw webhook] getGroupTypeFromChannelId error", error);
        return null;
    }

    return data?.group_type ?? null;
}

function shouldRunDialogflowForGroup(groupType: string | null): boolean {
    return groupType === "利用者様情報連携グループ";
}

async function sendLineworksMessage(params: {
    channelId: string;
    text: string;
}) {
    const accessToken = await getAccessToken();

    const url = `https://www.worksapis.com/v1.0/bots/${BOT_ID}/channels/${params.channelId}/messages`;

    const res = await fetch(url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            content: {
                type: "text",
                text: params.text,
            },
        }),
    });

    const raw = await res.text();

    if (!res.ok) {
        throw new Error(`LINE WORKS send message failed: ${raw}`);
    }

    if (!raw.trim()) {
        return { ok: true };
    }

    try {
        return JSON.parse(raw);
    } catch {
        return { ok: true, raw };
    }
}

async function upsertGroupAndChannel(params: {
    groupId: string;
    channelId: string;
}) {
    const { groupId, channelId } = params;

    if (!groupId) {
        console.warn(`[lw webhook] groupId empty, skip upsertGroupAndChannel: channelId=${channelId}`);
        return;
    }

    const { error: updateGroupError } = await supabaseAdmin
        .from("groups_lw")
        .update({ updated_at: new Date().toISOString() })
        .eq("group_id", groupId);

    if (updateGroupError) {
        console.error("[lw webhook] groups_lw update error", updateGroupError);
    }

    const { data: thisGroup, error: thisGroupError } = await supabaseAdmin
        .from("groups_lw")
        .select("group_id, group_account")
        .eq("group_id", groupId)
        .maybeSingle();

    if (thisGroupError) {
        console.error("[lw webhook] groups_lw select error", thisGroupError);
    }

    if (!thisGroup || !thisGroup.group_account) {
        await supabaseAdmin
            .from("group_lw_channel_info")
            .upsert(
                {
                    group_id: groupId,
                    channel_id: channelId,
                    fetched_at: new Date().toISOString(),
                },
                { onConflict: "channel_id" }
            );
        return;
    }

    const myAccount: string = thisGroup.group_account;

    const { data: parentGroup, error: parentGroupError } = await supabaseAdmin
        .from("groups_lw")
        .select("group_id")
        .eq("group_account_secondary", myAccount)
        .maybeSingle();

    if (parentGroupError) {
        console.error("[lw webhook] groups_lw select parent error", parentGroupError);
    }

    if (parentGroup?.group_id) {
        const parentGroupId = parentGroup.group_id;

        const { error: upsertSecondaryError } = await supabaseAdmin
            .from("group_lw_channel_info")
            .upsert(
                {
                    group_id: parentGroupId,
                    channel_id_secondary: channelId,
                    fetched_at: new Date().toISOString(),
                },
                {
                    onConflict: "channel_id_secondary",
                }
            );

        if (upsertSecondaryError) {
            console.error(
                "[lw webhook] group_lw_channel_info upsert secondary error",
                upsertSecondaryError
            );
        }

        const { error: upsertHiddenPrimaryError } = await supabaseAdmin
            .from("group_lw_channel_info")
            .upsert(
                {
                    group_id: groupId,
                    channel_id: channelId,
                    fetched_at: new Date().toISOString(),
                },
                { onConflict: "channel_id" }
            );

        if (upsertHiddenPrimaryError) {
            console.error(
                "[lw webhook] group_lw_channel_info upsert hidden primary error",
                upsertHiddenPrimaryError
            );
        }

        return;
    }

    const { error: upsertPrimaryError } = await supabaseAdmin
        .from("group_lw_channel_info")
        .upsert(
            {
                group_id: groupId,
                channel_id: channelId,
                fetched_at: new Date().toISOString(),
            },
            { onConflict: "channel_id" }
        );

    if (upsertPrimaryError) {
        console.error(
            "[lw webhook] group_lw_channel_info upsert primary error",
            upsertPrimaryError
        );
    }
}

async function fetchChannelInfo(channelId: string): Promise<{
    channelId: string;
    title: string;
    groupId: string | null;
} | null> {
    const accessToken = await getAccessToken();
    const url = `https://www.worksapis.com/v1.0/bots/${BOT_ID}/channels/${channelId}`;

    const res = await fetch(url, {
        method: "GET",
        headers: {
            Authorization: `Bearer ${accessToken}`,
        },
    });

    if (!res.ok) {
        console.error(`LINE WORKS channel fetch failed channelId=${channelId}`, await res.text());
        return null;
    }

    const json = await res.json();
    const groupId = json.channelType?.groupId ?? null;

    console.log(`channel fetched: ${channelId}, title=${json.title}, groupId=${groupId}`);

    return {
        channelId: json.channelId,
        title: json.title,
        groupId,
    };
}

async function getGroupInfoFromChannelId(channelId: string) {
    const { data, error } = await supabaseAdmin
        .from("group_lw_channel_info")
        .select("group_id, channel_id, channel_id_secondary")
        .or(`channel_id.eq.${channelId},channel_id_secondary.eq.${channelId}`)
        .maybeSingle();

    if (error || !data) {
        console.warn(`group info not found in db: ${channelId}`);
        return null;
    }

    return {
        groupId: data.group_id,
        channelId: data.channel_id,
    };
}

async function upsertGroupChannelInfo(groupId: string | null, channelId: string) {
    if (!groupId) {
        console.warn(`groupId null, skip group_lw_channel_info upsert: ${channelId}`);
        return;
    }

    const { data: existing, error: existingError } = await supabaseAdmin
        .from("group_lw_channel_info")
        .select("id")
        .or(`channel_id.eq.${channelId},channel_id_secondary.eq.${channelId}`)
        .maybeSingle();

    if (existingError) {
        console.error(`group_lw_channel_info exists check failed: ${channelId}`, existingError);
    } else if (existing?.id) {
        console.log(`already exists: ${channelId}`);
        return;
    }

    const { error: upsertError } = await supabaseAdmin
        .from("group_lw_channel_info")
        .upsert(
            {
                group_id: groupId,
                channel_id: channelId,
                fetched_at: new Date().toISOString(),
            },
            { onConflict: "channel_id" }
        );

    if (upsertError) {
        console.error(`group_lw_channel_info upsert failed: ${channelId}`, upsertError);
    } else {
        console.log(`group_lw_channel_info upsert done: ${channelId}`);
    }
}

function shouldReplyToMessage(params: {
    eventType: string | null;
    text: string | null;
    userId: string | null;
}) {
    if (params.eventType !== "message") return false;
    if (!params.text) return false;

    const trimmed = params.text.trim();
    if (!trimmed) return false;

    // Bot自身の発言なら無視したい場合はここで追加判定
    // 今は userId が取れる前提で最低限のみ
    return true;
}

export async function POST(req: NextRequest) {
    try {
        const data = (await req.json()) as Record<string, unknown>;

        const eventType = normalizeString(data?.type);
        const timestamp = normalizeString(data?.issuedTime) || new Date().toISOString();
        const source = (data?.source ?? {}) as Record<string, unknown>;
        const content = (data?.content ?? {}) as Record<string, unknown>;

        const userId = normalizeString(source?.userId);
        const channelId = normalizeString(source?.channelId);
        const domainId = normalizeString(source?.domainId);
        const message = normalizeString(content?.text);
        const fileId = normalizeString(content?.fileId);
        const members = eventType === "joined" ? (data?.members ?? null) : null;

        if (!eventType || !channelId || !domainId) {
            console.log("skip: missing required fields");
            return NextResponse.json({ status: "skipped" }, { status: 200 });
        }

        await supabase.from("msg_lw_log").insert([
            {
                event_type: eventType,
                timestamp,
                user_id: userId,
                channel_id: channelId,
                domain_id: domainId,
                message,
                file_id: fileId,
                members,
                status: 0,
            },
        ]);

        const groupInfo = await getGroupInfoFromChannelId(channelId);

        let resolvedGroupId: string | null = groupInfo?.groupId ?? null;

        if (!resolvedGroupId) {
            const apiInfo = await fetchChannelInfo(channelId);
            if (apiInfo) {
                resolvedGroupId = apiInfo.groupId;

                await supabase.from("group_lw_temp").upsert(
                    [
                        {
                            group_id: apiInfo.groupId,
                            channel_id: apiInfo.channelId,
                            fetched_at: new Date().toISOString(),
                        },
                    ],
                    { onConflict: "channel_id" }
                );

                await upsertGroupChannelInfo(apiInfo.groupId, apiInfo.channelId);

                console.log(`group_lw_channel_info upsert completed: ${apiInfo.channelId}`);
            } else {
                console.warn(`group info cannot be fetched from api: ${channelId}`);
            }
        }

        if (resolvedGroupId) {
            await upsertGroupAndChannel({
                groupId: resolvedGroupId,
                channelId,
            });
        } else {
            console.warn(`resolvedGroupId is null, skip upsertGroupAndChannel: channelId=${channelId}`);
        }

        const groupType = await getGroupTypeFromChannelId(channelId);

        console.log("[lw webhook] groupType=", groupType);


        if (
            shouldReplyToMessage({
                eventType,
                text: message,
                userId,
            }) &&
            shouldRunDialogflowForGroup(groupType)
        ) {
            try {
                const mentionLwUserids = extractMentionLwUserIds(data);

                const dfResult = await callDialogflowDetectIntent({
                    text: message!,
                    channelId,
                    requesterLwUserid: userId,
                    mentionLwUserids,
                    originalMessage: message,
                });

                const queryResult = dfResult.queryResult as Record<string, unknown> | undefined;
                const match = queryResult?.match as Record<string, unknown> | undefined;
                const intentObj = match?.intent as Record<string, unknown> | undefined;

                console.log("[dialogflow] matched intent displayName=", intentObj?.displayName ?? null);
                console.log("[dialogflow] matched intent name=", intentObj?.name ?? null);
                console.log("[dialogflow] responseMessages=", JSON.stringify(queryResult?.responseMessages ?? null));

                const replyText = extractDialogflowReplyText(dfResult);

                await supabase.from("msg_lw_log").insert([
                    {
                        event_type: "dialogflow_result",
                        timestamp: new Date().toISOString(),
                        user_id: userId,
                        channel_id: channelId,
                        domain_id: domainId,
                        message: replyText,
                        file_id: null,
                        members: null,
                        status: 0,
                    },
                ]);

                if (replyText) {
                    console.log("[lw webhook] dialogflow reply preview=", replyText);

                    await sendLineworksMessage({
                        channelId,
                        text: replyText,
                    });
                } else {
                    console.warn("[lw webhook] dialogflow reply text empty");
                }
            } catch (dialogflowError) {
                console.error("[lw webhook] dialogflow flow error", dialogflowError);

                if (
                    shouldReplyToMessage({
                        eventType,
                        text: message,
                        userId,
                    }) &&
                    shouldRunDialogflowForGroup(groupType)
                ) {
                    // ...
                } else {
                    console.log("[lw webhook] skip dialogflow", {
                        eventType,
                        channelId,
                        groupType,
                        hasMessage: !!message,
                    });
                }
            }
        }

        return NextResponse.json({ status: "ok" }, { status: 200 });
    } catch (err) {
        console.error("unexpected error:", err);
        return NextResponse.json({ error: "unexpected error" }, { status: 500 });
    }
}