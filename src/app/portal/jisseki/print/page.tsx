"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type PrintPayload = {
    client: {
        kaipoke_cs_id: string;
        client_name: string;
        ido_jukyusyasho?: string | null; // ★追加
        // もし今後使うなら postal_code 等もここに追加できます
    };
    month: string; // YYYY-MM
    forms: Array<{
        formType: "TAKINO" | "KODO" | "DOKO" | "JYUHO" | "IDOU";
        service_codes: string[];
        // rows はシフト等の明細（必要に応じて拡張）
        rows: Array<{
            date: string;        // YYYY-MM-DD
            start: string;       // HH:mm
            end: string;         // HH:mm
            service_code?: string;          // ★追加：サービス内容（身体/家事/通院…）
            minutes?: number;
            required_staff_count?: number; // ★派遣人数
            staffNames?: string[];
            calc_hour?: number | null;
            cs_pay?: number | null;
            katamichi_addon?: 0 | 1;
        }>;
    }>;
};

type FormData = PrintPayload["forms"][number];

type FormProps = {
    data: PrintPayload;
    form: FormData;
    pageNo?: number;      // 1始まり（任意）
    totalPages?: number;  // 総枚数（任意）
};

const OFFICE_NO = "2360181545";
const OFFICE_NAME_LINES = ["合同会社施恩", "ファミーユヘルパーサービス", "名北"];
// 同行援護（様式19）用
const DOKO_OFFICE_NO = "2311100974";
const DOKO_OFFICE_NAME = "ﾌｧﾐｰﾕﾍﾙﾊﾟｰｻｰﾋﾞｽ愛知";
// 居宅介護（様式1）用（PDF要件）
const TAKINO_CONTRACT = "身体介護 13時間/月";
const TAKINO_JUKYUSHA_NO = ""; // 10桁（未連携なら空でOK）

// 重度訪問介護用（PDF要件）
const JYUHO_JUKYUSHA_NO = ""; // 10桁（未連携なら空）
const JYUHO_OFFICE_NO = "2311100974";
const JYUHO_OFFICE_NAME = "ﾌｧﾐｰﾕﾍﾙﾊﾟｰｻｰﾋﾞｽ愛知";
const JYUHO_CONTRACT_LINES = [
    "重度訪問介護（その他） 11時間/月",
    "重度訪問介護（移動介護） 10時間/月",
];

// 行動援護（様式2）用（PDF要件）
const KODO_JUKYUSHA_NO = ""; // 10桁（未連携なら空）
const KODO_CONTRACT = "行動援護 165時間/月";
const KODO_OFFICE_NO = "2311100974";
const KODO_OFFICE_NAME = "ﾌｧﾐｰﾕﾍﾙﾊﾟｰｻｰﾋﾞｽ愛知";

// 要件⑤：事業所番号は 2311100974、事業所名は「ﾌｧﾐｰﾕﾍﾙﾊﾟｰｻｰﾋﾞｽ愛知」
const TAKINO_OFFICE_NO = "2311100974";
const TAKINO_OFFICE_NAME = "ﾌｧﾐｰﾕﾍﾙﾊﾟｰｻｰﾋﾞｽ愛知";

// 受給者証番号はデータ連携が未定なら空文字でOK（表示は10桁枠のみ出ます）
const DOKO_JUKYUSHA_NO = ""; // 例: "2320600812"
const DOKO_CONTRACT = "同行援護 25時間/月";

// ★1ページあたりの明細行数（+10）
const ROWS_PER_PAGE = {
    TAKINO: 30,
    KODO: 31,
    DOKO: 31,
    JYUHO: 31,
    IDOU: 31,
} as const;

function DigitBoxes10({ value }: { value: string }) {
    const v = (value ?? "").replace(/\D/g, "").slice(0, 10).padEnd(10, " ");
    return (
        <div className="digits10" aria-label="10桁番号">
            {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="digitCell">{v[i] === " " ? "\u00A0" : v[i]}</div>
            ))}
        </div>
    );
}

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
    @page { size: A4; margin: 0mm; }
 @media print {
  .no-print { display: none !important; }
  .page-break { page-break-before: always; }

  /* p-6 の左右余白を確実に消す（全方向） */
  .print-only .p-6 {
    padding: 0 !important;
  }

  /* 追加：p-6 を持つページラッパー自体を幅いっぱいに */
  .print-only .p-6, 
  .print-only .page-break {
    width: 100% !important;
    box-sizing: border-box !important;
  }

  body { margin: 0 !important; }
  body * { visibility: hidden !important; }
  .print-only, .print-only * { visibility: visible !important; }

  /* ここが重要：210mm固定をやめて「印刷可能領域いっぱい」にする */
  .print-only {
    position: absolute;
    top: 0;
    left: 0;
    width: 100% !important;
    min-height: 297mm;
  }
}
    @media screen {
   /* 画面でもA4固定で表示（PC画面幅に追従しない） */
.print-only {
  width: 210mm;
  min-height: 297mm;
  margin: 0 auto;
  background: #fff;
}
      .screen-only { display: block; }
       /* ★追加：この文言を含む要素を印刷に出さない（暫定対策） */
    }

    /* ★帳票用 罫線・レイアウト */
    .formBox { border: 2px solid #000; }
    .box { border: 1px solid #000; }
    .grid { border-collapse: collapse; width: 100%; table-layout: fixed; }
    .grid th, .grid td { border: 1px solid #000; padding: 2px 4px; font-size: 11px; line-height: 1.2; vertical-align: middle; }
    + /* =========================
+    明細行をA4で安定させる：行高さ固定
+    ========================= */
+ :root{
+   --detail-row-h: 8.0mm; /* 小さくすると行数を増やせる（まずは 6.0mm 推奨） */
+ }
+ .detail-row > td{
+   height: var(--detail-row-h);
+   padding: 3px 4px;      /* 明細だけ少し詰める */
+   line-height: 1.2;     /* 文字で行が伸びるのを抑止 */
+   vertical-align: middle;
+ }
    .center { text-align: center; }
    .right { text-align: right; }
    .small { font-size: 10px; }
    .title { font-size: 14px; font-weight: 700; text-align: center; }
    .ido-grid { width: 100% !important; }
    .ido-grid { max-width: 100% !important; }

    /* セル内に文字を収める（枠外に出さない） */
.cell-wrap {
  display: block;
  height: 100%;
  overflow: hidden;
  white-space: normal;
  word-break: break-word;
}

/* 10桁：外枠なし、区切り線のみ */
.digits10 { display: grid; grid-template-columns: repeat(10, 1fr); height: 12px; }
.digitCell { display: flex; align-items: center; justify-content: center; }
.digitCell + .digitCell { border-left: 1px solid #000; } /* 区切り線のみ */

/* 斜線（右上→左下） */
.diag {
  position: relative;
  background:
    linear-gradient(to bottom left,
      transparent calc(50% - 0.5px),
      #000 calc(50% - 0.5px),
      #000 calc(50% + 0.5px),
      transparent calc(50% + 0.5px));
}

/* 縦書き見出し（例：日付・曜日） */
.vtext {
  writing-mode: vertical-rl;
  text-orientation: upright;
  line-height: 1;
  padding: 0 !important;
}

/* 同行援護：備考セル内の文字を確実に枠内に収める */
.biko-td {
  padding: 0 !important;      /* 余白であふれないように */
  overflow: hidden;           /* td側も一応 */
}

.biko-box {
  box-sizing: border-box;
  height: var(--detail-row-h);  /* 行の高さに合わせて固定 */
  padding: 2px 3px;             /* セル内余白 */
  overflow: hidden;             /* ここで確実にクリップ */
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  gap: 1px;
}

/* 1行ごとの表示。長い場合は折り返しても良いなら normal、折り返さず省略なら nowrap */
.biko-line {
  line-height: 1.05;
  white-space: normal;        /* 折り返す */
  word-break: break-word;     /* 日本語・英数字混在でも折る */
 overflow-wrap: anywhere;
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

            {/* ★印刷対象エリア：帳票だけ */}
            <div className="print-only">
                {data && (() => {
                    // rows を n 行ごとに分割
                    const chunk = <T,>(arr: T[], size: number): T[][] => {
                        const res: T[][] = [];
                        for (let i = 0; i < arr.length; i += size) res.push(arr.slice(i, i + size));
                        return res.length ? res : [[]];
                    };

                    // 「印刷ページ」の配列を作る（フォームが複数ページになる）
                    // ★2025年11月以降のみ（文字列 YYYY-MM-DD の比較でOK）
                    const FILTER_FROM = "2025-11-01";

                    const pages = data.forms.flatMap((f) => {
                        const size = ROWS_PER_PAGE[f.formType];

                        // ★ページ分割前にフィルタする（これで「改ページ」も正しくなる）
                        const rows = (f.rows ?? []).filter((r) => r.date >= FILTER_FROM);

                        const chunks = chunk(rows, size);

                        return chunks.map((rowsPage, pageIndex) => ({
                            formType: f.formType,
                            service_codes: f.service_codes,
                            rowsPage,
                            pageIndex,
                            pageCount: chunks.length,
                        }));
                    });

                    const totalPages = pages.length;

                    return pages.map((p, idx) => (
                        <div key={`${p.formType}-${idx}`} className={idx === 0 ? "p-6" : "p-6 page-break"}>
                            {p.formType === "TAKINO" && (
                                <TakinokyoForm
                                    data={data}
                                    form={{ formType: "TAKINO", service_codes: p.service_codes, rows: p.rowsPage }}
                                    pageNo={idx + 1}
                                    totalPages={totalPages}
                                />
                            )}

                            {p.formType === "KODO" && (
                                <KodoEngoForm
                                    data={data}
                                    form={{ formType: "KODO", service_codes: p.service_codes, rows: p.rowsPage }}
                                    pageNo={idx + 1}
                                    totalPages={totalPages}
                                />
                            )}

                            {p.formType === "DOKO" && (
                                <DokoEngoForm
                                    data={data}
                                    form={{ formType: "DOKO", service_codes: p.service_codes, rows: p.rowsPage }}
                                    pageNo={idx + 1}
                                    totalPages={totalPages}
                                />
                            )}

                            {p.formType === "JYUHO" && (
                                <JudoHommonForm
                                    data={data}
                                    form={{ formType: "JYUHO", service_codes: p.service_codes, rows: p.rowsPage }}
                                    pageNo={idx + 1}
                                    totalPages={totalPages}
                                />
                            )}

                            {p.formType === "IDOU" && (
                                <IdoShienForm
                                    data={data}
                                    form={{ formType: "IDOU", service_codes: p.service_codes, rows: p.rowsPage }}
                                    pageNo={idx + 1}
                                    totalPages={totalPages}
                                />
                            )}
                        </div>
                    ));
                })()}
            </div>
        </div>
    );
}

function TakinokyoForm({ data, form, pageNo = 1, totalPages = 1 }: FormProps) {
    return (
        <div className="formBox p-2">
            <div className="title">居宅介護サービス提供実績記録票（様式１）</div>

            {/* ★ズレ防止：ヘッダ＋明細を 1つの table に統合 */}
            <div className="mt-2">
                <table className="grid ido-grid" style={{ width: "100%", tableLayout: "fixed" }}>
                    {/* ★列数を固定（ズレの原因を排除） */}
                    <colgroup>
                        {/* 日付・曜日 */}
                        <col style={{ width: "3%" }} />
                        <col style={{ width: "3%" }} />

                        {/* サービス内容 */}
                        <col style={{ width: "12%" }} />

                        {/* 居宅介護計画（2列） */}
                        <col style={{ width: "7%" }} />
                        <col style={{ width: "7%" }} />

                        {/* サービス提供時間（2列） */}
                        <col style={{ width: "7%" }} />
                        <col style={{ width: "7%" }} />

                        {/* 算定時間数（2列：時間／乗降） */}
                        <col style={{ width: "5%" }} />
                        <col style={{ width: "5%" }} />

                        {/* 右側 */}
                        <col style={{ width: "4%" }} />  {/* 派遣人数 */}
                        <col style={{ width: "4%" }} />  {/* 初回加算 */}
                        <col style={{ width: "5%" }} />  {/* 緊急時対応加算 */}
                        <col style={{ width: "5%" }} />  {/* 福祉専門職員等連携加算 */}
                        <col style={{ width: "7%" }} />  {/* 利用者確認欄 */}
                        <col style={{ width: "19%" }} /> {/* 備考（必要ならここをさらに増やす） */}
                    </colgroup>

                    <tbody>
                        {/* =========================
                           上段（要件①〜⑤：5項目）
                           左：受給者証番号・氏名・契約支給量
                           右：事業所番号・事業者及びその事業所
                        ========================= */}

                        {/* 1行目：受給者証番号＋氏名（左）／事業所番号（右） */}
                        <tr>
                            {/* 左ブロック（受給者証番号＋氏名） */}
                            <td colSpan={11} className="small" style={{ padding: 0 }}>
                                <div style={{ display: "grid", gridTemplateColumns: "50% 50%" }}>
                                    {/* 受給者証番号（10桁、1桁ごと縦線） */}
                                    <div style={{ display: "grid", gridTemplateColumns: "36% 64%", borderRight: "1px solid #000" }}>
                                        <div style={{ borderRight: "1px solid #000", padding: "0px 3px" }}>
                                            受給者証<br />番号
                                        </div>
                                        <div style={{ padding: "0px 3px" }}>
                                            <DigitBoxes10 value={TAKINO_JUKYUSHA_NO} />
                                        </div>
                                    </div>

                                    {/* 氏名欄（左にラベル、右に氏名） */}
                                    <div style={{ display: "grid", gridTemplateColumns: "36% 64%" }}>
                                        <div style={{ borderRight: "1px solid #000", padding: "0px 3px", fontSize: "9px", lineHeight: 1.0 }}>
                                            支給決定障害者等氏名<br />（障害児氏名）
                                        </div>
                                        <div style={{ padding: "0px 6px", display: "flex", alignItems: "center" }}>
                                            {data.client.client_name}
                                        </div>
                                    </div>
                                </div>
                            </td>

                            {/* 右ブロック：事業所番号（10桁、1桁ごと縦線） */}
                            <td colSpan={6} className="small" style={{ padding: 0 }}>
                                <div style={{ display: "grid", gridTemplateColumns: "35% 65%" }}>
                                    <div style={{ borderRight: "1px solid #000", padding: "0px 3px" }}>
                                        事業所番号
                                    </div>
                                    <div style={{ padding: "0px 3px" }}>
                                        <DigitBoxes10 value={TAKINO_OFFICE_NO} />
                                    </div>
                                </div>
                            </td>
                        </tr>

                        {/* 2行目：契約支給量（左：受給者証番号＋氏名の幅）／事業者及びその事業所（右） */}
                        <tr>
                            {/* 契約支給量：左側ブロックの横幅いっぱい */}
                            <td colSpan={11} className="small" style={{ padding: 0 }}>
                                <div style={{ display: "grid", gridTemplateColumns: "20% 80%" }}>
                                    <div style={{ borderRight: "1px solid #000", padding: "1px 3px" }}>
                                        契約支給量
                                    </div>
                                    <div style={{ padding: "1px 6px", display: "flex", alignItems: "center" }}>
                                        {TAKINO_CONTRACT}
                                    </div>
                                </div>
                            </td>

                            {/* 事業者及びその事業所 */}
                            <td colSpan={6} className="small" style={{ padding: 0 }}>
                                <div style={{ display: "grid", gridTemplateColumns: "35% 65%" }}>
                                    <div style={{ borderRight: "1px solid #000", padding: "1px 3px" }}>
                                        事業者及び<br />その事業所
                                    </div>
                                    <div style={{ padding: "1px 6px", display: "flex", alignItems: "center" }}>
                                        {TAKINO_OFFICE_NAME}
                                    </div>
                                </div>
                            </td>
                        </tr>

                        {/* ヘッダと明細の間の余白（PDF見た目調整） */}
                        <tr>
                            <td colSpan={17} style={{ border: "none", padding: 0, height: "6px" }} />
                        </tr>

                        {/* =========================
                           下段：列見出し（2段）
                           ※日付・曜日は縦書き（要件）
                        ========================= */}
                        {/* ===== 見出し 1段目 ===== */}
                        <tr>
                            <th className="center vtext" rowSpan={3}>日付</th>
                            <th className="center vtext" rowSpan={3}>曜日</th>
                            <th className="center" rowSpan={3}>サービス内容</th>

                            <th className="center" colSpan={4}>居宅介護計画</th>
                            <th className="center" colSpan={2}>サービス提供時間</th>
                            <th className="center" colSpan={2}>算定時間数</th>

                            <th className="center" rowSpan={3}>派遣<br />人数</th>
                            <th className="center" rowSpan={3}>初回<br />加算</th>
                            <th className="center" rowSpan={3}>緊急時<br />対応加算</th>
                            <th className="center" rowSpan={3} style={{ fontSize: "9px", lineHeight: 1.05 }}>
                                福祉専門職員等<br />連携加算
                            </th>
                            <th className="center" rowSpan={3}>利用者<br />確認欄</th>
                            <th className="center" rowSpan={3}>備考</th>
                        </tr>

                        {/* ===== 見出し 2段目 ===== */}
                        <tr>
                            {/* 居宅介護計画（左2列は2行分） */}
                            <th className="center" rowSpan={2}>開始時間</th>
                            <th className="center" rowSpan={2}>終了時間</th>
                            <th className="center" colSpan={2}>計画時間数</th>

                            {/* サービス提供時間（2列・2行分） */}
                            <th className="center" rowSpan={2}>開始時間</th>
                            <th className="center" rowSpan={2}>終了時間</th>

                            {/* 算定時間数（2列・2行分） */}
                            <th className="center" rowSpan={2}>時間</th>
                            <th className="center" rowSpan={2}>乗降</th>

                        </tr>

                        {/* ===== 見出し 3段目 ===== */}
                        <tr>
                            {/* 計画時間数の下（1行） */}
                            <th className="center">時間</th>
                            <th className="center">乗降</th>
                        </tr>

                        {/* 明細行（例：25行） */}
                        {(() => {
                            const weekdayJp = (dateStr: string) => {
                                const d = new Date(`${dateStr}T00:00:00`);
                                return ["日", "月", "火", "水", "木", "金", "土"][d.getDay()] ?? "";
                            };

                            const dayOfMonth = (dateStr: string) => {
                                const d = new Date(`${dateStr}T00:00:00`);
                                return String(d.getDate());
                            };

                            const hoursText = (r: { start: string; end: string; minutes?: number }) => {
                                const mins =
                                    typeof r.minutes === "number"
                                        ? r.minutes
                                        : (() => {
                                            const [sh, sm] = r.start.split(":").map(Number);
                                            const [eh, em] = r.end.split(":").map(Number);
                                            const s = sh * 60 + sm;
                                            const e = eh * 60 + em;
                                            return e >= s ? e - s : e + 24 * 60 - s;
                                        })();

                                const h = mins / 60;
                                const t = (Math.round(h * 10) / 10).toString();
                                return t.replace(/\.0$/, ""); // 2.0 -> "2"
                            };

                            const displayServiceLabel = (serviceCode?: string) => {
                                const s = serviceCode ?? "";

                                if (s === "身体") return "身体";
                                if (s === "家事") return "家事";

                                // 表記ゆれ対応： () と （） の両方を許容
                                if (s === "通院(伴う)" || s === "通院（伴う）") return "通院（伴う）";
                                if (s === "通院(伴ず)" || s === "通院（伴わず）" || s === "通院（伴ず）") return "通院（伴わず）";

                                // 4種以外は空欄（必要なら s をそのまま返す運用に変更可）
                                return "";
                            };

                            const src = (form?.rows ?? [])
                                .slice()
                                .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));

                            const MAX = ROWS_PER_PAGE.TAKINO;

                            const padded = [
                                ...src,
                                ...Array.from({ length: Math.max(0, MAX - src.length) }).map(() => null),
                            ].slice(0, MAX);

                            return padded.map((r, i) => {
                                if (!r) {
                                    return (
                                        <tr key={`blank-${i}`} className="detail-row">
                                            {Array.from({ length: 17 }).map((__, j) => (
                                                <td key={j}>&nbsp;</td>
                                            ))}
                                        </tr>
                                    );
                                }

                                const dispatch = r.required_staff_count ?? 1;

                                return (
                                    <tr key={`row-${i}`} className="detail-row">
                                        {/* 日付 */}
                                        <td className="center">{dayOfMonth(r.date)}</td>
                                        {/* 曜日 */}
                                        <td className="center">{weekdayJp(r.date)}</td>

                                        {/* サービス内容（4種のみ表示） */}
                                        <td className="center">{displayServiceLabel(r.service_code)}</td>

                                        {/* 居宅介護計画：開始/終了/計画時間数（時間） */}
                                        <td className="center">{r.start}</td>
                                        <td className="center">{r.end}</td>
                                        <td className="center">{hoursText(r)}</td>

                                        {/* 居宅介護計画：乗降は要望外なので空 */}
                                        <td>&nbsp;</td>

                                        {/* 以降の列（提供時間、算定、加算等）は要望外なので空のまま */}
                                        <td>&nbsp;</td>
                                        <td>&nbsp;</td>
                                        <td>&nbsp;</td>
                                        <td>&nbsp;</td>

                                        {/* 派遣人数 */}
                                        <td className="center">{dispatch}</td>

                                        {/* 初回加算 */}
                                        <td>&nbsp;</td>

                                        {/* 緊急時対応加算 */}
                                        <td>&nbsp;</td>

                                        {/* 福祉専門職員等連携加算 */}
                                        <td>&nbsp;</td>

                                        {/* 利用者確認欄 */}
                                        <td>&nbsp;</td>

                                        {/* 備考 ← ここに担当者名 */}
                                        <td className="small">
                                            {(r.staffNames?.filter(Boolean).join("／")) || "\u00A0"}
                                        </td>
                                    </tr>
                                );
                            });
                        })()}
                        {/* ===== 合計欄（画像どおり：7行） ===== */}
                        {(() => {
                            const sumLabels = [
                                "居宅における身体介護",
                                "通院介護（身体介護を伴う）",
                                "家事援助",
                                "通院介護（身体介護を伴わない）",
                                "通院等乗降介助",
                            ];

                            // ===== 追加：計画時間数（時間）のサービス別合計 =====
                            const getMinutes = (r: { start: string; end: string; minutes?: number }) => {
                                if (typeof r.minutes === "number") return r.minutes;
                                const [sh, sm] = r.start.split(":").map(Number);
                                const [eh, em] = r.end.split(":").map(Number);
                                const s = sh * 60 + sm;
                                const e = eh * 60 + em;
                                return e >= s ? e - s : e + 24 * 60 - s;
                            };

                            const fmtHours = (mins: number) => {
                                const h = mins / 60;
                                const t = (Math.round(h * 10) / 10).toString();
                                return t.replace(/\.0$/, "");
                            };

                            const toSumLabel = (serviceCode?: string) => {
                                const s = serviceCode ?? "";
                                if (s === "身体") return "居宅における身体介護";
                                if (s === "家事") return "家事援助";
                                if (s === "通院(伴う)" || s === "通院（伴う）") return "通院介護（身体介護を伴う）";
                                if (s === "通院(伴ず)" || s === "通院（伴わず）" || s === "通院（伴ず）")
                                    return "通院介護（身体介護を伴わない）";
                                return null;
                            };

                            const sumMinutesByLabel: Record<string, number> = {};
                            (form?.rows ?? []).forEach((r) => {
                                const label = toSumLabel(r.service_code);
                                if (!label) return;
                                const mins = getMinutes(r);
                                sumMinutesByLabel[label] = (sumMinutesByLabel[label] ?? 0) + mins;
                            });

                            const sumHoursByLabel: Record<string, string> = {};
                            Object.entries(sumMinutesByLabel).forEach(([label, mins]) => {
                                sumHoursByLabel[label] = fmtHours(mins);
                            });

                            return (
                                <>
                                    {/* 1行目（上段） */}
                                    <tr>
                                        {/* 日付列：縦書き「合計」 7行分 */}
                                        <td className="center vtext" rowSpan={7}><b>合計</b></td>

                                        {/* 左側の大きいブロック（画像の左の大枠：上2行は斜線） 
            ※「居宅介護計画の終了時間の枠まで」のイメージで
            [曜日][サービス内容][計画開始][計画終了] の4列を結合 */}
                                        <td colSpan={4} rowSpan={2} className="diag">&nbsp;</td>

                                        {/* 計画時間数計：計画の「時間」「乗降」(2列) を使って、上2行結合 */}
                                        <td colSpan={2} rowSpan={2} className="center small">
                                            <b>計画<br />時間数計</b>
                                        </td>

                                        {/* 内訳（適用単価別）：サービス提供時間(2列) を使って上1行 */}
                                        <td colSpan={2} className="center small">
                                            <b>内訳（適用単価別）</b>
                                        </td>

                                        {/* 算定時間数計：算定の「時間」「乗降」(2列) を使って、上2行結合 */}
                                        <td colSpan={2} rowSpan={2} className="center small">
                                            <b>算定<br />時間数計</b>
                                        </td>

                                        {/* 右側の残り（派遣人数/初回/緊急/連携/確認/備考）
            ここは画像だと斜線や「回」等が入るが、まず枠を7行分確保する。
            → 今回は上2行は縦結合にして見出し領域の高さを揃える（必要に応じて調整可） */}
                                        {/* 右側（派遣人数/初回/緊急/連携/確認/備考）— 上2行は全部斜線 */}
                                        <td rowSpan={2} className="diag">&nbsp;</td> {/* 派遣人数 */}
                                        <td rowSpan={2} className="diag">&nbsp;</td> {/* 初回加算 */}
                                        <td rowSpan={2} className="diag">&nbsp;</td> {/* 緊急時対応加算 */}
                                        <td rowSpan={2} className="diag">&nbsp;</td> {/* 福祉専門職員等連携加算 */}
                                        <td rowSpan={2} className="diag">&nbsp;</td> {/* 利用者確認欄 */}
                                        <td rowSpan={2} className="diag">&nbsp;</td> {/* 備考 */}
                                    </tr>

                                    {/* 2行目（上段：100/90/70/重訪） */}
                                    <tr>
                                        {/* サービス提供時間(2列)のセル内を4分割して「100/90/70/重訪」を作る */}
                                        <td colSpan={2} style={{ padding: 0 }}>
                                            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", height: "100%" }}>
                                                <div className="center small" style={{ borderRight: "1px solid #000" }}><b>100%</b></div>
                                                <div className="center small" style={{ borderRight: "1px solid #000" }}><b>90%</b></div>
                                                <div className="center small" style={{ borderRight: "1px solid #000" }}><b>70%</b></div>
                                                <div className="center small"><b>重訪</b></div>
                                            </div>
                                        </td>
                                    </tr>

                                    {/* 3〜7行目：サービス区分（5行） */}
                                    {sumLabels.map((label, i) => (
                                        <tr key={`sum-${i}`}>
                                            {/* 左側ブロック：サービス区分名（4列ぶん） */}
                                            <td colSpan={4} className="center small">{label}</td>
                                            {/* 計画時間数計（時間/乗降） */}
                                            {/* 時間：通院等乗降介助のみ斜線。斜線でない行に合計値を入れる */}
                                            <td className={label === "通院等乗降介助" ? "diag" : "right"}>
                                                {label === "通院等乗降介助" ? "\u00A0" : (sumHoursByLabel[label] ?? "\u00A0")}
                                            </td>

                                            {/* 乗降：通院等乗降介助以外は斜線（ここは値を入れないので現状のまま空欄） */}
                                            <td className={label !== "通院等乗降介助" ? "diag" : ""}>&nbsp;</td>

                                            {/* 内訳（適用単価別） 4列：100/90/70/重訪 */}
                                            <td colSpan={2} style={{ padding: 0 }}>
                                                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", height: "100%" }}>
                                                    {/* 100%：指定なし（空欄） */}
                                                    <div style={{ borderRight: "1px solid #000" }}>&nbsp;</div>

                                                    {/* 90%：
        居宅における身体介護／通院介護（身体介護を伴う） に斜線 */}
                                                    <div
                                                        className={
                                                            (label === "居宅における身体介護" ||
                                                                label === "通院介護（身体介護を伴う）")
                                                                ? "diag"
                                                                : ""
                                                        }
                                                        style={{ borderRight: "1px solid #000" }}
                                                    >
                                                        &nbsp;
                                                    </div>

                                                    {/* 70%：
        家事援助／通院介護（身体介護を伴わない）／通院等乗降介助 に斜線 */}
                                                    <div
                                                        className={
                                                            (label === "家事援助" ||
                                                                label === "通院介護（身体介護を伴わない）" ||
                                                                label === "通院等乗降介助")
                                                                ? "diag"
                                                                : ""
                                                        }
                                                        style={{ borderRight: "1px solid #000" }}
                                                    >
                                                        &nbsp;
                                                    </div>

                                                    {/* 重訪：
        家事援助／通院介護（身体介護を伴わない）／通院等乗降介助 に斜線 */}
                                                    <div
                                                        className={
                                                            (label === "家事援助" ||
                                                                label === "通院介護（身体介護を伴わない）" ||
                                                                label === "通院等乗降介助")
                                                                ? "diag"
                                                                : ""
                                                        }
                                                    >
                                                        &nbsp;
                                                    </div>
                                                </div>
                                            </td>

                                            {/* 算定時間数計（時間/乗降） */}
                                            <td className={label === "通院等乗降介助" ? "diag" : ""}>&nbsp;</td>
                                            <td className={label !== "通院等乗降介助" ? "diag" : ""}>&nbsp;</td>

                                            {/* 派遣人数：7行すべて斜線 */}
                                            <td className="diag">&nbsp;</td>

                                            {/* 初回加算／緊急時対応加算／福祉専門職員等連携加算
    下5行（3〜7行目）を各列1マス（rowSpan=5）にして「回」 */}
                                            {i === 0 ? (
                                                <>
                                                    <td className="center" rowSpan={5}>回</td> {/* 初回加算：下5行を1マス */}
                                                    <td className="center" rowSpan={5}>回</td> {/* 緊急時対応加算：下5行を1マス */}
                                                    <td className="center" rowSpan={5}>回</td> {/* 福祉専門職員等連携加算：下5行を1マス */}
                                                </>
                                            ) : null}

                                            {/* 利用者確認欄/備考：7行すべて斜線（下5行も各行で斜線） */}
                                            <td className="diag">&nbsp;</td>
                                            <td className="diag">&nbsp;</td>
                                        </tr>
                                    ))}
                                </>
                            );
                        })()}
                        {/* ページ数（PDF右下の「1枚中1枚」相当） */}
                        <tr>
                            <td colSpan={17} style={{ border: "none", paddingTop: "6px" }}>
                                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                                    <div style={{ width: "40mm" }}>
                                        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)" }}>
                                            <div className="center" style={{ border: "1px solid #000" }}>{pageNo}</div>
                                            <div className="center" style={{ border: "1px solid #000" }}>枚中</div>
                                            <div className="center" style={{ border: "1px solid #000" }}>{totalPages}</div>
                                            <div className="center" style={{ border: "1px solid #000" }}>枚</div>
                                        </div>
                                    </div>
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function KodoEngoForm({ data, form, pageNo = 1, totalPages = 1 }: FormProps) {
    // 計画時間数計：rows.minutes を「時間」に換算して合計（小数1桁まで）
    // minutes が無い行でも、start/end から分数を算出する
    const FILTER_FROM = "2025-11-01";
    const getMinutes = (r: { start: string; end: string; minutes?: number }) => {
        if (typeof r.minutes === "number") return r.minutes;

        const [sh, sm] = r.start.split(":").map(Number);
        const [eh, em] = r.end.split(":").map(Number);
        const s = sh * 60 + sm;
        const e = eh * 60 + em;

        // 日跨ぎ対応（end <= start の場合は翌日扱い）
        return e >= s ? e - s : e + 24 * 60 - s;
    };

    const fmtHours = (mins: number) => {
        const h = mins / 60;
        const t = (Math.round(h * 10) / 10).toString(); // 小数1桁
        return t.replace(/\.0$/, "");                   // 2.0 -> "2"
    };

    // 計画時間数計：minutes（無ければstart/end差分）を合計して時間へ
    const sumPlanMin = (form?.rows ?? [])
        .filter(r => r.date >= FILTER_FROM)   // ★ここも同じ条件
        .reduce((a, r) => a + getMinutes(r), 0);
    const sumPlanHours = fmtHours(sumPlanMin);

    // 算定時間数計：要件どおり計画時間数と同じでOK
    const sumSanteiHours = sumPlanHours;
    // ▼▼▼ 追加ここから：日付/曜日表示 + 31行に揃える ▼▼▼
    const weekdayJp = (dateStr: string) => {
        const d = new Date(`${dateStr}T00:00:00`);
        return ["日", "月", "火", "水", "木", "金", "土"][d.getDay()] ?? "";
    };

    const dayOfMonth = (dateStr: string) => {
        const d = new Date(`${dateStr}T00:00:00`);
        return String(d.getDate());
    };

    // 明細用：日付+開始時刻でソートし、31行にパディング

    const src = (form?.rows ?? [])
        .filter(r => r.date >= FILTER_FROM)   // ★追加：2025年11月以降のみ
        .slice()
        .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));

    const MAX = ROWS_PER_PAGE.KODO;

    const padded: Array<(typeof src)[number] | null> = [
        ...src,
        ...Array.from({ length: Math.max(0, MAX - src.length) }).map(() => null),
    ].slice(0, MAX);
    // ▲▲▲ 追加ここまで ▲▲▲
    return (
        <div className="formBox p-2">
            {/* タイトル行（PDF寄せ：左右に小枠がある体裁） */}
            <div style={{ display: "flex", alignItems: "flex-end" }}>
                <div style={{ flex: 1 }} className="small">
                    {data.month}分
                </div>
                <div style={{ flex: 2 }} className="title">
                    行動援護サービス提供実績記録票
                </div>
                <div style={{ flex: 1 }} className="small right">
                    （様式２）
                </div>
            </div>

            {/* ★ヘッダ＋明細を 1つの table に統合（ズレ防止） */}
            <div className="mt-2">
                <table className="grid ido-grid" style={{ width: "100%", tableLayout: "fixed" }}>
                    {/* 明細14列で固定（PDFの縦罫に合わせる） */}
                    <colgroup>
                        <col style={{ width: "5%" }} />  {/* 日付 */}
                        <col style={{ width: "5%" }} />  {/* 曜日 */}

                        <col style={{ width: "8%" }} />  {/* 計画開始 */}
                        <col style={{ width: "8%" }} />  {/* 計画終了 */}
                        <col style={{ width: "7%" }} />  {/* 計画時間数 */}

                        <col style={{ width: "8%" }} />  {/* 提供開始 */}
                        <col style={{ width: "8%" }} />  {/* 提供終了 */}

                        <col style={{ width: "7%" }} />  {/* 算定時間 */}
                        <col style={{ width: "6%" }} />  {/* 派遣人数 */}

                        <col style={{ width: "6%" }} />  {/* 初回加算 */}
                        <col style={{ width: "7%" }} />  {/* 緊急時対応加算 */}
                        <col style={{ width: "9%" }} />  {/* 行動障害支援指導連携加算 */}

                        <col style={{ width: "9%" }} />  {/* 利用者確認欄 */}
                        <col style={{ width: "15%" }} /> {/* 備考 */}
                    </colgroup>

                    <tbody>
                        {/* =========================
              上段ヘッダ（①〜④）
              左：受給者証番号・氏名・契約支給量
              右：事業所番号・事業者及びその事業所
              ※colSpan 合計は常に 14 にする
            ========================= */}

                        {/* 1行目：受給者証番号＋氏名（左）／事業所番号（右） */}
                        <tr>
                            <td colSpan={9} className="small" style={{ padding: 0 }}>
                                <div style={{ display: "grid", gridTemplateColumns: "50% 50%" }}>
                                    {/* ①受給者証番号：10桁（1桁ごと縦線） */}
                                    <div style={{ display: "grid", gridTemplateColumns: "36% 64%", borderRight: "1px solid #000" }}>
                                        <div style={{ borderRight: "1px solid #000", padding: "1px 3px" }}>
                                            受給者証<br />番号
                                        </div>
                                        <div style={{ padding: "1px 3px" }}>
                                            <DigitBoxes10 value={KODO_JUKYUSHA_NO} />
                                        </div>
                                    </div>

                                    {/* ②氏名欄：左にラベル（改行2行）、右に氏名 */}
                                    <div style={{ display: "grid", gridTemplateColumns: "36% 64%" }}>
                                        <div style={{ borderRight: "1px solid #000", padding: "1px 3px", fontSize: "9px", lineHeight: 1.05 }}>
                                            支給決定障害者等氏名<br />（障害児氏名）
                                        </div>
                                        <div style={{ padding: "1px 6px", display: "flex", alignItems: "center" }}>
                                            {data.client.client_name}
                                        </div>
                                    </div>
                                </div>
                            </td>

                            {/* ④事業所番号（右） */}
                            <td colSpan={5} className="small" style={{ padding: 0 }}>
                                <div style={{ display: "grid", gridTemplateColumns: "35% 65%" }}>
                                    <div style={{ borderRight: "1px solid #000", padding: "1px 3px" }}>
                                        事業所番号
                                    </div>
                                    <div style={{ padding: "1px 3px" }}>
                                        <DigitBoxes10 value={KODO_OFFICE_NO} />
                                    </div>
                                </div>
                            </td>
                        </tr>

                        {/* 2行目：③契約支給量（左）／④事業者及びその事業所（右） */}
                        <tr>
                            <td colSpan={9} className="small" style={{ padding: 0 }}>
                                <div style={{ display: "grid", gridTemplateColumns: "20% 80%" }}>
                                    <div style={{ borderRight: "1px solid #000", padding: "1px 3px" }}>
                                        契約支給量
                                    </div>
                                    <div style={{ padding: "1px 6px", display: "flex", alignItems: "center" }}>
                                        {KODO_CONTRACT}
                                    </div>
                                </div>
                            </td>

                            <td colSpan={5} className="small" style={{ padding: 0 }}>
                                <div style={{ display: "grid", gridTemplateColumns: "35% 65%" }}>
                                    <div style={{ borderRight: "1px solid #000", padding: "1px 3px" }}>
                                        事業者及び<br />その事業所
                                    </div>
                                    <div style={{ padding: "1px 6px", display: "flex", alignItems: "center" }}>
                                        {KODO_OFFICE_NAME}
                                    </div>
                                </div>
                            </td>
                        </tr>

                        {/* ヘッダと明細の間の余白（見た目調整） */}
                        <tr>
                            <td colSpan={14} style={{ border: "none", padding: 0, height: "6px" }} />
                        </tr>

                        {/* =========================
              明細見出し（⑤：ズレ防止＝列数14を厳密一致）
            ========================= */}
                        <tr>
                            <th className="center" rowSpan={2}>日付</th>
                            <th className="center" rowSpan={2}>曜日</th>

                            <th className="center" colSpan={3}>行動援護計画</th>
                            <th className="center" colSpan={2}>サービス提供時間</th>

                            <th className="center" rowSpan={2}>算定時間</th>
                            <th className="center" rowSpan={2}>派遣人数</th>

                            <th className="center" rowSpan={2}>初回加算</th>
                            <th className="center" rowSpan={2}>緊急時<br />対応加算</th>
                            <th className="center" rowSpan={2} style={{ fontSize: "9px", lineHeight: 1.05 }}>
                                行動障害支援<br />指導連携加算
                            </th>

                            <th className="center" rowSpan={2}>利用者<br />確認欄</th>
                            <th className="center" rowSpan={2}>備考</th>
                        </tr>

                        <tr>
                            <th className="center">開始時間</th>
                            <th className="center">終了時間</th>
                            <th className="center">計画<br />時間数</th>

                            <th className="center">開始時間</th>
                            <th className="center">終了時間</th>
                        </tr>

                        {/* 明細行（rowsを表示＋不足分は空行） */}
                        {padded.map((r, i) => {
                            if (!r) {
                                return (
                                    <tr key={`blank-${i}`} className="detail-row">
                                        {Array.from({ length: 14 }).map((__, j) => (
                                            <td key={j}>&nbsp;</td>
                                        ))}
                                    </tr>
                                );
                            }

                            const mins = getMinutes(r);
                            const hours = fmtHours(mins);
                            const dispatch = r.required_staff_count ?? 1;

                            return (
                                <tr key={`row-${i}`} className="detail-row">
                                    <td className="center">{dayOfMonth(r.date)}</td>
                                    <td className="center">{weekdayJp(r.date)}</td>

                                    <td className="center">{r.start}</td>
                                    <td className="center">{r.end}</td>
                                    <td className="center">{hours}</td>

                                    <td className="center">{r.start}</td>
                                    <td className="center">{r.end}</td>

                                    <td className="center">{hours}</td>

                                    <td className="center">{dispatch}</td>

                                    <td>&nbsp;</td>
                                    <td>&nbsp;</td>
                                    <td>&nbsp;</td>
                                    <td>&nbsp;</td>

                                    {/* 備考：担当者名（staffNames があれば表示） */}
                                    <td className="small">
                                        {(r.staffNames?.filter(Boolean).join("／")) || "\u00A0"}
                                    </td>
                                </tr>
                            );
                        })}

                        {/* ===== 追加：最下部 合計（2行） ===== */}
                        <tr>
                            {/* 「日付」〜「行動援護計画の下の終了時間」までを結合して1マス
      → 日付(1) + 曜日(1) + 計画開始(1) + 計画終了(1) = 4列
      2行分なので rowSpan=2 */}
                            <td className="center" colSpan={4} rowSpan={2}>
                                <b>合計</b>
                            </td>

                            {/* 計画時間数：2行（上=ラベル、下=合計値） */}
                            <td className="center small">
                                <b>計画時間数計</b>
                            </td>

                            {/* サービス提供時間（開始/終了）は斜線：2行分 */}
                            <td className="diag" rowSpan={2}>&nbsp;</td>
                            <td className="diag" rowSpan={2}>&nbsp;</td>

                            {/* 算定時間：2行（上=ラベル、下=合計値） */}
                            <td className="center small">
                                <b>算定時間数計</b>
                            </td>

                            {/* 派遣人数：斜線 */}
                            <td className="diag" rowSpan={2}>&nbsp;</td>

                            {/* 初回加算 / 緊急時対応加算 / 行動障害支援指導連携加算：2行結合して「回」 */}
                            <td className="center" rowSpan={2}><b>回</b></td>
                            <td className="center" rowSpan={2}><b>回</b></td>
                            <td className="center" rowSpan={2}><b>回</b></td>

                            {/* 利用者確認欄 / 備考：斜線 */}
                            <td className="diag" rowSpan={2}>&nbsp;</td>
                            <td className="diag" rowSpan={2}>&nbsp;</td>
                        </tr>

                        <tr>
                            {/* 計画時間数（下段：合計値） */}
                            <td className="right"><b>{sumPlanHours}</b></td>

                            {/* 算定時間（下段：合計値） */}
                            <td className="right"><b>{sumSanteiHours}</b></td>
                        </tr>

                        {/* ページ数（PDF右下の「○枚中○枚」相当） */}
                        <tr>
                            <td colSpan={14} style={{ border: "none", paddingTop: "6px" }}>
                                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                                    <div style={{ width: "40mm" }}>
                                        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)" }}>
                                            <div className="center" style={{ border: "1px solid #000" }}>{pageNo}</div>
                                            <div className="center" style={{ border: "1px solid #000" }}>枚中</div>
                                            <div className="center" style={{ border: "1px solid #000" }}>{totalPages}</div>
                                            <div className="center" style={{ border: "1px solid #000" }}>枚</div>
                                        </div>
                                    </div>
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function DokoEngoForm({ data, form, pageNo = 1, totalPages = 1 }: FormProps) {
    const FILTER_FROM = "2025-11-01";

    const getMinutes = (r: { start: string; end: string; minutes?: number }) => {
        if (typeof r.minutes === "number") return r.minutes;
        const [sh, sm] = r.start.split(":").map(Number);
        const [eh, em] = r.end.split(":").map(Number);
        const s = sh * 60 + sm;
        const e = eh * 60 + em;
        return e >= s ? e - s : e + 24 * 60 - s; // 日跨ぎ対応
    };

    const fmtHours = (mins: number) => {
        const h = mins / 60;
        const t = (Math.round(h * 10) / 10).toString();
        return t.replace(/\.0$/, "");
    };

    // 2025-11-01 以降のみ
    const src = (form?.rows ?? [])
        .filter((r) => r.date >= FILTER_FROM)
        .slice()
        .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));

    // 合計（計画時間数計）
    const sumPlanMin = src.reduce((a, r) => a + getMinutes(r), 0);
    const sumPlanHours = fmtHours(sumPlanMin);

    // 要望：算定時間数計も計画時間数計と同じ
    const sumSanteiHours = sumPlanHours;

    return (
        <div className="formBox p-2">
            {/* タイトル行（PDFは右上に(様式19)表記） */}
            <div style={{ display: "flex", alignItems: "flex-end", width: "100%" }}>
                <div style={{ flex: 1 }} className="small">
                    令和7年12月分
                </div>
                <div style={{ flex: 2 }} className="title">
                    同行援護サービス提供実績記録票
                </div>
                <div style={{ flex: 1 }} className="small right">
                    （様式19）
                </div>
            </div>

            {/* ★ヘッダ＋明細を “1つの table” に統合（ズレ防止） */}
            <div className="mt-2">
                <table className="grid ido-grid" style={{ width: "100%", tableLayout: "fixed" }}>
                    {/* 同行援護：14列で固定（列数不一致による「はみ出し」を防止） */}
                    <colgroup>
                        {/* 日付・曜日 */}
                        <col style={{ width: "3%" }} />
                        <col style={{ width: "3%" }} />

                        {/* サービス内容 */}
                        <col style={{ width: "12%" }} />

                        {/* 同行援護計画（開始/終了/時間）= 3列 */}
                        <col style={{ width: "7%" }} />
                        <col style={{ width: "7%" }} />
                        <col style={{ width: "3%" }} />

                        {/* サービス提供時間（開始/終了）= 2列 */}
                        <col style={{ width: "7%" }} />
                        <col style={{ width: "6%" }} />

                        {/* 算定時間（時間）= 1列 */}
                        <col style={{ width: "3%" }} />

                        {/* 派遣人数・初回・緊急・利用者確認・備考 */}
                        <col style={{ width: "3%" }} />   {/* 派遣人数 */}
                        <col style={{ width: "3%" }} />   {/* 初回加算 */}
                        <col style={{ width: "4%" }} />   {/* 緊急時対応加算 */}
                        <col style={{ width: "6%" }} />   {/* 利用者確認欄 */}
                        <col style={{ width: "33%" }} />  {/* 備考（担当者名を入れる） */}
                    </colgroup>

                    <tbody>
                        {/* ===== 上段ヘッダ枠（PDF上部の大枠） ===== */}
                        {/* 1行目：受給者証番号（左）＋氏名（右） ／ 右ブロック：事業所番号（縦幅を小さくするため、この行にのみ置く） */}
                        <tr>
                            {/* 左ブロック（8/14）：2列横並び */}
                            <td colSpan={9} className="small" style={{ padding: 0 }}>
                                <div style={{ display: "grid", gridTemplateColumns: "50% 50%" }}>
                                    {/* 受給者証番号 */}
                                    <div style={{ display: "grid", gridTemplateColumns: "36% 64%", borderRight: "1px solid #000" }}>
                                        <div style={{ borderRight: "1px solid #000", padding: "1px 3px" }}>
                                            受給者証<br />番号
                                        </div>
                                        <div style={{ padding: "1px 3px" }}>
                                            <DigitBoxes10 value={DOKO_JUKYUSHA_NO} />
                                        </div>
                                    </div>

                                    {/* 氏名 */}
                                    <div style={{ display: "grid", gridTemplateColumns: "36% 64%" }}>
                                        <div style={{ borderRight: "1px solid #000", padding: "1px 3px", fontSize: "9px", lineHeight: 1.05 }}>
                                            支給決定障害者等氏名<br />（障害児氏名）
                                        </div>
                                        <div style={{ padding: "2px 6px", display: "flex", alignItems: "center" }}>
                                            {data.client.client_name}
                                        </div>
                                    </div>
                                </div>
                            </td>

                            {/* 右ブロック（6/14）：事業所番号（この行だけ＝縦幅が小さくなる） */}
                            <td colSpan={5} className="small" style={{ padding: 0 }}>
                                <div style={{ display: "grid", gridTemplateColumns: "35% 65%" }}>
                                    <div style={{ borderRight: "1px solid #000", padding: "1px 3px" }}>
                                        事業所番号
                                    </div>
                                    <div style={{ padding: "1px 3px" }}>
                                        <DigitBoxes10 value={DOKO_OFFICE_NO} />
                                    </div>
                                </div>
                            </td>
                        </tr>

                        {/* 2行目：契約支給量（左ブロックは横一杯） ／ 右ブロック：事業者及びその事業所（こちらの方が縦幅大きくなる） */}
                        <tr>
                            {/* 左ブロック（8/14）：契約支給量（横一杯） */}
                            <td colSpan={9} className="small" style={{ padding: 0 }}>
                                <div style={{ display: "grid", gridTemplateColumns: "18% 82%" }}>
                                    <div style={{ borderRight: "1px solid #000", padding: "1px 3px" }}>
                                        契約支給量
                                    </div>
                                    <div style={{ padding: "1px 3px", display: "flex", alignItems: "center" }}>
                                        {DOKO_CONTRACT}
                                    </div>
                                </div>
                            </td>

                            {/* 右ブロック（6/14）：事業者及びその事業所 */}
                            <td colSpan={5} className="small" style={{ padding: 0 }}>
                                <div style={{ display: "grid", gridTemplateColumns: "35% 65%" }}>
                                    <div style={{ borderRight: "1px solid #000", padding: "1px 3px" }}>
                                        事業者及び<br />その事業所
                                    </div>
                                    <div style={{ padding: "1px 3px", display: "flex", alignItems: "center" }}>
                                        {DOKO_OFFICE_NAME}
                                    </div>
                                </div>
                            </td>
                        </tr>

                        {/* ヘッダと明細の間の余白（PDFの見た目寄せ） */}
                        <tr>
                            <td colSpan={14} style={{ border: "none", padding: 0, height: "6px" }} />
                        </tr>

                        {/* ===== 明細テーブル見出し（PDFの列構造） ===== */}
                        <tr>
                            <th className="center vtext" rowSpan={2}>日付</th>
                            <th className="center vtext" rowSpan={2}>曜日</th>
                            <th className="center" rowSpan={2}>サービス内容</th>
                            <th className="center" colSpan={3}>同行援護計画</th>
                            <th className="center" colSpan={2}>サービス提供時間</th>
                            <th className="center vtext" rowSpan={2}>算定時間</th>
                            <th className="center vtext" rowSpan={2}>派遣人数</th>
                            <th className="center vtext" rowSpan={2}>初回加算</th>
                            <th className="center" rowSpan={2}>緊急時<br />対応<br />加算</th>
                            <th className="center" rowSpan={2}>利用者<br />確認欄</th>
                            <th className="center" rowSpan={2}>備考</th>
                        </tr>

                        <tr>
                            <th className="center">開始<br />時間</th>
                            <th className="center">終了<br />時間</th>
                            <th className="center">計画<br />時間数</th>
                            <th className="center">開始<br />時間</th>
                            <th className="center">終了<br />時間</th>
                        </tr>

                        {/* 明細行（PDFは31日相当の空行が多いので多めに） */}
                        {(() => {
                            const weekdayJp = (dateStr: string) => {
                                const d = new Date(`${dateStr}T00:00:00`);
                                return ["日", "月", "火", "水", "木", "金", "土"][d.getDay()] ?? "";
                            };

                            const dayOfMonth = (dateStr: string) => {
                                const d = new Date(`${dateStr}T00:00:00`);
                                return String(d.getDate());
                            };

                            // 計画時間数：minutesがあれば優先、なければ start/end 差分（日跨ぎ対応）
                            const getMinutes = (r: { start: string; end: string; minutes?: number }) => {
                                if (typeof r.minutes === "number") return r.minutes;
                                const [sh, sm] = r.start.split(":").map(Number);
                                const [eh, em] = r.end.split(":").map(Number);
                                const s = sh * 60 + sm;
                                const e = eh * 60 + em;
                                return e >= s ? e - s : e + 24 * 60 - s;
                            };

                            // 要望：10:00-12:00 => "2"
                            // 端数が出た場合も一応 0.1h 単位で出す（2.0は"2"）
                            const fmtHours = (mins: number) => {
                                const h = mins / 60;
                                const t = (Math.round(h * 10) / 10).toString();
                                return t.replace(/\.0$/, "");
                            };

                            const src = (form?.rows ?? [])
                                .slice()
                                .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));

                            const MAX = ROWS_PER_PAGE.DOKO;

                            const padded: Array<(typeof src)[number] | null> = [
                                ...src,
                                ...Array.from({ length: Math.max(0, MAX - src.length) }).map(() => null),
                            ].slice(0, MAX);

                            return padded.map((r, i) => {
                                if (!r) {
                                    return (
                                        <tr key={`blank-${i}`} className="detail-row">
                                            {Array.from({ length: 14 }).map((__, j) => (
                                                <td key={j}>&nbsp;</td>
                                            ))}
                                        </tr>
                                    );
                                }

                                const planHours = fmtHours(getMinutes(r));
                                const dispatch = r.required_staff_count ?? 1;

                                return (
                                    <tr key={`row-${i}`} className="detail-row">
                                        {/* 日付 */}
                                        <td className="center">{dayOfMonth(r.date)}</td>

                                        {/* 曜日 */}
                                        <td className="center">{weekdayJp(r.date)}</td>

                                        {/* サービス内容（要望対象外なので空欄のまま） */}
                                        <td className="center">同行 (初任者等)</td>

                                        {/* 同行援護計画：開始/終了/計画時間数 */}
                                        <td className="center">{r.start}</td>
                                        <td className="center">{r.end}</td>
                                        <td className="center">{planHours}</td>

                                        {/* サービス提供時間：計画と同じでOK */}
                                        <td className="center">{r.start}</td>
                                        <td className="center">{r.end}</td>

                                        {/* 算定時間：計画時間数と同じでOK */}
                                        <td className="center">{planHours}</td>

                                        {/* 派遣人数 */}
                                        <td className="center">{dispatch}</td>

                                        {/* 初回加算 */}
                                        <td>&nbsp;</td>

                                        {/* 緊急時対応加算 */}
                                        <td>&nbsp;</td>

                                        {/* 利用者確認欄（はんこ欄なので空でOK） */}
                                        <td>&nbsp;</td>

                                        {/* 備考：担当者名（staffNames があれば表示） */}
                                        <td className="left small biko-td">
                                            <div className="biko-box">
                                                {(r.staffNames ?? []).length > 0 ? (
                                                    (r.staffNames ?? []).slice(0, 4).map((name, idx) => (
                                                        <div key={idx} className="biko-line">{name}</div>
                                                    ))
                                                ) : (
                                                    <div className="biko-line">{"\u00A0"}</div>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            });
                        })()}
                        {/* ===== フッタ合計（3行構成） ===== */}
                        <tr>
                            {/* 左側：合計（3行分の厚さ＝rowSpan=3） */}
                            <td className="center" colSpan={5} rowSpan={3}>
                                <b>合計</b>
                            </td>

                            {/* 計画時間数（縦2行：上=ラベル、下=数値。3行目は空欄） */}
                            <td className="small" rowSpan={3} style={{ padding: 0 }}>
                                <div style={{ display: "grid", gridTemplateRows: "1fr 1fr 1fr", height: "100%" }}>
                                    <div className="center" style={{ borderBottom: "1px solid #000", padding: "2px 4px" }}>
                                        計画時間数計
                                    </div>
                                    <div className="right" style={{ borderBottom: "1px solid #000", padding: "2px 4px", fontWeight: 700 }}>
                                        {sumPlanHours}
                                    </div>
                                    <div style={{ padding: "2px 4px" }}>&nbsp;</div>
                                </div>
                            </td>

                            {/* サービス提供時間（縦3行：上=内訳、真ん中=100/90、下=空欄） */}
                            <td className="center small" colSpan={2}>
                                内訳（適用単価別）
                            </td>

                            {/* 算定時間（縦2行：上=ラベル、下=数値。3行目は空欄） */}
                            <td className="small" rowSpan={3} style={{ padding: 0 }}>
                                <div style={{ display: "grid", gridTemplateRows: "1fr 1fr 1fr", height: "100%" }}>
                                    <div className="center" style={{ borderBottom: "1px solid #000", padding: "2px 4px" }}>
                                        算定時間数計
                                    </div>
                                    <div className="right" style={{ borderBottom: "1px solid #000", padding: "2px 4px", fontWeight: 700 }}>
                                        {sumSanteiHours}
                                    </div>
                                    <div style={{ padding: "2px 4px" }}>&nbsp;</div>
                                </div>
                            </td>

                            {/* 派遣人数：斜線（3行分） */}
                            <td className="diag" rowSpan={3}>&nbsp;</td>

                            {/* 初回加算：マスに「回」（3行分） */}
                            <td className="center" rowSpan={3}>
                                回
                            </td>

                            {/* 緊急時対応加算：マスに「回」（3行分） */}
                            <td className="center" rowSpan={3}>
                                回
                            </td>

                            {/* 利用者確認欄：斜線（3行分） */}
                            <td className="diag" rowSpan={3}>&nbsp;</td>

                            {/* 備考：斜線（3行分） */}
                            <td className="diag" rowSpan={3}>&nbsp;</td>
                        </tr>

                        <tr>
                            {/* サービス提供時間：真ん中行（左右に分割） */}
                            <td className="center"><b>100%</b></td>
                            <td className="center"><b>90％</b></td>
                        </tr>

                        <tr>
                            {/* サービス提供時間：一番下行（左右空欄） */}
                            <td className="right"><b>{sumPlanHours}</b></td>
                            <td>&nbsp;</td>
                        </tr>

                        {/* ページ数（PDF右下の「1枚中1枚」相当） */}
                        <tr>
                            <td colSpan={14} style={{ border: "none", paddingTop: "6px" }}>
                                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                                    <div style={{ width: "40mm" }}>
                                        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)" }}>
                                            <div className="center" style={{ border: "1px solid #000" }}>{pageNo}</div>
                                            <div className="center" style={{ border: "1px solid #000" }}>枚中</div>
                                            <div className="center" style={{ border: "1px solid #000" }}>{totalPages}</div>
                                            <div className="center" style={{ border: "1px solid #000" }}>枚</div>
                                        </div>
                                    </div>
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function JudoHommonForm({ data, form, pageNo = 1, totalPages = 1 }: FormProps) {
    const sumPlanHoursRaw =
        (form?.rows ?? []).reduce((a, r) => a + (r.minutes ?? 0), 0) / 60;

    const sumPlanHours =
        Number.isFinite(sumPlanHoursRaw)
            ? (Math.round(sumPlanHoursRaw * 10) / 10).toString().replace(/\.0$/, "")
            : "";
    return (
        <div className="formBox p-2">
            {/* タイトル（PDF寄せ：左右に小枠がある体裁） */}
            <div style={{ display: "flex", alignItems: "flex-end" }}>
                <div style={{ flex: 1 }} className="small">
                    {data.month}分
                </div>
                <div style={{ flex: 2 }} className="title">
                    重度訪問介護サービス提供実績記録票
                </div>
                <div style={{ flex: 1 }} className="small right">
                    （様式３－１）
                </div>
            </div>

            {/* ★ズレ防止：ヘッダ＋明細を 1つの table に統合（移動支援方式） */}
            <div className="mt-2">
                <table className="grid ido-grid" style={{ width: "100%", tableLayout: "fixed" }}>
                    {/* ★列数を固定（ここがズレ対策の本体） */}
                    <colgroup>
                        <col style={{ width: "5%" }} />  {/* 日付 */}
                        <col style={{ width: "5%" }} />  {/* 曜日 */}
                        <col style={{ width: "8%" }} /> {/* サービス提供の状況 */}

                        <col style={{ width: "6%" }} />  {/* 計画 開始 */}
                        <col style={{ width: "6%" }} />  {/* 計画 終了 */}
                        <col style={{ width: "5%" }} />  {/* 計画 時間 */}
                        <col style={{ width: "5%" }} />  {/* 計画 移動 */}

                        <col style={{ width: "6%" }} />  {/* 提供 開始 */}
                        <col style={{ width: "6%" }} />  {/* 提供 終了 */}

                        <col style={{ width: "5%" }} />  {/* 算定 時間 */}
                        <col style={{ width: "5%" }} />  {/* 算定 移動 */}

                        <col style={{ width: "5%" }} />  {/* 派遣人数 */}

                        <col style={{ width: "5%" }} />  {/* 同行支援 */}
                        <col style={{ width: "5%" }} />  {/* 初回加算 */}
                        <col style={{ width: "6%" }} />  {/* 緊急時対応加算 */}
                        <col style={{ width: "6%" }} />  {/* 行動障害支援連携加算 */}
                        <col style={{ width: "6%" }} />  {/* 移動介護緊急時支援加算 */}

                        <col style={{ width: "9%" }} />  {/* 利用者確認欄 */}
                        <col style={{ width: "18%" }} /> {/* 備考 */}
                    </colgroup>

                    <tbody>
                        {/* =========================
               上段ヘッダ（①〜④）
               左：受給者証番号・氏名・契約支給量
               右：事業所番号・事業者及びその事業所
               ※列数はこの table の colgroup と一致させる（合計14列）
            ========================= */}

                        {/* 1行目：受給者証番号＋氏名（左）／事業所番号（右） */}
                        <tr>
                            {/* 左ブロック：受給者証番号＋氏名（合計 9列分） */}
                            <td colSpan={12} className="small" style={{ padding: 0 }}>
                                <div style={{ display: "grid", gridTemplateColumns: "50% 50%" }}>
                                    {/* ①受給者証番号：10桁（1桁ごと縦線） */}
                                    <div style={{ display: "grid", gridTemplateColumns: "36% 64%", borderRight: "1px solid #000" }}>
                                        <div style={{ borderRight: "1px solid #000", padding: "1px 3px" }}>
                                            受給者証<br />番号
                                        </div>
                                        <div style={{ padding: "1px 3px" }}>
                                            <DigitBoxes10 value={(data.client.ido_jukyusyasho ?? "").trim() || JYUHO_JUKYUSHA_NO} />
                                        </div>
                                    </div>

                                    {/* ②氏名欄：左にラベル */}
                                    <div style={{ display: "grid", gridTemplateColumns: "36% 64%" }}>
                                        <div style={{ borderRight: "1px solid #000", padding: "1px 3px", fontSize: "9px", lineHeight: 1.05 }}>
                                            支給決定障害者等氏名
                                        </div>
                                        <div style={{ padding: "1px 6px", display: "flex", alignItems: "center" }}>
                                            {data.client.client_name}
                                        </div>
                                    </div>
                                </div>
                            </td>

                            {/* ④事業所番号（右：5列分） */}
                            <td colSpan={7} className="small" style={{ padding: 0 }}>
                                <div style={{ display: "grid", gridTemplateColumns: "35% 65%" }}>
                                    <div style={{ borderRight: "1px solid #000", padding: "1px 3px" }}>
                                        事業所番号
                                    </div>
                                    <div style={{ padding: "1px 3px" }}>
                                        <DigitBoxes10 value={JYUHO_OFFICE_NO} />
                                    </div>
                                </div>
                            </td>
                        </tr>

                        {/* 2行目：③契約支給量（左）／④事業者及びその事業所（右） */}
                        <tr>
                            {/* ③契約支給量：受給者証番号＋氏名の2つ分の横幅（左9列分） */}
                            <td colSpan={12} className="small" style={{ padding: 0 }}>
                                <div style={{ display: "grid", gridTemplateColumns: "20% 80%" }}>
                                    <div style={{ borderRight: "1px solid #000", padding: "1px 3px" }}>
                                        契約支給量
                                    </div>
                                    <div style={{ padding: "1px 6px", textAlign: "left", lineHeight: 1.2 }}>
                                        {JYUHO_CONTRACT_LINES[0]}<br />
                                        {JYUHO_CONTRACT_LINES[1]}
                                    </div>
                                </div>
                            </td>

                            {/* ④事業者及びその事業所（右5列分） */}
                            <td colSpan={7} className="small" style={{ padding: 0 }}>
                                <div style={{ display: "grid", gridTemplateColumns: "35% 65%" }}>
                                    <div style={{ borderRight: "1px solid #000", padding: "1px 3px" }}>
                                        事業者及び<br />その事業所
                                    </div>
                                    <div style={{ padding: "1px 6px", display: "flex", alignItems: "center" }}>
                                        {JYUHO_OFFICE_NAME}
                                    </div>
                                </div>
                            </td>
                        </tr>

                        {/* ヘッダと明細の間の余白（見た目調整） */}
                        <tr>
                            <td colSpan={14} style={{ border: "none", padding: 0, height: "6px" }} />
                        </tr>

                        {/* =========================
               ⑤ 下段：明細（ズレ防止のため colgroup と列数を厳密一致）
            ========================= */}

                        {/* 見出し 1段目 */}
                        <tr>
                            <th className="center" rowSpan={3}>日付</th>
                            <th className="center" rowSpan={3}>曜日</th>

                            <th className="center" rowSpan={3}>
                                サービス提供<br />状況
                            </th>

                            <th className="center" colSpan={4}>重度訪問介護計画</th>

                            {/* ★rowSpan を外して「下の一行」に見出しを入れられるようにする */}
                            <th className="center" colSpan={2}>サービス提供時間</th>
                            <th className="center" colSpan={2}>算定時間数</th>

                            <th className="center" rowSpan={3}>派遣人数</th>

                            <th className="center" rowSpan={3}>同行支援</th>
                            <th className="center" rowSpan={3}>初回加算</th>
                            <th className="center" rowSpan={3}>緊急時<br />対応加算</th>
                            <th className="center" rowSpan={3} style={{ fontSize: "9px", lineHeight: 1.05 }}>
                                行動障害支援<br />連携加算
                            </th>
                            <th className="center" rowSpan={3} style={{ fontSize: "9px", lineHeight: 1.05 }}>
                                移動介護<br />緊急時支援加算
                            </th>

                            <th className="center" rowSpan={3}>利用者<br />確認欄</th>
                            <th className="center" rowSpan={3}>備考</th>
                        </tr>

                        {/* 見出し 2段目 */}
                        <tr>
                            {/* 重度訪問介護計画 */}
                            <th className="center" rowSpan={2}>開始時間</th>
                            <th className="center" rowSpan={2}>終了時間</th>
                            <th className="center" colSpan={2}>計画時間数</th>

                            {/* ★サービス提供時間：空白だった段に追加（2列） */}
                            <th className="center" rowSpan={2}>開始時間</th>
                            <th className="center" rowSpan={2}>終了時間</th>

                            {/* ★算定時間数：空白だった段に追加（2列） */}
                            <th className="center" rowSpan={2}>時間</th>
                            <th className="center" rowSpan={2}>移動</th>
                        </tr>

                        {/* 見出し 3段目（計画時間数の下だけが残る） */}
                        <tr>
                            <th className="center">時間</th>
                            <th className="center">移動</th> {/* ★「乗降」→「移動」 */}
                        </tr>


                        {/* 明細行（データ行＋不足分は空行で埋める） */}
                        {(() => {
                            const rows = form?.rows ?? [];
                            const pageSize = ROWS_PER_PAGE.JYUHO;
                            const startIndex = (pageNo - 1) * pageSize;
                            const pageRows = rows.slice(startIndex, startIndex + pageSize);

                            // 末尾まで空行で埋める
                            const padded = [
                                ...pageRows,
                                ...Array.from({ length: Math.max(0, pageSize - pageRows.length) }).map(() => null),
                            ];

                            // 曜日（日本語表記）
                            const weekdayJa = (d?: string) => {
                                if (!d) return "";
                                const dt = new Date(d);
                                const w = dt.getDay(); // 0=日
                                return ["日", "月", "火", "水", "木", "金", "土"][w] ?? "";
                            };

                            // "HH:MM" 表示（time型が "HH:MM:SS" で来ても対応）
                            const hm = (t?: string) => (t ? t.slice(0, 5) : "");

                            return padded.map((r, i) => {
                                if (!r) {
                                    // 空行（19列）
                                    return (
                                        <tr key={i} className="detail-row">
                                            {Array.from({ length: 19 }).map((__, j) => (
                                                <td key={j}>&nbsp;</td>
                                            ))}
                                        </tr>
                                    );
                                }

                                // 備考：担当者（漢字氏名） staff_01 / staff_02（API側で staffNames を返している前提）
                                const staffMemo = (r.staffNames ?? []).join("、");

                                // 日付表示（1〜31だけ出したい場合はここで加工）
                                const day = r.date ? String(new Date(r.date).getDate()) : "";

                                return (
                                    <tr key={i} className="detail-row">
                                        {/* 1 日付 */}
                                        <td className="center">{day}</td>

                                        {/* 2 曜日 */}
                                        <td className="center">{weekdayJa(r.date)}</td>

                                        {/* 3 サービス提供状況（必要なら r.status 等に差し替え） */}
                                        <td className="center">&nbsp;</td>

                                        {/* 4 計画 開始（shift_start_time） */}
                                        <td className="center">{hm(r.start)}</td>

                                        {/* 5 計画 終了（shift_end_time） */}
                                        <td className="center">{hm(r.end)}</td>

                                        {/* 6 計画 時間（必要なら分→時間計算。無ければ空でOK） */}
                                        <td className="center">&nbsp;</td>

                                        {/* 7 計画 移動 */}
                                        <td className="center">&nbsp;</td>

                                        {/* 8 提供 開始（shift_start_time） */}
                                        <td className="center">{hm(r.start)}</td>

                                        {/* 9 提供 終了（shift_end_time） */}
                                        <td className="center">{hm(r.end)}</td>

                                        {/* 10 算定 時間 */}
                                        <td className="center">&nbsp;</td>

                                        {/* 11 算定 移動 */}
                                        <td className="center">&nbsp;</td>

                                        {/* 12 派遣人数（常に1） */}
                                        <td className="center">1</td>

                                        {/* 13 同行支援 */}
                                        <td className="center">&nbsp;</td>

                                        {/* 14 初回加算 */}
                                        <td className="center">&nbsp;</td>

                                        {/* 15 緊急時対応加算 */}
                                        <td className="center">&nbsp;</td>

                                        {/* 16 行動障害支援連携加算 */}
                                        <td className="center">&nbsp;</td>

                                        {/* 17 移動介護緊急時支援加算 */}
                                        <td className="center">&nbsp;</td>

                                        {/* 18 利用者確認欄 */}
                                        <td className="center">&nbsp;</td>

                                        {/* 19 備考（担当者名） */}
                                        <td className="small">{staffMemo}</td>
                                    </tr>
                                );
                            });
                        })()}

                        {/* ====== 追加：最下部 2行（移動介護分／合計） ====== */}

                        {/* 移動介護分 */}
                        <tr>
                            {/* 「重度訪問介護計画」の下の終了時間まで：日付+曜日+状況+計画開始+計画終了 = 5列 */}
                            <td className="center small" colSpan={5}><b>移動介護分</b></td>

                            {/* 計画：時間(斜線)、移動(空欄) */}
                            <td className="diag">&nbsp;</td>
                            <td>&nbsp;</td>

                            {/* サービス提供時間：開始/終了(斜線) */}
                            <td className="diag">&nbsp;</td>
                            <td className="diag">&nbsp;</td>

                            {/* 算定：時間(斜線)、移動(空欄) */}
                            <td className="diag">&nbsp;</td>
                            <td>&nbsp;</td>

                            {/* 派遣人数〜備考：指定の列は斜線 */}
                            <td className="diag">&nbsp;</td> {/* 派遣人数 */}
                            <td className="diag">&nbsp;</td> {/* 同行支援 */}
                            <td className="diag">&nbsp;</td> {/* 初回加算 */}
                            <td className="diag">&nbsp;</td> {/* 緊急時対応加算 */}
                            <td className="diag">&nbsp;</td> {/* 行動障害支援連携加算 */}
                            <td className="diag">&nbsp;</td> {/* 移動介護緊急時支援加算 */}
                            <td className="diag">&nbsp;</td> {/* 利用者確認欄 */}
                            <td className="diag">&nbsp;</td> {/* 備考 */}
                        </tr>

                        {/* 合計 */}
                        <tr>
                            <td className="center small" colSpan={5}><b>合計</b></td>

                            {/* 計画：時間(合計値)、移動(斜線) */}
                            <td className="right"><b>{sumPlanHours}</b></td>
                            <td className="diag">&nbsp;</td>

                            {/* サービス提供時間：開始/終了(斜線) */}
                            <td className="diag">&nbsp;</td>
                            <td className="diag">&nbsp;</td>

                            {/* 算定：時間(空欄)、移動(斜線) */}
                            <td>&nbsp;</td>
                            <td className="diag">&nbsp;</td>

                            {/* 派遣人数(斜線) */}
                            <td className="diag">&nbsp;</td>

                            {/* 同行支援(斜線) */}
                            <td className="diag">&nbsp;</td>

                            {/* 初回/緊急/行動/移動介護緊急：回 */}
                            <td className="center"><b>回</b></td>
                            <td className="center"><b>回</b></td>
                            <td className="center"><b>回</b></td>
                            <td className="center"><b>回</b></td>

                            {/* 利用者確認欄/備考：斜線 */}
                            <td className="diag">&nbsp;</td>
                            <td className="diag">&nbsp;</td>
                        </tr>

                        {/* ページ数（PDF右下の「1枚中1枚」相当） */}
                        <tr>
                            <td colSpan={19} style={{ border: "none", paddingTop: "6px" }}>
                                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                                    <div style={{ width: "40mm" }}>
                                        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)" }}>
                                            <div className="center" style={{ border: "1px solid #000" }}>{pageNo}</div>
                                            <div className="center" style={{ border: "1px solid #000" }}>枚中</div>
                                            <div className="center" style={{ border: "1px solid #000" }}>{totalPages}</div>
                                            <div className="center" style={{ border: "1px solid #000" }}>枚</div>
                                        </div>
                                    </div>
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            {/* 下部合計欄は次工程で追加（今回は①〜⑤の範囲） */}
        </div>
    );
}

function IdoShienForm({ data, form, pageNo = 1, totalPages = 1 }: FormProps) {
    // ★2025年11月以降のみ
    const FILTER_FROM = "2025-11-01";

    const weekdayJp = (dateStr: string) => {
        const d = new Date(`${dateStr}T00:00:00`);
        return ["日", "月", "火", "水", "木", "金", "土"][d.getDay()] ?? "";
    };

    const dayOfMonth = (dateStr: string) => {
        const d = new Date(`${dateStr}T00:00:00`);
        return String(d.getDate());
    };

    // ★分数：minutes があれば優先、なければ start/end 差分（跨日対応）
    const getMinutes = (r: { start: string; end: string; minutes?: number }) => {
        if (typeof r.minutes === "number") return r.minutes;

        const [sh, sm] = r.start.split(":").map(Number);
        const [eh, em] = r.end.split(":").map(Number);
        const s = sh * 60 + sm;
        const e = eh * 60 + em;

        return e >= s ? e - s : e + 24 * 60 - s;
    };

    // ★明細（2025-11-01以降のみ）をソート
    const src = (form.rows ?? [])
        .filter((r) => r.date >= FILTER_FROM)
        .slice()
        .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));

    // ★指定行数にパディング（不足分は空行）
    const MAX = ROWS_PER_PAGE.IDOU;
    const padded: Array<(typeof src)[number] | null> = [
        ...src,
        ...Array.from({ length: Math.max(0, MAX - src.length) }).map(() => null),
    ].slice(0, MAX);

    // ★合計（要望：サービス提供「分」＝計画時間（分）＝内訳（不可欠）を同じにする）
    const sumPlanMin = src.reduce((a, r) => a + getMinutes(r), 0);
    const sumUphitMin = sumPlanMin; // 不可欠（分）＝同じ数
    const sumOtherMin = 0;

    // ★算定時間(時間) 合計：明細の calc_hour を合計
    const sumSanteiHour = src.reduce((a, r) => {
        const h = r.calc_hour;
        return a + (typeof h === "number" ? h : 0);
    }, 0);

    const sumKatamichi = 0;

    // ★修正：利用者負担額（cs_pay）は「IDOU 全行」の合計にする（ページ分割の影響を受けない）
    const allIdouRows =
        (data.forms.find((f) => f.formType === "IDOU")?.rows ?? [])
            .filter((r) => r.date >= FILTER_FROM);

    const sumFutan = allIdouRows.reduce((a, r) => {
        const n = Number(r.cs_pay);
        return a + (Number.isFinite(n) ? n : 0);
    }, 0);

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
                        <col style={{ width: "4%" }} />  {/* 利用形態 ★追加 */}
                        <col style={{ width: "4%" }} />  {/* 片道支援加算 */}
                        <col style={{ width: "6%" }} />  {/* 利用者負担額 */}

                        <col style={{ width: "6%" }} />  {/* サービス提供時間 開始 */}
                        <col style={{ width: "6%" }} />  {/* サービス提供時間 終了 */}
                        <col style={{ width: "11%" }} />  {/* サービス提供者名 */}
                        <col style={{ width: "7%" }} />  {/* 利用者確認欄 */}
                    </colgroup>

                    <tbody>
                        {/* =========================
         上段：受給者証番号 等（同じ table の中で colspan で表現）
         ========================= */}

                        {/* =========================
  上段：受給者証番号 等（要件反映版）
  ※この時点では明細は18列のままでもOKだが、
    後述の「利用形態追加」で19列に変えるので、
    先に19列化するのが推奨
========================= */}

                        {/* ===== 上段ヘッダ：1行目（右端：事業所番号） ===== */}
                        <tr>
                            <td className="small" colSpan={6} style={{ textAlign: "left", padding: 0 }}>
                                <div style={{ display: "grid", gridTemplateColumns: "25% 75%" }}>
                                    <div style={{ borderRight: "1px solid #000", padding: "2px 4px" }}>受給者証番号</div>
                                    <div style={{ padding: "2px 4px" }}>
                                        <DigitBoxes10 value={data.client.ido_jukyusyasho ?? ""} />
                                    </div>
                                </div>
                            </td>

                            <td className="small" colSpan={10} style={{ padding: 0 }}>
                                {/* 左：2行ラベル／右：氏名欄（1枠） */}
                                <div
                                    style={{
                                        display: "grid",
                                        gridTemplateColumns: "38% 62%", // 左ラベル列／右入力列（好みで微調整OK）
                                        height: "32px",                // 2行分の高さに固定（必要なら微調整）
                                    }}
                                >
                                    {/* 左列：2行ラベル */}
                                    <div style={{ borderRight: "1px solid #000" }}>
                                        <div style={{ borderBottom: "1px solid #000", padding: "2px 4px" }}>
                                            支給決定者(保護者)氏名
                                        </div>
                                        <div style={{ padding: "2px 4px" }}>（児童氏名）</div>
                                    </div>

                                    {/* 右列：氏名（1枠、2行分の高さだが分割しない） */}
                                    <div style={{ padding: "2px 6px", display: "flex", alignItems: "center" }}>
                                        {data.client.client_name}
                                    </div>
                                </div>
                            </td>

                            <td className="small" colSpan={3} style={{ padding: 0 }}>
                                <div style={{ display: "grid", gridTemplateColumns: "40% 60%" }}>
                                    <div style={{ borderRight: "1px solid #000", padding: "2px 4px", textAlign: "left" }}>
                                        事業所番号
                                    </div>
                                    <div style={{ padding: "2px 4px" }}>
                                        <DigitBoxes10 value={OFFICE_NO} />
                                    </div>
                                </div>
                            </td>
                        </tr>

                        {/* ===== 上段ヘッダ：2行目（右端：事業所名称 rowSpan=2） ===== */}
                        <tr>
                            <td className="small" colSpan={8} style={{ padding: 0 }}>
                                <div style={{ display: "grid", gridTemplateColumns: "30% 70%" }}>
                                    <div style={{ borderRight: "1px solid #000", padding: "2px 4px", textAlign: "left" }}>
                                        総決定支給量
                                    </div>
                                    <div style={{ padding: 0 }}>
                                        <div style={{ display: "grid", gridTemplateRows: "1fr 1fr" }}>
                                            <div style={{ display: "grid", gridTemplateColumns: "40% 60%", borderBottom: "1px solid #000" }}>
                                                <div style={{ borderRight: "1px solid #000", padding: "2px 4px" }}>不可欠</div>
                                                <div style={{ padding: "2px 4px" }}>&nbsp;</div>
                                            </div>
                                            <div style={{ display: "grid", gridTemplateColumns: "40% 60%" }}>
                                                <div style={{ borderRight: "1px solid #000", padding: "2px 4px" }}>その他</div>
                                                <div style={{ padding: "2px 4px" }}>&nbsp;</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </td>

                            <td className="small" colSpan={8} style={{ padding: 0 }}>
                                <div style={{ display: "grid", gridTemplateColumns: "30% 70%" }}>
                                    <div style={{ borderRight: "1px solid #000", padding: "2px 4px", textAlign: "left" }}>
                                        契約支給量
                                    </div>
                                    <div style={{ padding: 0 }}>
                                        <div style={{ display: "grid", gridTemplateRows: "1fr 1fr" }}>
                                            <div style={{ display: "grid", gridTemplateColumns: "40% 60%", borderBottom: "1px solid #000" }}>
                                                <div style={{ borderRight: "1px solid #000", padding: "2px 4px" }}>不可欠</div>
                                                <div style={{ padding: "2px 4px" }}>&nbsp;</div>
                                            </div>
                                            <div style={{ display: "grid", gridTemplateColumns: "40% 60%" }}>
                                                <div style={{ borderRight: "1px solid #000", padding: "2px 4px" }}>その他</div>
                                                <div style={{ padding: "2px 4px" }}>&nbsp;</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </td>

                            <td className="small" colSpan={3} rowSpan={2} style={{ padding: 0 }}>
                                <div style={{ display: "grid", gridTemplateColumns: "30% 70%" }}>
                                    <div style={{ borderRight: "1px solid #000", padding: "2px 4px", textAlign: "left" }}>
                                        事業者事業所の名称
                                    </div>
                                    <div style={{ padding: "2px 4px", textAlign: "left" }}>
                                        {OFFICE_NAME_LINES[0]}<br />
                                        {OFFICE_NAME_LINES[1]}<br />
                                        {OFFICE_NAME_LINES[2]}
                                    </div>
                                </div>
                            </td>
                        </tr>

                        {/* ===== 上段ヘッダ：3行目（右端セルは rowSpan により不要） ===== */}
                        <tr>
                            <td className="small" colSpan={16}>
                                月額上限負担額
                                <div className="mt-1 right">0円</div>
                            </td>
                        </tr>


                        {/* （ヘッダと明細の間の空白行：見た目調整） */}
                        <tr>
                            <td colSpan={19} style={{ border: "none", padding: 0, height: "6px" }} />
                        </tr>

                        {/* =========================
         下段：移動支援計画（同じ table の中で th を置く）
         ========================= */}

                        <tr>
                            <th className="center" rowSpan={3}>日付</th>
                            <th className="center" rowSpan={3}>曜日</th>
                            <th className="center" colSpan={9}>移動支援計画</th>
                            <th className="center" rowSpan={3}>算定時間(時間)</th>
                            <th className="center vtext" rowSpan={3}>利用形態</th>
                            <th className="center vtext" rowSpan={3}>片道支援加算</th>
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

                        {/* 明細：rows を表示＋不足分は空行（2025-11-01以降のみ） */}
                        {padded.map((r, i) => {
                            if (!r) {
                                return (
                                    <tr key={`blank-${i}`} className="detail-row">
                                        {Array.from({ length: 19 }).map((__, j) => (
                                            <td key={j}>&nbsp;</td>
                                        ))}
                                    </tr>
                                );
                            }

                            const mins = getMinutes(r);

                            return (
                                <tr key={`row-${i}`} className="detail-row">
                                    {/* 日付 */}
                                    <td className="center">{dayOfMonth(r.date)}</td>
                                    {/* 曜日 */}
                                    <td className="center">{weekdayJp(r.date)}</td>

                                    {/* 移動支援計画 ＞ サービス提供（開始/終了/分） */}
                                    <td className="center">{r.start}</td>
                                    <td className="center">{r.end}</td>
                                    <td className="right">{mins}</td>

                                    {/* 控除（要望なし：空欄） */}
                                    <td>&nbsp;</td>
                                    <td>&nbsp;</td>
                                    <td>&nbsp;</td>

                                    {/* 計画時間（分）＝サービス提供「分」と同じ */}
                                    <td className="right">{mins}</td>

                                    {/* 内訳（分）不可欠＝同じ、その他は空欄 */}
                                    <td className="right">{mins}</td>
                                    <td>&nbsp;</td>

                                    {/* 算定時間(時間)：内訳(分)を0.5h単位で丸めた値（route.tsのcalc_hour） */}
                                    <td className="right">
                                        {typeof r?.calc_hour === "number"
                                            ? String(r.calc_hour).replace(/\.0$/, "")
                                            : "\u00A0"}
                                    </td>

                                    {/* 利用形態：シフトがある行は「1」 */}
                                    <td className="center">1</td>

                                    <td className="center">
                                        {r.katamichi_addon === 1 ? "1" : "\u00A0"}
                                    </td>

                                    {/* 利用者負担額：route.ts が cs_pay を返しているので表示したいならここで出せます（任意） */}
                                    <td className="right">
                                        {r.cs_pay != null && String(r.cs_pay).trim() !== "" ? r.cs_pay : "\u00A0"}
                                    </td>

                                    {/* サービス提供時間 ＞ サービス提供（開始/終了）＝計画と同じ */}
                                    <td className="center">{r.start}</td>
                                    <td className="center">{r.end}</td>

                                    {/* サービス提供者名／利用者確認欄 */}
                                    <td className="left small">
                                        {(r.staffNames?.join(" ") ?? "").trim() || "\u00A0"}
                                    </td>
                                    <td>&nbsp;</td>
                                </tr>
                            );
                        })}

                        {/* 合計行（列数19に一致させる） */}
                        <tr>
                            {/* 合計：2枠分 */}
                            <td className="center" colSpan={2}><b>合計</b></td>

                            {/* サービス提供 開始/終了 は斜線 */}
                            <td className="diag">&nbsp;</td>
                            <td className="diag">&nbsp;</td>
                            <td className="right"><b>{sumPlanMin}</b></td> {/* 分は数値のまま */}

                            {/* 控除 開始/終了 は斜線 */}
                            <td className="diag">&nbsp;</td>
                            <td className="diag">&nbsp;</td>
                            <td className="right"><b>0</b></td>

                            <td className="right"><b>{sumPlanMin}</b></td>
                            <td className="right"><b>{sumUphitMin}</b></td>
                            <td className="right"><b>{sumOtherMin}</b></td>

                            <td className="right"><b>{sumSanteiHour}</b></td>

                            {/* 利用形態：斜線 */}
                            <td className="diag">&nbsp;</td>

                            <td className="right"><b>{sumKatamichi}</b></td>
                            <td className="right"><b>{sumFutan}</b></td>

                            {/* サービス提供時間 開始/終了：斜線 */}
                            <td className="diag">&nbsp;</td>
                            <td className="diag">&nbsp;</td>

                            {/* サービス提供者名／利用者確認欄：斜線 */}
                            <td className="diag">&nbsp;</td>
                            <td className="diag">&nbsp;</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div className="mt-1" style={{ display: "flex", justifyContent: "flex-end" }}>
                <div style={{ width: "40mm" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)" }}>
                        <div className="center" style={{ border: "1px solid #000" }}>{pageNo}</div>
                        <div className="center" style={{ border: "1px solid #000" }}>枚中</div>
                        <div className="center" style={{ border: "1px solid #000" }}>{totalPages}</div>
                        <div className="center" style={{ border: "1px solid #000" }}>枚</div>
                    </div>
                </div>
            </div>
        </div>
    );
}

