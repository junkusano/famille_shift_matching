// src/app/portal/jisseki/print/bulk/page.tsx
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import JissekiPrintBody, { type PrintPayload } from "@/components/jisseki/JissekiPrintBody";

type BulkItem = { kaipoke_cs_id: string; month: string };

export default function BulkPrintPage() {
    const [datas, setDatas] = useState<PrintPayload[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const run = async () => {
            try {
                setLoading(true);
                setError(null);

                const payload = localStorage.getItem("jisseki_bulk_print");
                if (!payload) {
                    setError("印刷対象がありません。（localStorage: jisseki_bulk_print が空です）");
                    return;
                }

                const parsed: unknown = JSON.parse(payload);

                // unknown → Record 判定
                const isRecord = (v: unknown): v is Record<string, unknown> =>
                    v !== null && typeof v === "object";

                // obj から string を拾う（複数キー対応）
                const pickString = (obj: Record<string, unknown>, keys: string[]): string | null => {
                    for (const k of keys) {
                        const val = obj[k];
                        if (typeof val === "string" && val.trim() !== "") return val;
                        if (typeof val === "number" && Number.isFinite(val)) return String(val);
                    }
                    return null;
                };

                // ★配列でも {items: []} でも単体でも受ける（raw は unknown[]）
                const list: unknown[] = Array.isArray(parsed)
                    ? parsed
                    : isRecord(parsed) && Array.isArray(parsed.items)
                        ? (parsed.items as unknown[])
                        : [parsed];

                // ★ここでだけ BulkItem に正規化する
                const normalized: BulkItem[] = list
                    .map((x) => {
                        if (!isRecord(x)) return null;

                        const kaipoke_cs_id = pickString(x, ["kaipoke_cs_id", "kaipokeCsId", "client_id"]);
                        const month = pickString(x, ["month", "yearMonth", "year_month"]);

                        if (!kaipoke_cs_id || !month) return null;

                        return { kaipoke_cs_id, month };
                    })
                    .filter((v): v is BulkItem => v !== null);

                if (normalized.length === 0) {
                    setError("印刷対象の形式が不正です。（kaipoke_cs_id / month が取れません）");
                    return;
                }

                if (normalized.length === 0) {
                    setError("印刷対象の形式が不正です。（kaipoke_cs_id / month が取れません）");
                    return;
                }

                const { data: sessionData } = await supabase.auth.getSession();
                const accessToken = sessionData.session?.access_token;

                // ★全件 fetch（順番に）
                const results: PrintPayload[] = [];
                for (const it of normalized) {
                    const res = await fetch(
                        `/api/jisseki/print?kaipoke_cs_id=${encodeURIComponent(it.kaipoke_cs_id)}&month=${encodeURIComponent(it.month)}`,
                        {
                            headers: {
                                ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
                            },
                        }
                    );

                    if (!res.ok) {
                        const txt = await res.text().catch(() => "");
                        throw new Error(
                            `APIエラー: ${res.status} ${res.statusText} / kaipoke_cs_id=${it.kaipoke_cs_id} month=${it.month}\n${txt}`
                        );
                    }

                    results.push((await res.json()) as PrintPayload);
                }

                setDatas(results);
            } catch (e: unknown) {
                if (e instanceof Error) {
                    setError(e.message);
                } else {
                    setError(String(e));
                }
            }
            finally {
                setLoading(false);
            }
        };

        run();
    }, []);

    if (loading) return <div>読み込み中...</div>;

    if (error) {
        return (
            <div style={{ whiteSpace: "pre-wrap", color: "red" }}>
                {error}
            </div>
        );
    }

    // ★全件をページ区切りで描画
    return (
        <div>
            {datas.map((d, idx) => (
                <div key={`${d.client.kaipoke_cs_id}-${d.month}-${idx}`} className={idx === 0 ? "" : "page-break"}>
                    <JissekiPrintBody data={d} />
                </div>
            ))}
        </div>
    );
}
