import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import { getAccessToken } from "@/lib/getAccessToken";

export async function POST(req: NextRequest) {
    try {
        const {
            channelId,
            userId,
        }: {
            channelId?: string;
            userId?: string;
        } = await req.json();

        if (!channelId || !userId) {
            return NextResponse.json(
                { success: false, error: "channelId または userId が不足しています" },
                { status: 400 }
            );
        }

        const { data, error } = await supabaseAdmin
            .from("group_lw_channel_info")
            .select("group_id, channel_id, channel_id_secondary")
            .or(`channel_id.eq.${channelId},channel_id_secondary.eq.${channelId}`)
            .maybeSingle();

        if (error || !data?.group_id) {
            return NextResponse.json(
                { success: false, error: "groupId を特定できませんでした" },
                { status: 404 }
            );
        }

        const domainIdRaw = process.env.NEXT_PUBLIC_LINEWORKS_DOMAIN_ID;
        if (!domainIdRaw) {
            return NextResponse.json(
                { success: false, error: "NEXT_PUBLIC_LINEWORKS_DOMAIN_ID が未設定です" },
                { status: 500 }
            );
        }

        const accessToken = await getAccessToken();

        const groupId = encodeURIComponent(String(data.group_id));
        const memberId = encodeURIComponent(userId);
        const domainId = encodeURIComponent(domainIdRaw);

        const url =
            `https://www.worksapis.com/v1.0/groups/${groupId}/members/${memberId}` +
            `?type=USER&domainId=${domainId}`;

        const res = await fetch(url, {
            method: "DELETE",
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });

        if (res.status === 204) {
            return NextResponse.json(
                { success: true },
                { status: 200 }
            );
        }

        const raw = await res.text();

        console.error("[lineworks quit-group] API error", {
            status: res.status,
            body: raw,
        });

        return NextResponse.json(
            {
                success: false,
                error: raw || `LINE WORKS API error: ${res.status}`,
            },
            { status: res.status }
        );
    } catch (error) {
        console.error("[lineworks quit-group] unexpected error", error);
        const message = error instanceof Error ? error.message : "Internal Server Error";

        return NextResponse.json(
            { success: false, error: message },
            { status: 500 }
        );
    }
}