"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type PrintPayload = {
    client: { kaipoke_cs_id: string; client_name: string };
    month: string; // YYYY-MM
    forms: Array<{
        formType: "TAKINO" | "KODO" | "DOKO" | "JYUHO" | "IDOU";
        service_codes: string[];
        // rows はシフト等の明細（必要に応じて拡張）
        rows: Array<{
            date: string;        // YYYY-MM-DD
            start: string;       // HH:mm
            end: string;         // HH:mm
            minutes?: number;
            staffNames?: string[];
            // …必要な項目を追加
        }>;
    }>;
};

type FormData = PrintPayload["forms"][number];

type FormProps = {
    data: PrintPayload;
    form: FormData;
};

export default function JissekiPrintPage() {
    const sp = useSearchParams();
    const kaipoke_cs_id = sp.get("kaipoke_cs_id") ?? "";
    const month = sp.get("month") ?? "";

    const [data, setData] = useState<PrintPayload | null>(null);
    const [error, setError] = useState<string>("");

    useEffect(() => {
        if (!kaipoke_cs_id || !month) return;

        (async () => {
            setError("");
            const q = new URLSearchParams({ kaipoke_cs_id, month });
            const res = await fetch(`/api/jisseki/print?${q.toString()}`, { cache: "no-store" });
            if (!res.ok) {
                const t = await res.text().catch(() => "");
                setError(t || "印刷データ取得に失敗しました");
                return;
            }
            const json = (await res.json()) as PrintPayload;
            setData(json);
        })();
    }, [kaipoke_cs_id, month]);

    const title = useMemo(() => {
        if (!data) return "実績記録 印刷";
        return `実績記録 印刷（${data.client.client_name} ${data.month}）`;
    }, [data]);

    return (
        <div className="min-h-screen bg-white text-black">
            <style jsx global>{`
        @page { size: A4; margin: 10mm; }
        @media print {
          .no-print { display: none !important; }
          .page-break { page-break-before: always; }
        }
      `}</style>

            <div className="no-print p-4 flex items-center gap-3 border-b">
                <h1 className="text-lg font-semibold">{title}</h1>
                <button
                    className="ml-auto px-3 py-2 border rounded"
                    onClick={() => window.print()}
                >
                    印刷
                </button>
            </div>

            {error && <div className="p-4 text-red-600">{error}</div>}
            {!data && !error && <div className="p-4">読み込み中…</div>}

            {data?.forms.map((f, idx) => (
                <div key={idx} className={idx === 0 ? "p-6" : "p-6 page-break"}>
                    {/* ここで formType ごとに様式コンポーネントを切り替え */}
                    {f.formType === "TAKINO" && <TakinokyoForm data={data} form={f} />}
                    {f.formType === "KODO" && <KodoEngoForm data={data} form={f} />}
                    {f.formType === "DOKO" && <DokoEngoForm data={data} form={f} />}
                    {f.formType === "JYUHO" && <JudoHommonForm data={data} form={f} />}
                    {f.formType === "IDOU" && <IdoShienForm data={data} form={f} />}
                </div>
            ))}
        </div>
    );
}

/** 以下は雛形（最初は“それっぽい枠”でOK。帳票の罫線を詰めるのは後で） */
function TakinokyoForm({ data, form }: FormProps) {
    return (
        <div>
            <div className="text-center font-bold">居宅介護サービス提供実績記録票（様式1）</div>
            <div className="mt-2 text-sm">
                <div>対象：{data.client.client_name}</div>
                <div>年月：{data.month}</div>
                <div>サービス：{form.service_codes.join(" / ")}</div>
            </div>
            {/* TODO: 添付PDFの罫線に合わせてテーブル配置 */}
        </div>
    );
}
function KodoEngoForm({ data, form }: FormProps) {
  return (
    <div>
      <div className="text-center font-bold">行動援護（様式2）</div>
      <div className="mt-2 text-sm">
        <div>対象：{data.client.client_name}</div>
        <div>年月：{data.month}</div>
        <div>サービス：{form.service_codes.join(" / ")}</div>
        <div>件数：{form.rows.length}</div>
      </div>
    </div>
  );
}

function DokoEngoForm({ data, form }: FormProps) {
  return (
    <div>
      <div className="text-center font-bold">同行援護（様式19）</div>
      <div className="mt-2 text-sm">
        <div>対象：{data.client.client_name}</div>
        <div>年月：{data.month}</div>
        <div>サービス：{form.service_codes.join(" / ")}</div>
        <div>件数：{form.rows.length}</div>
      </div>
    </div>
  );
}

function JudoHommonForm({ data, form }: FormProps) {
  return (
    <div>
      <div className="text-center font-bold">重度訪問（様式3-1）</div>
      <div className="mt-2 text-sm">
        <div>対象：{data.client.client_name}</div>
        <div>年月：{data.month}</div>
        <div>サービス：{form.service_codes.join(" / ")}</div>
        <div>件数：{form.rows.length}</div>
      </div>
    </div>
  );
}

function IdoShienForm({ data, form }: FormProps) {
  return (
    <div>
      <div className="text-center font-bold">移動支援（様式3）</div>
      <div className="mt-2 text-sm">
        <div>対象：{data.client.client_name}</div>
        <div>年月：{data.month}</div>
        <div>サービス：{form.service_codes.join(" / ")}</div>
        <div>件数：{form.rows.length}</div>
      </div>
    </div>
  );
}

