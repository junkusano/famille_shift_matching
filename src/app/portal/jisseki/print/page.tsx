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
const OFFICE_NAME = "合同会社施恩 ファミーユヘルパーサービス 名北";
const OFFICE_NO = "2360181545";

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
    @page { size: A4; margin: 6mm; }
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
       /* ★追加：この文言を含む要素を印刷に出さない（暫定対策） */
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
    .ido-grid { width: 100% !important; }
    .ido-grid { max-width: 100% !important; }
.print-only { width: 100%; }
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
                    <div className="box col-span-2 p-1 small center">{data.client.client_name}</div>

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
                <table className="grid ido-grid">
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
                <div className="box col-span-2 p-1 small center">{data.client.client_name}</div>

                <div className="box col-span-3 p-1 small">年月</div>
                <div className="box col-span-3 p-1 small center">{data.month}</div>
                <div className="box col-span-6 p-1 small">サービス</div>
                <div className="box col-span-12 p-1 small">{form.service_codes.join(" / ")}</div>
            </div>

            <div className="mt-2">
                <table className="grid ido-grid">
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
                <div className="box col-span-2 p-1 small center">{data.client.client_name}</div>

                <div className="box col-span-3 p-1 small">年月</div>
                <div className="box col-span-3 p-1 small center">{data.month}</div>
                <div className="box col-span-6 p-1 small">サービス</div>
                <div className="box col-span-12 p-1 small">{form.service_codes.join(" / ")}</div>
            </div>

            <div className="mt-2">
                <table className="grid ido-grid">
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
                <div className="box col-span-2 p-1 small center">{data.client.client_name}</div>

                <div className="box col-span-3 p-1 small">年月</div>
                <div className="box col-span-3 p-1 small center">{data.month}</div>
                <div className="box col-span-6 p-1 small">サービス</div>
                <div className="box col-span-12 p-1 small">{form.service_codes.join(" / ")}</div>
            </div>

            <div className="mt-2">
                <table className="grid ido-grid">
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

function IdoShienForm({ data, form }: FormProps) {
    // ⑤ 合計計算（未入力項目は 0 扱い。後でAPI項目追加したら差し替え）
    const sumPlanMin = (form.rows ?? []).reduce((a, r) => a + (r.minutes ?? 0), 0);

    // 内訳（不可欠/その他）・算定時間(時間)・片道支援加算・利用者負担額は
    // 今の rows 定義に無いので 0 で置く（後で追加する想定）
    const sumUphitMin = 0;   // 不可欠(分)
    const sumOtherMin = 0;   // その他(分)
    const sumSanteiHour = 0; // 算定時間(時間)
    const sumKatamichi = 0;  // 片道支援加算（回数等）
    const sumFutan = 0;      // 利用者負担額（円）

    return (
        <div className="formBox p-2">
            <div className="title">移動支援　サービス提供実績記録票（様式３）</div>
            <div style={{ display: "none" }}>{data.client.client_name}</div>

            {/* ★統合：ヘッダ＋明細を “1つの table” にする（横幅ズレ防止） */}
            <div className="mt-2">
                <table className="grid ido-grid" style={{ width: "100%", tableLayout: "fixed" }}>
                    {/* 明細と同じ 18列 colgroup を 1回だけ定義（合計100%） */}
                    <colgroup>
                        <col style={{ width: "5%" }} />  {/* 日付 */}
                        <col style={{ width: "5%" }} />  {/* 曜日 */}

                        <col style={{ width: "6%" }} />  {/* 計画 サービス提供 開始 */}
                        <col style={{ width: "6%" }} />  {/* 計画 サービス提供 終了 */}
                        <col style={{ width: "4%" }} />  {/* 計画 サービス提供 分 */}

                        <col style={{ width: "6%" }} />  {/* 計画 控除 開始 */}
                        <col style={{ width: "6%" }} />  {/* 計画 控除 終了 */}
                        <col style={{ width: "4%" }} />  {/* 計画 控除 分 */}

                        <col style={{ width: "5%" }} />  {/* 計画時間(分) */}
                        <col style={{ width: "5%" }} />  {/* 内訳 不可欠 */}
                        <col style={{ width: "5%" }} />  {/* 内訳 その他 */}

                        <col style={{ width: "6%" }} />  {/* 算定時間(時間) */}
                        <col style={{ width: "6%" }} />  {/* 片道支援加算 */}
                        <col style={{ width: "6%" }} />  {/* 利用者負担額 */}

                        <col style={{ width: "6%" }} />  {/* サービス提供時間 開始 */}
                        <col style={{ width: "6%" }} />  {/* サービス提供時間 終了 */}
                        <col style={{ width: "7%" }} />  {/* サービス提供者名 */}
                        <col style={{ width: "7%" }} />  {/* 利用者確認欄 */}
                    </colgroup>

                    <tbody>
                        {/* =========================
         上段：受給者証番号 等（同じ table の中で colspan で表現）
         ========================= */}

                        {/* 1行目：左ブロック(受給者証番号/氏名/事業所番号) + 右ブロック(事業者事業所の名称：3行分) */}
                        <tr>
                            <td className="small" colSpan={4}>
                                受給者証番号
                                <div className="mt-1">&nbsp;</div>
                            </td>

                            {/* 支給決定者(保護者)氏名（児童氏名）＋右に2行分の記入欄 */}
                            <td className="small" colSpan={8} style={{ padding: 0 }}>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
                                    {/* 左：ラベル（2段） */}
                                    <div>
                                        <div style={{ borderBottom: "1px solid #000", padding: "2px 4px" }}>
                                            支給決定者(保護者)氏名
                                        </div>
                                        <div style={{ padding: "2px 4px" }}>（児童氏名）</div>
                                    </div>

                                    {/* 右：記入欄（2行分の太さで 1枠） */}
                                    <div style={{ borderLeft: "1px solid #000" }}>
                                        <div style={{ padding: "2px 4px", height: "100%" }}>
                                            {data.client.client_name}
                                        </div>
                                    </div>
                                </div>
                            </td>

                            <td className="small" colSpan={3}>
                                事業所番号
                                <div className="mt-1">{OFFICE_NO}</div>
                            </td>

                            {/* 右：事業者事業所の名称（3行分） */}
                            <td className="small" colSpan={3} rowSpan={3}>
                                事業者事業所の名称
                                <div className="mt-1">{OFFICE_NAME}</div>
                                <div className="mt-1">&nbsp;</div>
                                <div className="mt-1">&nbsp;</div>
                            </td>
                        </tr>

                        {/* 2行目：総決定支給量(不可欠/その他) と 契約支給量(不可欠/その他) */}
                        <tr>
                            <td className="small" colSpan={4} style={{ padding: 0 }}>
                                <div style={{ borderBottom: "1px solid #000", padding: "2px 4px" }}>
                                    総決定支給量（不可欠）
                                    <div className="mt-1">&nbsp;</div>
                                </div>
                                <div style={{ padding: "2px 4px" }}>
                                    総決定支給量（その他）
                                    <div className="mt-1">&nbsp;</div>
                                </div>
                            </td>

                            <td className="small" colSpan={8} style={{ padding: 0 }}>
                                <div style={{ borderBottom: "1px solid #000", padding: "2px 4px" }}>
                                    契約支給量（不可欠）
                                    <div className="mt-1">&nbsp;</div>
                                </div>
                                <div style={{ padding: "2px 4px" }}>
                                    契約支給量（その他）
                                    <div className="mt-1">&nbsp;</div>
                                </div>
                            </td>

                            <td className="small" colSpan={3}>
                                {/* 右ブロックがrowSpanなので、ここは空でOK */}
                                &nbsp;
                            </td>
                        </tr>

                        {/* 3行目：月額上限負担額（左側） */}
                        <tr>
                            <td className="small" colSpan={12}>
                                月額上限負担額
                                <div className="mt-1 right">0円</div>
                            </td>
                            <td className="small" colSpan={3}>&nbsp;</td>
                        </tr>

                        {/* （ヘッダと明細の間の空白行：見た目調整） */}
                        <tr>
                            <td colSpan={18} style={{ border: "none", padding: 0, height: "6px" }} />
                        </tr>

                        {/* =========================
         下段：移動支援計画（同じ table の中で th を置く）
         ========================= */}

                        <tr>
                            <th className="center" rowSpan={3}>日付</th>
                            <th className="center" rowSpan={3}>曜日</th>
                            <th className="center" colSpan={9}>移動支援計画</th>
                            <th className="center" rowSpan={3}>算定時間(時間)</th>
                            <th className="center" rowSpan={3}>片道支援加算</th>
                            <th className="center" rowSpan={3}>利用者負担額</th>
                            <th className="center" colSpan={2}>サービス提供時間</th>
                            <th className="center" rowSpan={3}>サービス提供者名</th>
                            <th className="center" rowSpan={3}>利用者確認欄</th>
                        </tr>

                        <tr>
                            <th className="center" colSpan={3}>サービス提供</th>
                            <th className="center" colSpan={3}>控除</th>
                            <th className="center" rowSpan={2}>計画時間(分)</th>
                            <th className="center" colSpan={2}>内訳(分)</th>
                            <th className="center" colSpan={2}>サービス提供</th>
                        </tr>

                        <tr>
                            <th className="center">開始時刻</th>
                            <th className="center">終了時刻</th>
                            <th className="center">分</th>

                            <th className="center">開始時刻</th>
                            <th className="center">終了時刻</th>
                            <th className="center">分</th>

                            <th className="center">不可欠</th>
                            <th className="center">その他</th>

                            <th className="center">開始時刻</th>
                            <th className="center">終了時刻</th>
                        </tr>

                        {/* 明細：31行 */}
                        {Array.from({ length: 31 }).map((_, i) => (
                            <tr key={i}>
                                {Array.from({ length: 18 }).map((__, j) => (
                                    <td key={j}>&nbsp;</td>
                                ))}
                            </tr>
                        ))}

                        {/* 合計行（列数18に一致させる） */}
                        <tr>
                            <td className="center" colSpan={8}><b>合計</b></td>
                            <td className="right"><b>{sumPlanMin}</b></td>
                            <td className="right"><b>{sumUphitMin}</b></td>
                            <td className="right"><b>{sumOtherMin}</b></td>
                            <td className="right"><b>{sumSanteiHour}</b></td>
                            <td className="right"><b>{sumKatamichi}</b></td>
                            <td className="right"><b>{sumFutan}</b></td>
                            <td>&nbsp;</td>
                            <td>&nbsp;</td>
                            <td>&nbsp;</td>
                            <td>&nbsp;</td>
                        </tr>
                        {/* ★ここに追加：フッタ（合計）も table の中に統合 */}
                        <tr>
                            <td className="small" colSpan={18} style={{ padding: "6px 4px" }}>
                                合計（後で自動計算）
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div className="mt-1 small right">1 / 1</div>
        </div>
    );
}

