"use client";

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Props = {
    kaipoke_cs_id: string;
    month: string;
};

export default function JissekiPrintBody({ kaipoke_cs_id, month }: Props) {
    const [html, setHtml] = useState<string>("");
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const run = async () => {
            try {
                setLoading(true);
                setError(null);

                // 単票と同じく access_token を付与
                const { data: sessionData } = await supabase.auth.getSession();
                const accessToken = sessionData.session?.access_token;

                const res = await fetch("/api/jisseki/print", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
                    },
                    credentials: "same-origin",
                    body: JSON.stringify({
                        kaipoke_cs_id,
                        month,
                    }),
                });

                if (!res.ok) {
                    throw new Error(`failed: ${res.status}`);
                }

                // /api/jisseki/print が HTML を返している想定
                const text = await res.text();
                setHtml(text);
            } catch (e: any) {
                setError(e?.message ?? "failed");
            } finally {
                setLoading(false);
            }
        };

        if (kaipoke_cs_id && month) run();
    }, [kaipoke_cs_id, month]);

    if (loading) return <div>読み込み中...</div>;
    if (error) return <div style={{ color: "red" }}>表示に失敗しました: {error}</div>;

    // 返却がHTML想定。もしJSONで返している場合はここを「既存単票の描画JSX」に差し替え。
    return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
