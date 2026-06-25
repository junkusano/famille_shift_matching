"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Row = Record<string, string | number | null>;

function yen(v: unknown) {
    const n = Number(v ?? 0);
    return n ? `${n.toLocaleString()} 円` : "0 円";
}

function dateLabel(date: string) {
    if (!date) return "";
    const [y, m, d] = date.split("-");
    return `${y}年${Number(m)}月${Number(d)}日`;
}

function Item({
    label,
    before,
    after,
    money,
}: {
    label: string;
    before: unknown;
    after: unknown;
    money?: boolean;
}) {
    return (
        <div className="grid grid-cols-3 gap-3 border-b py-2 text-sm">
            <div className="font-medium text-gray-700">{label}</div>
            <div className="text-gray-700">{money ? yen(before) : String(before ?? "")}</div>
            <div className="font-semibold text-gray-900">{money ? yen(after) : String(after ?? "")}</div>
        </div>
    );
}

export default function NotificationDeterminationPage() {
    const [rows, setRows] = useState<Row[]>([]);
    const [dates, setDates] = useState<string[]>([]);
    const [date, setDate] = useState("");
    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState("");

    async function fetchData(targetDate?: string) {
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

        const qs = targetDate ? `?date=${targetDate}` : "";
        const res = await fetch(`/api/portal/user_notification_determination${qs}`, {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });

        const json = await res.json();

        if (!res.ok) {
            setErrorMessage(json.error ?? "処遇決定通知書の取得に失敗しました。");
            setLoading(false);
            return;
        }

        setRows(json.rows ?? []);
        setDates(json.availableDates ?? []);

        if (!targetDate && json.availableDates?.[0]) {
            setDate(json.availableDates[0]);
            await fetchData(json.availableDates[0]);
            return;
        }

        setLoading(false);
    }

    useEffect(() => {
        void fetchData();
    }, []);

    const row = useMemo(() => rows[0] ?? null, [rows]);

    useEffect(() => {
        if (!row) return;

        const oldTitle = document.title;
        const staffName = String(row["氏名"] ?? "").trim();
        const ymd = String(row["変更日"] ?? "").replaceAll("-", "");

        document.title = `処遇決定通知書_${staffName}_${ymd}`;

        return () => {
            document.title = oldTitle;
        };
    }, [row]);

    function handlePrint() {
        setTimeout(() => window.print(), 100);
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

          #notification-print-area,
          #notification-print-area * {
            visibility: visible !important;
          }

          #notification-print-area {
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
          }

          .no-print {
            display: none !important;
          }
        }
      `}</style>

            <div className="no-print mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold">処遇決定通知書</h1>
                    <p className="text-sm text-gray-500">ログイン中の本人分のみ表示されます。</p>
                </div>

                <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">変更日</label>
                    <select
                        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                        value={date}
                        onChange={(e) => {
                            setDate(e.target.value);
                            void fetchData(e.target.value);
                        }}
                    >
                        {dates.map((d) => (
                            <option key={d} value={d}>
                                {dateLabel(d)}
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
                    表示できる処遇決定通知書がありません。
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

                    <section id="notification-print-area" className="rounded-xl border bg-white p-6 shadow-sm">
                        <div className="border-b pb-4">
                            <div className="text-sm text-gray-500">変更日：{dateLabel(String(row["変更日"] ?? ""))}</div>
                            <h2 className="mt-1 text-xl font-bold">処遇決定通知書</h2>

                            <div className="mt-4 grid gap-1 text-sm text-gray-700">
                                <div>{row["氏名"]} 様</div>
                                <div>所属：合同会社 施恩</div>
                                <div>従業員番号：{row["従業員番号"]}</div>
                            </div>
                        </div>

                        <div className="mt-6 rounded-lg border">
                            <div className="grid grid-cols-3 gap-3 border-b bg-gray-50 p-3 text-sm font-bold">
                                <div>項目</div>
                                <div>変更前</div>
                                <div>変更後</div>
                            </div>

                            <div className="p-3">
                                <Item label="職級" before={row["変更前 職級"]} after={row["変更後 職級"]} />
                                <Item label="基本給" before={row["変更前 基本給"]} after={row["変更後 基本給"]} money />
                                <Item label="職級手当" before={row["変更前 職級手当"]} after={row["変更後 職級手当"]} money />
                                <Item label="スキル加算手当" before={row["変更前 スキル加算手当"]} after={row["変更後 スキル加算手当"]} money />
                                <Item label="ケアマネ手当" before={row["変更前 ケアマネ手当"]} after={row["変更後 ケアマネ手当"]} money />
                                <Item label="私有車業務使用手当" before={row["変更前 私有車業務使用手当"]} after={row["変更後 私有車業務使用手当"]} money />
                                <Item label="合計" before={row["変更前 合計"]} after={row["変更後 合計"]} money />
                            </div>
                        </div>
                    </section>
                </>
            )}
        </main>
    );
}