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

  /* ★ここが重要：印刷時は print-only 以外を見えなくする */
  body { margin: 0 !important; }
  body * { visibility: hidden !important; }
  .print-only, .print-only * { visibility: visible !important; }

  /* 印刷位置を左上に寄せる（余計な余白・ズレ対策） */
  .print-only { position: absolute; top: 0; left: 0; width: 100%; }
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
/* A4の実コンテンツ幅（210 - 左右マージン12 = 198） */
:root { --a4w: 198mm; }

/* 画面でも印刷でもA4幅に固定 */
.print-only { width: var(--a4w) !important; margin: 0 auto; }

/* 帳票本体も固定 */
.formBox { width: var(--a4w); box-sizing: border-box; }

/* tableを固定幅に */
.grid { border-collapse: collapse; width: var(--a4w); table-layout: fixed; }
.ido-grid { width: var(--a4w) !important; max-width: var(--a4w) !important; }
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
                        {f.formType === "IDOU" && (
                            <IdoShienForm
                                data={data}
                                form={f}
                                pageNo={idx + 1}
                                totalPages={data.forms.length}
                            />
                        )}
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

// 1桁ずつ枠で区切る（10桁など）
function DigitLines({ value = "", length = 10 }: { value?: string; length?: number }) {
    const digits = (value ?? "").replace(/\D/g, "").padEnd(length, " ").slice(0, length).split("");
    return (
        <div
            style={{
                display: "grid",
                gridTemplateColumns: `repeat(${length}, 1fr)`,
                height: 18,
                borderBottom: "1px solid #000",  // 下線だけ
                borderLeft: "1px solid #000",
            }}
        >
            {digits.map((d, i) => (
                <div
                    key={i}
                    style={{
                        textAlign: "center",
                        lineHeight: "18px",
                        borderRight: "1px solid #000", // 縦の区切り線のみ
                    }}
                >
                    {d.trim() ? d : "\u00A0"}
                </div>
            ))}
        </div>
    );
}

// 斜線セル（右上→左下）
function DiagCell({ children }: { children?: React.ReactNode }) {
    return (
        <td
            className="diag"
            style={{
                position: "relative",
                backgroundImage:
                    "linear-gradient(to bottom left, transparent calc(50% - 1px), #000 calc(50% - 1px), #000 calc(50% + 1px), transparent calc(50% + 1px))",
                backgroundRepeat: "no-repeat",
                backgroundSize: "100% 100%",
            }}
        >
            {children ?? "\u00A0"}
        </td>
    );
}

function IdoShienForm({
    data,
    form,
    pageNo,
    totalPages,
}: FormProps & { pageNo: number; totalPages: number }) {
    // ★ヘッダの基本高さ（事業所番号の2段と揃える）
    const H = 28;
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
                        <col style={{ width: "10mm" }} />  {/* 日付 */}
                        <col style={{ width: "10mm" }} />  {/* 曜日 */}


                        <col style={{ width: "12mm" }} /> {/* 計画 サービス提供 開始 */}
                        <col style={{ width: "12mm" }} /> {/* 計画 サービス提供 終了 */}
                        <col style={{ width: "8mm" }} /> {/* 計画 サービス提供 分 */}

                        <col style={{ width: "12mm" }} /> {/* 計画 控除 開始 */}
                        <col style={{ width: "12mm" }} />  {/* 計画 控除 終了 */}
                        <col style={{ width: "8mm" }} />  {/* 計画 控除 分 */}

                        <col style={{ width: "10mm" }} /> {/* 計画時間(分) */}
                        <col style={{ width: "10mm" }} /> {/* 内訳 不可欠 */}
                        <col style={{ width: "10mm" }} /> {/* 内訳 その他 */}

                        <col style={{ width: "12mm" }} /> {/* 算定時間(時間) */}
                        <col style={{ width: "12mm" }} />   {/* 利用形態 */}
                        <col style={{ width: "12mm" }} />  {/* 片道支援加算 */}
                        <col style={{ width: "12mm" }} />  {/* 利用者負担額 */}

                        <col style={{ width: "12mm" }} /> {/* サービス提供時間 開始 */}
                        <col style={{ width: "12mm" }} /> {/* サービス提供時間 終了 */}
                        <col style={{ width: "14mm" }} /> {/* サービス提供者名 */}
                        <col style={{ width: "18mm" }} />  {/* 利用者確認欄 */}
                    </colgroup>

                    <tbody>
                        {/* =========================
         上段：受給者証番号 等（同じ table の中で colspan で表現）
         ========================= */}

                        {/* 1行目：左ブロック(受給者証番号/氏名/事業所番号) + 右ブロック(事業者事業所の名称：3行分) */}
                        {/* ====== ヘッダ（PDF寄せ）====== */}
                        {/* 1行目：受給者証番号（左ラベル+縦線+10桁枠）／支給決定者氏名（2段ラベル）／事業所番号（2段ラベル+10桁枠） */}
                        <tr>
                            {/* 左ブロック：受給者証番号 + 支給決定者(2段) + 事業所番号（横並び） */}
                            <td className="small" colSpan={15} style={{ padding: 0 }}>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr 0.8fr", height: H }}>

                                    {/* 受給者証番号：左ラベル（右に縦線） + 10桁（線だけで区切る） */}
                                    <div style={{ display: "grid", gridTemplateColumns: "78px 1fr", borderRight: "1px solid #000" }}>
                                        <div style={{ padding: "4px", borderRight: "1px solid #000", display: "flex", alignItems: "center" }}>
                                            受給者証番号
                                        </div>
                                        <div style={{ padding: "2px 4px", display: "flex", alignItems: "center" }}>
                                            {/* 値は後で差し込み。10桁を「枠」ではなく「区切り線のみ」にする */}
                                            <DigitLines value={""} length={10} />
                                        </div>
                                    </div>

                                    {/* 支給決定者(保護者)氏名／（児童氏名） 2段 + 10桁区切り + 名前欄（横書き） */}
                                    <div style={{ display: "grid", gridTemplateRows: "1fr 1fr", borderRight: "1px solid #000" }}>

                                        {/* 上段：支給決定者(保護者)氏名 + 10桁 + 名前欄 */}
                                        <div style={{ display: "grid", gridTemplateColumns: "150px 120px 1fr", borderBottom: "1px solid #000" }}>
                                            <div style={{ padding: "2px 4px", borderRight: "1px solid #000", display: "flex", alignItems: "center" }}>
                                                支給決定者(保護者)氏名
                                            </div>
                                            <div style={{ padding: "2px 4px", borderRight: "1px solid #000", display: "flex", alignItems: "center" }}>
                                                <DigitLines value={""} length={10} />
                                            </div>
                                            <div style={{ padding: "2px 6px", display: "flex", alignItems: "center", whiteSpace: "nowrap" }}>
                                                {data.client.client_name}
                                            </div>
                                        </div>

                                        {/* 下段：（児童氏名） + 10桁 + 名前欄（横書き） */}
                                        <div style={{ display: "grid", gridTemplateColumns: "150px 120px 1fr" }}>
                                            <div style={{ padding: "2px 4px", borderRight: "1px solid #000", display: "flex", alignItems: "center" }}>
                                                （児童氏名）
                                            </div>
                                            <div style={{ padding: "2px 4px", borderRight: "1px solid #000", display: "flex", alignItems: "center" }}>
                                                <DigitLines value={""} length={10} />
                                            </div>
                                            <div style={{ padding: "2px 6px", display: "flex", alignItems: "center", whiteSpace: "nowrap" }}>
                                                {data.client.client_name}
                                            </div>
                                        </div>

                                    </div>

                                    {/* 事業所番号：ラベル2段 + 10桁（線だけ区切り） */}
                                    <div style={{ display: "grid", gridTemplateRows: "1fr 1fr" }}>
                                        <div style={{ padding: "2px 4px", borderBottom: "1px solid #000", display: "flex", alignItems: "center" }}>
                                            事業所番号
                                        </div>
                                        <div style={{ padding: "2px 4px", display: "flex", alignItems: "center" }}>
                                            <DigitLines value={OFFICE_NO} length={10} />
                                        </div>
                                    </div>

                                </div>
                            </td>

                            {/* 右ブロック（ここでは空：後続行で「総決定支給量列」「月額上限負担額列」を作る） */}
                            <td className="small" colSpan={4} style={{ padding: 0 }}>
                                <div style={{ display: "grid", gridTemplateColumns: "78px 1fr", height: "100%" }}>
                                    <div style={{ padding: "4px", borderRight: "1px solid #000" }}>事業者事業所の名称</div>
                                    <div style={{ padding: "4px", whiteSpace: "pre-line" }}>
                                        {OFFICE_NAME.replace("合同会社施恩", "合同会社施恩\n")
                                            .replace("ファミーユヘルパーサービス", "ファミーユヘルパーサービス\n")}
                                    </div>
                                </div>
                            </td>
                        </tr>

                        {/* 2行目：総決定支給量（1枠） + 右隣に2段「不可欠／その他」枠 ／ 契約支給量も同様 */}
                        <tr>
                            {/* 総決定支給量（1枠） */}
                            <td className="small" colSpan={9} style={{ padding: "4px" }}>
                                総決定支給量
                            </td>

                            {/* 総決定：不可欠/その他（2段） */}
                            <td className="small" colSpan={6} style={{ padding: 0 }}>
                                <div style={{ display: "grid", gridTemplateRows: "1fr 1fr", height: 32 }}>
                                    <div style={{ display: "grid", gridTemplateColumns: "70px 1fr", borderBottom: "1px solid #000" }}>
                                        <div style={{ padding: "2px 4px", borderRight: "1px solid #000" }}>不可欠</div>
                                        <div style={{ padding: "2px 4px" }}>&nbsp;</div>
                                    </div>
                                    <div style={{ display: "grid", gridTemplateColumns: "70px 1fr" }}>
                                        <div style={{ padding: "2px 4px", borderRight: "1px solid #000" }}>その他</div>
                                        <div style={{ padding: "2px 4px" }}>&nbsp;</div>
                                    </div>
                                </div>
                            </td>
                            <tr>
                                {/* 契約支給量（1枠） */}
                                <td className="small" colSpan={6} style={{ padding: "4px" }}>
                                    契約支給量
                                </td>

                                {/* 契約：不可欠/その他（2段） */}
                                <td className="small" colSpan={6} style={{ padding: 0 }}>
                                    <div style={{ display: "grid", gridTemplateRows: "1fr 1fr", height: 32 }}>
                                        <div style={{ display: "grid", gridTemplateColumns: "70px 1fr", borderBottom: "1px solid #000" }}>
                                            <div style={{ padding: "2px 4px", borderRight: "1px solid #000" }}>不可欠</div>
                                            <div style={{ padding: "2px 4px" }}>&nbsp;</div>
                                        </div>
                                        <div style={{ display: "grid", gridTemplateColumns: "70px 1fr" }}>
                                            <div style={{ padding: "2px 4px", borderRight: "1px solid #000" }}>その他</div>
                                            <div style={{ padding: "2px 4px" }}>&nbsp;</div>
                                        </div>
                                    </div>
                                </td>
                            </tr>

                            <td className="small" colSpan={3}>&nbsp;</td>
                        </tr>

                        {/* 月額上限負担額（PDFにもある） */}
                        <tr>
                            <td className="small" colSpan={15} style={{ padding: 0 }}>
                                <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", height: 28 }}>
                                    <div style={{ padding: "4px", borderRight: "1px solid #000", display: "flex", alignItems: "center" }}>
                                        月額上限負担額
                                    </div>
                                    <div style={{ padding: "4px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                        0円
                                    </div>
                                </div>
                            </td>
                        </tr>

                        {/* =========================
         下段：移動支援計画（同じ table の中で th を置く）
         ========================= */}

                        <tr>
                            <th className="center" rowSpan={3}>日付</th>
                            <th className="center" rowSpan={3}>曜日</th>
                            <th className="center" colSpan={9}>移動支援計画</th>
                            <th className="center" rowSpan={3}>算定時間(時間)</th>
                            <th className="center" rowSpan={3}>利用形態</th>
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
                                {Array.from({ length: 19 }).map((__, j) => (
                                    <td key={j}>&nbsp;</td>
                                ))}
                            </tr>
                        ))}

                        {/* 合計行（列数18に一致させる） */}
                        <tr>
                            <td className="center" colSpan={2}><b>合計</b></td>

                            {/* 指定の空白セルは斜線にする（後述） */}
                            <DiagCell /> {/* サービス提供 開始時刻 */}
                            <DiagCell /> {/* サービス提供 終了時刻 */}
                            <DiagCell /> {/* サービス提供 分 */}
                            <DiagCell /> {/* 控除 開始時刻 */}
                            <DiagCell /> {/* 控除 終了時刻 */}
                            <DiagCell /> {/* 控除 分 */}

                            <td className="right"><b>{sumPlanMin}</b></td>
                            <td className="right"><b>{sumUphitMin}</b></td>
                            <td className="right"><b>{sumOtherMin}</b></td>

                            <td className="right"><b>{sumSanteiHour}</b></td>
                            <DiagCell /> {/* 利用形態（合計行は斜線） */}
                            <td className="right"><b>{sumKatamichi}</b></td>
                            <td className="right"><b>{sumFutan}</b></td>

                            <DiagCell /> {/* サービス提供時間 開始時刻 */}
                            <DiagCell /> {/* サービス提供時間 終了時刻 */}
                            <DiagCell /> {/* サービス提供者名 */}
                            <DiagCell /> {/* 利用者確認欄 */}
                        </tr>
                    </tbody>
                </table>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
                <table className="grid" style={{ width: 120, tableLayout: "fixed" }}>
                    <tbody>
                        <tr>
                            <td className="center small">{pageNo}</td>
                            <td className="center small">枚中</td>
                            <td className="center small">{totalPages}</td>
                            <td className="center small">枚</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    );
}

