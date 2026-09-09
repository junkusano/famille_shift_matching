"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type SalaryRow = Record<string, string | number | null>;

const attendanceKeys = [
    "出勤日数（平日）",
    "出勤日数（所定休日）",
    "欠勤日数（平日）",
    "総労働時間（平日）",
    "所定時間（平日）",
    "法定外時間（平日）",
    "深夜所定時間（平日）",
    "有休残日数",
    "有休付与日数",
    "有休取得日数",
    "重訪移動時間",
    "通院等介助（身体なし）時間",
    "グループ介助時間",
    "時給加算時間",
    "処遇改善加算",
    "身体・同行・行動時間",
    "移動回数",
    "食事回数",
    "キャンセル回数",
    "年末年始出勤時間",
    "サービス回数",
    "研修時間",
];

const paymentKeys = [
    "役員報酬(支給)",
    "基本給(支給)",
    "役職手当(支給)",
    "残業手当(支給)",
    "深夜残業手当(支給)",
    "所定休日手当(支給)",
    "資格手当(支給)",
    "ケアマネ手当(支給)",
    "スキル加算手当(支給)",
    "職級手当(支給)",
    "私有車業務使用手当(支給)",
    "テザリング手当(支給)",
    "経費精算等(支給)",
    "福利厚生費(支給)",
    "月次報酬(支給)",
    "管理スパン手当(支給)",
    "役割基準手当(支給)",
    "処遇改善加算(支給)",
    "特定処遇改善加算(支給)",
    "食事手当(支給)",
    "同行援護研修手当(支給)",
    "その他手当(支給)",
    "通勤手当（その他）(支給)",
    "通勤手当（月額）(支給)",
    "研修奨励手当(支給)",
    "紹介手当(支給)",
    "通院介助等（身体なし）(支給)",
    "時給加算(支給)",
    "深夜出勤代(支給)",
    "通勤手当(支給)",
    "スキル加算（処遇改善加算）(支給)",
    "身体・同行・行動加算(支給)",
    "重訪移動加算(支給)",
    "移動加算（片道支援）(支給)",
    "通院等介助（身体なし）(支給)",
    "グループ介助手当(支給)",
    "食事加算(支給)",
    "キャンセル手当(支給)",
    "年末年始加算(支給)",
    "研修手当(支給)",
    "特別勤務手当(支給)",
    "有給手当(支給)",
];

const deductionKeys = [
    "健康保険料(控除)",
    "介護保険料(控除)",
    "子ども・子育て支援金(控除)",
    "厚生年金保険料(控除)",
    "雇用保険料(控除)",
    "所得税(控除)",
    "住民税(控除)",
    "年調過不足税額(控除)",
    "社宅費/車代/駐車場代(控除)",
    "不就労(控除)",
    "研修費補助返金(控除)",
    "タイミー等先払控除(控除)",
    "研修費貸付金(控除)",
    "先払給与精算(控除)",
    "その他精算額(控除)",
];

function yen(v: unknown) {
    const n = Number(v ?? 0);
    return n ? `${n.toLocaleString()} 円` : "";
}

function val(v: unknown) {
    if (v == null || v === "" || Number(v) === 0) return "";
    return String(v).replace(/^0?(\d+):(\d{2}):00$/, "$1:$2");
}

function label(key: string) {
    return key.replace("(支給)", "").replace("(控除)", "");
}

function payDateLabel(d: string) {
    const [y, m, day] = d.split("-");
    return `${y}年${Number(m)}月${Number(day)}日分`;
}

function DetailList({ keys, row, money }: { keys: string[]; row: SalaryRow; money?: boolean }) {
    const items = keys
        .map((k) => ({ key: k, value: money ? yen(row[k]) : val(row[k]) }))
        .filter((x) => x.value);

    if (items.length === 0) {
        return <div className="text-sm text-gray-400">該当なし</div>;
    }

    return (
        <div className="space-y-2">
            {items.map((item) => (
                <div key={item.key} className="flex justify-between gap-4 border-b border-gray-100 pb-1 text-sm">
                    <span className="text-gray-600">{label(item.key)}</span>
                    <span className="font-medium text-gray-900">{item.value}</span>
                </div>
            ))}
        </div>
    );
}

export default function UserSalaryMonthlyPage() {
    const [rows, setRows] = useState<SalaryRow[]>([]);
    const [payDates, setPayDates] = useState<string[]>([]);
    const [payDate, setPayDate] = useState("");
    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState("");

    async function fetchSalary(targetPayDate?: string) {
        setLoading(true);
        setErrorMessage("");

        const {
            data: { session },
        } = await supabase.auth.getSession();

        const token = session?.access_token;
        if (!token) {
            setErrorMessage("ログイン情報が取得できません。");
            setLoading(false);
            return;
        }

        const qs = targetPayDate ? `?payDate=${targetPayDate}` : "";
        const res = await fetch(`/api/portal/user_salary_monthly${qs}`, {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });

        const json = await res.json();

        if (!res.ok) {
            setErrorMessage(json.error ?? "給与明細の取得に失敗しました。");
            setLoading(false);
            return;
        }

        setRows(json.rows ?? []);
        setPayDates(json.availablePayDates ?? []);

        if (!targetPayDate && json.availablePayDates?.[0]) {
            setPayDate(json.availablePayDates[0]);
        }

        setLoading(false);
    }

    useEffect(() => {
        void fetchSalary();
    }, []);

    const row = useMemo(() => rows[0] ?? null, [rows]);

    useEffect(() => {
        if (!row) return;

        const oldTitle = document.title;

        const ym = String(row["支給日"] ?? "")
            .slice(0, 7)
            .replace("-", "");

        const staffName = String(row["従業員"] ?? "").trim();

        document.title = `給与明細_${staffName}_${ym}`;

        return () => {
            document.title = oldTitle;
        };
    }, [row]);

    function handlePrint() {
        setTimeout(() => {
            window.print();
        }, 100);
    }

    return (
        <main className="mx-auto max-w-4xl p-4">
            <style jsx global>{`
            @page {
    size: A4;
    margin: 8mm;
}

    @media print {
        body * {
            visibility: hidden !important;
        }

        #salary-print-area,
        #salary-print-area * {
            visibility: visible !important;
        }

        #salary-print-area {
    position: absolute !important;
    left: 0 !important;
    top: 0 !important;

    width: 190mm !important;
    max-width: 190mm !important;

    margin: 0 auto !important;

    box-shadow: none !important;
    border: none !important;
    padding: 8mm !important;
    background: white !important;

    font-size: 12px !important;
    line-height: 1.4 !important;
    transform: scale(0.92) !important;
transform-origin: top left !important;
}

        .no-print {
            display: none !important;
        }
    }
`}</style>
            <div className="no-print mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold">給与明細</h1>
                    <p className="text-sm text-gray-500">ログイン中の本人分のみ表示されます。</p>
                </div>

                <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">支給日</label>
                    <select
                        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                        value={payDate}
                        onChange={(e) => {
                            const selected = e.target.value;
                            setPayDate(selected);
                            void fetchSalary(selected);
                        }}
                    >
                        {payDates.map((d) => (
                            <option key={d} value={d}>
                                {payDateLabel(d)}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {loading && <div className="rounded-lg border bg-white p-6 text-gray-500">読み込み中...</div>}

            {!loading && errorMessage && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
                    {errorMessage}
                </div>
            )}

            {!loading && !errorMessage && !row && (
                <div className="rounded-lg border bg-white p-6 text-gray-500">
                    表示できる給与明細がありません。
                </div>
            )}

            {!loading && row && (
                <>
                    <div className="no-print mb-4 flex justify-end">
                        <button
                            type="button"
                            onClick={handlePrint}
                            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-bold text-white hover:bg-gray-700"
                        >
                            印刷・PDF保存
                        </button>
                    </div>

                    <section id="salary-print-area" className="rounded-xl border bg-white p-5 shadow-sm">
                        <div className="border-b pb-4">
                            <div className="text-sm text-gray-500">
                                {row["支給日"] ? payDateLabel(String(row["支給日"])) : ""}
                            </div>
                            <h2 className="mt-1 text-xl font-bold">給与明細書</h2>
                            <div className="mt-3 grid gap-1 text-sm text-gray-700">
                                <div>支給日：{row["支給日"]}</div>
                                <div>{row["従業員"]} 様</div>
                                <div>所属：合同会社 施恩</div>
                                <div>従業員番号：{row["従業員番号"]}</div>
                            </div>
                        </div>

                        <div className="my-5 rounded-lg bg-gray-900 p-5 text-white">
                            <div className="text-sm opacity-80">差引支給額</div>
                            <div className="mt-1 text-3xl font-bold">
                                {yen(row["差引支給合計"] || row["振込支給額合計"])}
                            </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-3 print:grid-cols-3">
                            <div className="rounded-lg border p-4">
                                <h3 className="mb-3 font-bold">勤怠</h3>
                                <DetailList keys={attendanceKeys} row={row} />
                            </div>

                            <div className="rounded-lg border p-4">
                                <h3 className="mb-3 font-bold">支給</h3>
                                <DetailList keys={paymentKeys} row={row} money />
                                <div className="mt-4 flex justify-between border-t pt-3 font-bold">
                                    <span>支給合計</span>
                                    <span>{yen(row["支給合計"])}</span>
                                </div>
                            </div>

                            <div className="rounded-lg border p-4">
                                <h3 className="mb-3 font-bold">控除</h3>
                                <DetailList keys={deductionKeys} row={row} money />
                                <div className="mt-4 flex justify-between border-t pt-3 font-bold">
                                    <span>控除合計</span>
                                    <span>{yen(row["控除合計"]) || "0 円"}</span>
                                </div>
                            </div>
                        </div>

                        <div className="mt-5 rounded-lg border p-4">
                            <h3 className="mb-3 font-bold">当月支払</h3>

                            <div className="flex justify-between text-lg font-bold">
                                <span>振込支給額</span>
                                <span>{yen(row["振込支給額合計"]) || "0 円"}</span>
                            </div>

                            {!!row["備考"] && (
                                <div className="mt-4 border-t pt-4">
                                    <div className="mb-2 text-sm font-semibold text-gray-700">
                                        備考
                                    </div>
                                    <div className="whitespace-pre-wrap break-words text-sm leading-6 text-gray-700">
                                        {String(row["備考"])}
                                    </div>
                                </div>
                            )}
                        </div>
                    </section>
                </>
            )}
        </main>
    );
}