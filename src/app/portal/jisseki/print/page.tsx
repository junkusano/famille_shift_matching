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

      /* ★追加：印刷時は“帳票エリアだけ”を表示 */
      body { margin: 0 !important; }
      .print-only { display: block !important; }
      .screen-only { display: none !important; }
    }
    @media screen {
      .print-only { display: block; }
      .screen-only { display: block; }
    }

    /* ★帳票用 罫線・レイアウト */
    .formBox { border: 2px solid #000; }
    .box { border: 1px solid #000; }
    .grid { border-collapse: collapse; width: 100%; table-layout: fixed; }
    .grid th, .grid td { border: 1px solid #000; padding: 2px 4px; font-size: 11px; line-height: 1.2; vertical-align: middle; }
    .center { text-align: center; }
    .right { text-align: right; }
    .small { font-size: 10px; }
    .title { font-size: 14px; font-weight: 700; text-align: center; }
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

            {/* ★印刷対象エリア：帳票だけ */}
            <div className="print-only">
                {data && data.forms.map((f, idx) => (
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
        </div>
    );
}

function TakinokyoForm({ data, form }: FormProps) {
    return (
        <div className="formBox p-2">
            <div className="title">居宅介護サービス提供実績記録票（様式１）</div>

            {/* ヘッダ枠 */}
            <div className="mt-2">
                <div className="grid grid-cols-12 gap-0">
                    <div className="box col-span-3 p-1 small">受給者証番号</div>
                    <div className="box col-span-5 p-1 small">支給決定障害者等氏名（障害児氏名）</div>
                    <div className="box col-span-2 p-1 small">事業所番号</div>
                    <div className="box col-span-2 p-1 small center">&nbsp;</div>

                    <div className="box col-span-3 p-1 small">年月</div>
                    <div className="box col-span-3 p-1 small center">{data.month}</div>
                    <div className="box col-span-6 p-1 small">事業者及びその事業所</div>

                    <div className="box col-span-6 p-1 small">利用者氏名</div>
                    <div className="box col-span-6 p-1 small">{data.client.client_name}</div>

                    <div className="box col-span-6 p-1 small">サービス</div>
                    <div className="box col-span-6 p-1 small">{form.service_codes.join(" / ")}</div>
                </div>
            </div>

            {/* 明細テーブル（空行） */}
            <div className="mt-2">
                <table className="grid">
                    <thead>
                        <tr>
                            <th className="center" style={{ width: "6%" }}>日付</th>
                            <th className="center" style={{ width: "6%" }}>曜日</th>
                            <th className="center" style={{ width: "14%" }}>サービス内容</th>
                            <th className="center" style={{ width: "10%" }}>開始</th>
                            <th className="center" style={{ width: "10%" }}>終了</th>
                            <th className="center" style={{ width: "8%" }}>時間</th>
                            <th className="center" style={{ width: "8%" }}>派遣</th>
                            <th className="center" style={{ width: "12%" }}>利用者確認</th>
                            <th className="center">備考</th>
                        </tr>
                    </thead>
                    <tbody>
                        {Array.from({ length: 25 }).map((_, i) => (
                            <tr key={i}>
                                <td>&nbsp;</td>
                                <td>&nbsp;</td>
                                <td>&nbsp;</td>
                                <td>&nbsp;</td>
                                <td>&nbsp;</td>
                                <td>&nbsp;</td>
                                <td>&nbsp;</td>
                                <td>&nbsp;</td>
                                <td>&nbsp;</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* フッタ枠（後で計算値を入れる） */}
            <div className="mt-2 grid grid-cols-12 gap-0">
                <div className="box col-span-6 p-2 small">合計（計画時間／算定時間など：後で）</div>
                <div className="box col-span-6 p-2 small">内訳（加算・単価区分：後で）</div>
            </div>
        </div>
    );
}

function KodoEngoForm({ data, form }: FormProps) {
    return (
        <div className="formBox p-2">
            <div className="title">行動援護サービス提供実績記録票（様式２）</div>

            <div className="mt-2 grid grid-cols-12 gap-0">
                <div className="box col-span-3 p-1 small">受給者証番号</div>
                <div className="box col-span-5 p-1 small">{data.client.client_name}</div>
                <div className="box col-span-2 p-1 small">事業所番号</div>
                <div className="box col-span-2 p-1 small center">&nbsp;</div>

                <div className="box col-span-3 p-1 small">年月</div>
                <div className="box col-span-3 p-1 small center">{data.month}</div>
                <div className="box col-span-6 p-1 small">サービス</div>
                <div className="box col-span-12 p-1 small">{form.service_codes.join(" / ")}</div>
            </div>

            <div className="mt-2">
                <table className="grid">
                    <thead>
                        <tr>
                            <th className="center" style={{ width: "6%" }}>日付</th>
                            <th className="center" style={{ width: "6%" }}>曜日</th>
                            <th className="center" style={{ width: "10%" }}>計画開始</th>
                            <th className="center" style={{ width: "10%" }}>計画終了</th>
                            <th className="center" style={{ width: "8%" }}>計画</th>
                            <th className="center" style={{ width: "10%" }}>提供開始</th>
                            <th className="center" style={{ width: "10%" }}>提供終了</th>
                            <th className="center" style={{ width: "8%" }}>算定</th>
                            <th className="center" style={{ width: "8%" }}>派遣</th>
                            <th className="center" style={{ width: "12%" }}>利用者確認</th>
                            <th className="center">備考</th>
                        </tr>
                    </thead>
                    <tbody>
                        {Array.from({ length: 25 }).map((_, i) => (
                            <tr key={i}>
                                <td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td>
                                <td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="mt-2 box p-2 small">合計（計画／算定：後で）</div>
        </div>
    );
}

function DokoEngoForm({ data, form }: FormProps) {
    return (
        <div className="formBox p-2">
            <div className="title">同行援護サービス提供実績記録票（様式１９）</div>

            <div className="mt-2 grid grid-cols-12 gap-0">
                <div className="box col-span-3 p-1 small">受給者証番号</div>
                <div className="box col-span-5 p-1 small">{data.client.client_name}</div>
                <div className="box col-span-4 p-1 small">事業者及びその事業所</div>

                <div className="box col-span-3 p-1 small">年月</div>
                <div className="box col-span-3 p-1 small center">{data.month}</div>
                <div className="box col-span-6 p-1 small">サービス</div>
                <div className="box col-span-12 p-1 small">{form.service_codes.join(" / ")}</div>
            </div>

            <div className="mt-2">
                <table className="grid">
                    <thead>
                        <tr>
                            <th className="center" style={{ width: "6%" }}>日付</th>
                            <th className="center" style={{ width: "6%" }}>曜日</th>
                            <th className="center" style={{ width: "16%" }}>サービス内容</th>
                            <th className="center" style={{ width: "10%" }}>計画開始</th>
                            <th className="center" style={{ width: "10%" }}>計画終了</th>
                            <th className="center" style={{ width: "8%" }}>計画</th>
                            <th className="center" style={{ width: "10%" }}>提供開始</th>
                            <th className="center" style={{ width: "10%" }}>提供終了</th>
                            <th className="center" style={{ width: "8%" }}>算定</th>
                            <th className="center" style={{ width: "8%" }}>派遣</th>
                            <th className="center">備考</th>
                        </tr>
                    </thead>
                    <tbody>
                        {Array.from({ length: 25 }).map((_, i) => (
                            <tr key={i}>
                                <td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td>
                                <td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="mt-2 box p-2 small">合計・内訳（後で）</div>
        </div>
    );
}

function JudoHommonForm({ data, form }: FormProps) {
    return (
        <div className="formBox p-2">
            <div className="title">重度訪問介護サービス提供実績記録票（様式３－１）</div>

            <div className="mt-2 grid grid-cols-12 gap-0">
                <div className="box col-span-3 p-1 small">受給者証番号</div>
                <div className="box col-span-5 p-1 small">{data.client.client_name}</div>
                <div className="box col-span-4 p-1 small">事業所番号／事業所名</div>

                <div className="box col-span-3 p-1 small">年月</div>
                <div className="box col-span-3 p-1 small center">{data.month}</div>
                <div className="box col-span-6 p-1 small">サービス</div>
                <div className="box col-span-12 p-1 small">{form.service_codes.join(" / ")}</div>
            </div>

            <div className="mt-2">
                <table className="grid">
                    <thead>
                        <tr>
                            <th className="center" style={{ width: "6%" }}>日付</th>
                            <th className="center" style={{ width: "6%" }}>曜日</th>
                            <th className="center" style={{ width: "14%" }}>提供状況</th>
                            <th className="center" style={{ width: "10%" }}>計画開始</th>
                            <th className="center" style={{ width: "10%" }}>計画終了</th>
                            <th className="center" style={{ width: "8%" }}>計画</th>
                            <th className="center" style={{ width: "10%" }}>提供開始</th>
                            <th className="center" style={{ width: "10%" }}>提供終了</th>
                            <th className="center" style={{ width: "8%" }}>算定</th>
                            <th className="center" style={{ width: "8%" }}>派遣</th>
                            <th className="center">備考</th>
                        </tr>
                    </thead>
                    <tbody>
                        {Array.from({ length: 25 }).map((_, i) => (
                            <tr key={i}>
                                <td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td>
                                <td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="mt-2 box p-2 small">下部：合計・加算欄（後で）</div>
        </div>
    );
}

function IdoShienForm({ data }: FormProps) {
    return (
        <div className="formBox p-2">
            <div className="title">移動支援　サービス提供実績記録票（様式３）</div>

            {/* ヘッダ（PDFの項目を網羅） */}
            {/* ヘッダ（PDFの3行構造：⑥・⑤対応） */}
            <div className="mt-2">
                <table className="grid">
                    <colgroup>
                        <col style={{ width: "32%" }} />
                        <col style={{ width: "36%" }} />
                        <col style={{ width: "32%" }} />
                    </colgroup>
                    <tbody>
                        {/* 1行目：受給者証番号｜支給決定者(保護者)氏名（児童氏名）｜事業所番号 */}
                        <tr>
                            <td className="small">
                                受給者証番号
                                <div className="mt-1">&nbsp;</div>
                            </td>

                            {/* 中央セル：上下2段（上：保護者氏名、下：児童氏名） */}
                            <td className="small" style={{ padding: 0 }}>
                                <div style={{ borderBottom: "1px solid #000", padding: "2px 4px" }}>
                                    支給決定者(保護者)氏名
                                    <div className="mt-1">{data.client.client_name}</div>
                                </div>
                                <div style={{ padding: "2px 4px" }}>
                                    （児童氏名）
                                    <div className="mt-1">&nbsp;</div>
                                </div>
                            </td>

                            <td className="small">
                                事業所番号
                                <div className="mt-1">&nbsp;</div>
                            </td>
                        </tr>

                        {/* 2〜4行：左に 総決定支給量(不可欠/その他) と 契約支給量(不可欠/その他)
                           右に 事業者事業所の名称（3行分の高さ）
                           最下段左側は 月額上限負担額
                        */}
                        <tr>
                            {/* 総決定支給量（2行分：上 不可欠 / 下 その他） */}
                            <td className="small" rowSpan={2} style={{ padding: 0 }}>
                                <div style={{ borderBottom: "1px solid #000", padding: "2px 4px" }}>
                                    総決定支給量（不可欠）
                                    <div className="mt-1">&nbsp;</div>
                                </div>
                                <div style={{ padding: "2px 4px" }}>
                                    総決定支給量（その他）
                                    <div className="mt-1">&nbsp;</div>
                                </div>
                            </td>

                            {/* 契約支給量（2行分：上 不可欠 / 下 その他） */}
                            <td className="small" rowSpan={2} style={{ padding: 0 }}>
                                <div style={{ borderBottom: "1px solid #000", padding: "2px 4px" }}>
                                    契約支給量（不可欠）
                                    <div className="mt-1">&nbsp;</div>
                                </div>
                                <div style={{ padding: "2px 4px" }}>
                                    契約支給量（その他）
                                    <div className="mt-1">&nbsp;</div>
                                </div>
                            </td>

                            {/* 事業者事業所の名称（3行分の枠） */}
                            <td className="small" rowSpan={3}>
                                事業者事業所の名称
                                <div className="mt-1">&nbsp;</div>
                                <div className="mt-1">&nbsp;</div>
                                <div className="mt-1">&nbsp;</div>
                            </td>
                        </tr>

                        {/* rowSpanで埋まる行（実体は空でOK） */}
                        <tr />

                        {/* 4行目：月額上限負担額（左2列を横結合） */}
                        <tr>
                            <td className="small" colSpan={2}>
                                月額上限負担額
                                <div className="mt-1 right">0円</div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            {/* 明細（PDFの列を再現：計画/提供/内訳/片道/提供者/利用形態/負担額/確認欄） */}
            <div className="mt-2">
                <table className="grid">
                    <thead>
                        {/* 1段目 */}
                        <tr>
                            <th className="center" rowSpan={4} style={{ width: "5%" }}>日付</th>
                            <th className="center" rowSpan={4} style={{ width: "5%" }}>曜</th>

                            {/* ①：移動支援計画の中に 4項目 */}
                            <th className="center" colSpan={9}>移動支援計画</th>

                            {/* ②：算定時間の隣は 利用形態を削除し、片道→負担額の順に */}
                            <th className="center" rowSpan={4} style={{ width: "7%" }}>算定時間(時間)</th>
                            <th className="center" rowSpan={4} style={{ width: "7%" }}>片道支援加算</th>
                            <th className="center" rowSpan={4} style={{ width: "7%" }}>利用者負担額</th>

                            {/* ③：負担額の隣に サービス提供時間（その下にサービス提供→開始/終了） */}
                            <th className="center" colSpan={2} style={{ width: "12%" }}>サービス提供時間</th>
                        </tr>

                        {/* 2段目 */}
                        <tr>
                            <th className="center" colSpan={3}>サービス提供</th>
                            <th className="center" colSpan={3}>控除</th>
                            <th className="center" rowSpan={3}>計画時間(分)</th>
                            <th className="center" colSpan={2}>内訳(分)</th>

                            <th className="center" colSpan={2}>サービス提供</th>
                        </tr>

                        {/* 3段目 */}
                        <tr>
                            <th className="center" rowSpan={2}>開始時刻</th>
                            <th className="center" rowSpan={2}>終了時刻</th>
                            <th className="center" rowSpan={2}>分</th>

                            <th className="center" rowSpan={2}>開始時刻</th>
                            <th className="center" rowSpan={2}>終了時刻</th>
                            <th className="center" rowSpan={2}>分</th>

                            <th className="center" rowSpan={2}>不可欠</th>
                            <th className="center" rowSpan={2}>その他</th>

                            <th className="center" rowSpan={2}>開始時刻</th>
                            <th className="center" rowSpan={2}>終了時刻</th>
                        </tr>

                        {/* 4段目（rowSpanで埋まるので空でOK） */}
                        <tr />
                    </thead>

                    <tbody>
                        {Array.from({ length: 20 }).map((_, i) => (
                            <tr key={i}>
                                {/* 日付 / 曜 */}
                                <td>&nbsp;</td>
                                <td>&nbsp;</td>

                                {/* 移動支援計画：サービス提供（開始/終了/分） */}
                                <td>&nbsp;</td>
                                <td>&nbsp;</td>
                                <td>&nbsp;</td>

                                {/* 移動支援計画：控除（開始/終了/分） */}
                                <td>&nbsp;</td>
                                <td>&nbsp;</td>
                                <td>&nbsp;</td>

                                {/* 計画時間(分) */}
                                <td>&nbsp;</td>

                                {/* 内訳(分)：不可欠/その他 */}
                                <td>&nbsp;</td>
                                <td>&nbsp;</td>

                                {/* 算定時間(時間) */}
                                <td>&nbsp;</td>

                                {/* 片道支援加算 */}
                                <td>&nbsp;</td>

                                {/* 利用者負担額 */}
                                <td>&nbsp;</td>

                                {/* サービス提供時間（開始/終了） */}
                                <td>&nbsp;</td>
                                <td>&nbsp;</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* フッタ（PDFの“合計／控除”などの枠） */}
            <div className="mt-2 grid grid-cols-12 gap-0">
                <div className="box col-span-6 p-2 small">合計（後で自動計算）</div>
            </div>

            <div className="mt-1 small right">1 / 1</div>
        </div>
    );
}

