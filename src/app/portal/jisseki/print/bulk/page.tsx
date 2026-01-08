"use client";

import { useEffect, useState } from "react";

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
            {clientIds.map((csId) => (
                <div key={csId} className="page-break">
                    {/* ここに既存の単票印刷の“本体コンポーネント”を呼ぶのが理想 */}
                    {/* 例: <JissekiPrintBody kaipoke_cs_id={csId} month={month} /> */}
                    <div>TODO: {csId} / {month}</div>
                </div>
            ))}
        </div>
    );
}
