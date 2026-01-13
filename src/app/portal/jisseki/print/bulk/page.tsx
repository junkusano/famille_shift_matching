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
                    v !== null && typeof v === "object" && !Array.isArray(v);

                // ★配列でも {items: []} でも単体でも受ける（raw は unknown[]）
                const pickArrayFromRecord = (obj: Record<string, unknown>): unknown[] | null => {
                    const keys = ["items", "targets", "selected", "rows", "data", "list", "payload"];
                    for (const k of keys) {
                        const v = obj[k];
                        if (Array.isArray(v)) return v;
                    }
                    return null;
                };

                const list: unknown[] = Array.isArray(parsed)
                    ? parsed
                    : isRecord(parsed)
                        ? (pickArrayFromRecord(parsed) ?? [parsed])
                        : [parsed];

                // ---------- deep 検索 ----------
                const pickDeep = (v: unknown, keys: string[], maxDepth = 6): string | null => {
                    const seen = new Set<unknown>();

                    const walk = (cur: unknown, depth: number): string | null => {
                        if (cur === null || cur === undefined) return null;
                        if (typeof cur !== "object") return null;
                        if (seen.has(cur)) return null;
                        seen.add(cur);

                        if (depth > maxDepth) return null;

                        // Array のとき要素を走査（先）
                        if (Array.isArray(cur)) {
                            for (const child of cur) {
                                const got = walk(child, depth + 1);
                                if (got) return got;
                            }
                            return null;
                        }

                        // Record のときキー一致を探す
                        if (isRecord(cur)) {
                            for (const k of keys) {
                                const val = cur[k];
                                if (typeof val === "string" && val.trim() !== "") return val.trim();
                                if (typeof val === "number" && Number.isFinite(val)) return String(val);
                            }
                            for (const child of Object.values(cur)) {
                                const got = walk(child, depth + 1);
                                if (got) return got;
                            }
                            return null;
                        }

                        return null;
                    };

                    return walk(v, 0);
                };

                // ---------- 追加：month を YYYY-MM に正規化 ----------
                const normalizeMonth = (raw: string | null): string | null => {
                    if (!raw) return null;
                    const s = raw.trim();

                    // 1) "YYYY-MM" / "YYYY/MM" / "YYYY.MM"
                    const m1 = s.match(/^(\d{4})[-\/.](\d{1,2})$/);
                    if (m1) {
                        const y = m1[1];
                        const mm = String(Number(m1[2])).padStart(2, "0");
                        return `${y}-${mm}`;
                    }

                    // 2) "YYYY-MM-DD" / "YYYY/MM/DD" / "YYYY-MM-01" など → YYYY-MM
                    const m2 = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/);
                    if (m2) {
                        const y = m2[1];
                        const mm = String(Number(m2[2])).padStart(2, "0");
                        return `${y}-${mm}`;
                    }

                    // 3) ISO日時 "YYYY-MM-DDTHH:MM:SS..." → YYYY-MM
                    const mIso = s.match(/^(\d{4})-(\d{2})-\d{2}T/);
                    if (mIso) return `${mIso[1]}-${mIso[2]}`;

                    // 4) "YYYYMM" 例: 202512
                    const m3 = s.match(/^(\d{4})(\d{2})$/);
                    if (m3) return `${m3[1]}-${m3[2]}`;

                    return null;
                };

                // ---------- 追加：year + month の分離形式にも対応 ----------
                const pickYearMonthParts = (v: unknown): string | null => {
                    // 年・月が別キーで入っているケース（ネスト含む）
                    const y = pickDeep(v, ["year", "yyyy", "targetYear"], 6);
                    const m = pickDeep(v, ["month", "mm", "targetMonth"], 6);
                    if (!y || !m) return null;

                    const yy = String(Number(y)).padStart(4, "0");
                    const mm = String(Number(m)).padStart(2, "0");
                    if (!/^\d{4}$/.test(yy) || !/^\d{2}$/.test(mm)) return null;

                    return `${yy}-${mm}`;
                };

                // ★ここでだけ BulkItem に正規化する（ネストも探索）
                const normalized: BulkItem[] = list
                    .map((x) => {
                        // kaipoke_cs_id はネストも含めて探索
                        const kaipoke_cs_id = pickDeep(
                            x,
                            [
                                "kaipoke_cs_id",
                                "kaipoke_csId",
                                "kaipokeCsId",
                                "kaipokeCsID",
                                "client_id",
                                "clientId",
                                "kaipokeId",
                                "cs_id",
                                "csId",
                            ],
                            6
                        );

                        const monthRaw = pickDeep(
                            x,
                            [
                                "month",
                                "yearMonth",
                                "year_month",
                                "yearmonth",
                                "target_month",
                                "month_start",
                                "monthStart",
                                "month_start_date",
                                "yearMonthStr",
                                "ym",
                            ],
                            6
                        );
                        const month = normalizeMonth(monthRaw) ?? pickYearMonthParts(x);

                        if (!kaipoke_cs_id || !month) return null;
                        return { kaipoke_cs_id: String(kaipoke_cs_id), month };
                    })
                    .filter((v): v is BulkItem => v !== null);

                if (normalized.length === 0) {
                    setError(
                        "印刷対象の形式が不正です。（kaipoke_cs_id / month が取れません）\n\n" +
                        "jisseki_bulk_print(先頭800文字):\n" +
                        payload.slice(0, 800)
                    );
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
            } finally {
                setLoading(false);
            }
        };

        void run();
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
