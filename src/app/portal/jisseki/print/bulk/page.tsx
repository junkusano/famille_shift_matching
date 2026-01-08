"use client";

import { useEffect, useState } from "react";
import JissekiPrintBody from "@/components/jisseki/JissekiPrintBody"; // ★ここ

type Payload = { month: string; clientIds: string[] };

export default function BulkPrintPage() {
    const [payload, setPayload] = useState<Payload | null>(null);

    useEffect(() => {
        try {
            const raw = localStorage.getItem("jisseki_bulk_print");
            if (!raw) return;
            setPayload(JSON.parse(raw));
        } catch {
            setPayload(null);
        }
    }, []);

    const month = payload?.month ?? "";
    const clientIds = payload?.clientIds ?? [];

    useEffect(() => {
        if (!payload) return;
        // 画面レンダリング後に印刷ダイアログ
        const t = setTimeout(() => window.print(), 500);
        return () => clearTimeout(t);
    }, [payload]);

    if (!payload) return <div>一括印刷データがありません（一覧から再度実行してください）</div>;

    return (
        <div className="print-only">
            {clientIds.map((csId, idx) => (
                <div key={csId} className={idx === 0 ? "" : "page-break"}>
                    <JissekiPrintBody kaipoke_cs_id={csId} month={month} />
                </div>
            ))}
        </div>
    );
}
