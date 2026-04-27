// src/components/assessment/PlanPrintView.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const OFFICE_NAME = "ファミーユヘルパーサービス愛知";

type PlanRow = {
    plan_id: string;
    assessment_id: string;
    client_info_id: string | null;
    kaipoke_cs_id: string;
    plan_document_kind: string;
    title: string;
    version_no: number;
    status: string;
    issued_on: string | null;
    plan_start_date: string | null;
    plan_end_date: string | null;
    author_name: string | null;
    person_family_hope: string | null;
    assistance_goal: string | null;
    remarks: string | null;
    weekly_plan_comment: string | null;
    monthly_summary: unknown;
    created_at: string;
};

type ServiceRow = {
    plan_service_id: string;
    service_code: string | null;
    plan_service_category: string | null;
    service_title: string | null;
    service_detail: string | null;
    procedure_notes: string | null;
    observation_points: string | null;
    family_action: string | null;
    schedule_note: string | null;
    weekday: number | null;
    weekday_jp: string | null;
    start_time: string | null;
    end_time: string | null;
    duration_minutes: number | null;
    monthly_hours: number | string | null;
    display_order: number;
    service_no: number;
    two_person_work_flg: boolean;
    active: boolean;
};

type ApiData = {
    plan: PlanRow;
    services: ServiceRow[];
};

async function getBearer() {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? `Bearer ${token}` : "";
}

export default function PlanPrintView({ planId }: { planId: string }) {
    const [data, setData] = useState<ApiData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        load();
    }, [planId]);

    async function load() {
        setLoading(true);
        try {
            const bearer = await getBearer();
            const res = await fetch(`/api/plans/${planId}`, {
                headers: bearer ? { Authorization: bearer } : {},
            });
            const j = await res.json();
            if (!j?.ok) {
                window.alert(`計画書取得に失敗: ${j?.error ?? "unknown error"}`);
                return;
            }
            setData(j.data);
        } finally {
            setLoading(false);
        }
    }

    const groupedServices = useMemo(
        () => groupServicesForPrint(data?.services ?? []),
        [data?.services],
    );

    const monthlySummary = useMemo(
        () => normalizeMonthlySummary(data?.plan.monthly_summary),
        [data?.plan.monthly_summary],
    );

    if (loading) {
        return <div className="p-6">読み込み中...</div>;
    }

    if (!data) {
        return <div className="p-6">計画書が見つかりません。</div>;
    }

    const { plan } = data;

    const title =
        plan.plan_document_kind === "移動支援サービス"
            ? "移動支援サービス計画書"
            : "居宅介護等計画書";

    return (
        <div className="bg-gray-100 print:bg-white min-h-screen">
            <style jsx global>{`
        @page {
          size: A4;
          margin: 10mm 9mm;
        }

        @media print {
          .no-print {
            display: none !important;
          }

          body {
            background: white !important;
          }

          .print-page {
            box-shadow: none !important;
            margin: 0 !important;
            page-break-after: always;
          }

          .print-page:last-child {
            page-break-after: auto;
          }
        }

        body {
          font-family: "Yu Gothic", "YuGothic", "Meiryo", "Noto Sans JP",
            sans-serif;
        }
      `}</style>

            <div className="no-print sticky top-0 z-10 bg-white border-b p-3 flex gap-2 items-center">
                <button
                    className="border rounded px-4 py-2 bg-black text-white"
                    onClick={() => window.print()}
                >
                    印刷 / PDF保存
                </button>

                <button className="border rounded px-4 py-2" onClick={load}>
                    再読み込み
                </button>

                <div className="text-sm text-gray-600">
                    ブラウザの印刷画面で「PDFに保存」を選択してください。
                </div>
            </div>

            <main className="p-4 print:p-0">
                <section className="print-page bg-white mx-auto mb-6 shadow p-4 w-[210mm] min-h-[297mm] text-[10.5px] leading-relaxed">
                    <div className="grid grid-cols-2 mb-1 text-[11px]">
                        <div>作成日　{formatDate(plan.plan_start_date)}</div>
                        <div className="text-right">作成者　{plan.author_name ?? ""}</div>
                    </div>

                    <h1 className="text-center font-bold text-xl tracking-widest mb-2">
                        {title}
                    </h1>

                    <table className="w-full border-collapse border border-black">
                        <tbody>
                            <tr>
                                <Th>利用者名</Th>
                                <Td>{plan.kaipoke_cs_id}</Td>
                                <Th>生年月日</Th>
                                <Td>&nbsp;</Td>
                                <Th>連絡先</Th>
                                <Td>
                                    TEL:
                                    <br />
                                    FAX:
                                </Td>
                            </tr>
                            <tr>
                                <Th>住所</Th>
                                <Td colSpan={5}>&nbsp;</Td>
                            </tr>
                            <tr>
                                <Th>事業所名</Th>
                                <Td colSpan={5}>{OFFICE_NAME}</Td>
                            </tr>
                        </tbody>
                    </table>

                    <table className="w-full border-collapse border border-black mt-2">
                        <tbody>
                            <tr>
                                <Th className="w-[18%]">本人(家族)の希望</Th>
                                <Td className="h-[58px] whitespace-pre-wrap">
                                    {plan.person_family_hope ?? ""}
                                </Td>
                            </tr>
                            <tr>
                                <Th>援助目標</Th>
                                <Td className="h-[58px] whitespace-pre-wrap">
                                    {plan.assistance_goal ?? ""}
                                </Td>
                            </tr>
                            <tr>
                                <Th>備考</Th>
                                <Td className="h-[42px] whitespace-pre-wrap">
                                    {plan.remarks ?? ""}
                                </Td>
                            </tr>
                        </tbody>
                    </table>

                    <table className="w-full border-collapse border border-black mt-2">
                        <tbody>
                            <tr>
                                <Th className="w-[18%]">サービス内容</Th>
                                <Td>
                                    <div className="grid grid-cols-3 gap-x-4 gap-y-1">
                                        {monthlySummary.length === 0 ? (
                                            <>
                                                <div>□身体　時間</div>
                                                <div>□家事　時間</div>
                                                <div>□通院(伴う)　時間</div>
                                            </>
                                        ) : (
                                            monthlySummary.map((m, idx) => (
                                                <div key={`${m.category}-${idx}`}>
                                                    ■{m.category} {m.monthlyHours}時間
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </Td>
                            </tr>
                        </tbody>
                    </table>

                    <div className="font-bold text-base mt-3 mb-1">【計画予定表】</div>

                    <table className="w-full border-collapse border border-black text-center">
                        <thead>
                            <tr>
                                <Th>時間</Th>
                                {["月", "火", "水", "木", "金", "土", "日"].map((w) => (
                                    <Th key={w}>{w}</Th>
                                ))}
                                <Th className="w-[18%]">備考</Th>
                            </tr>
                        </thead>
                        <tbody>
                            {[
                                "2:00",
                                "4:00",
                                "6:00",
                                "8:00",
                                "10:00",
                                "12:00",
                                "14:00",
                                "16:00",
                                "18:00",
                                "20:00",
                                "22:00",
                                "24:00",
                            ].map((slot, idx) => (
                                <tr key={slot}>
                                    <Th>{slot}</Th>
                                    {["月", "火", "水", "木", "金", "土", "日"].map((w) => (
                                        <Td key={w} className="h-[28px] text-center">
                                            {(data.services ?? [])
                                                .filter((s) => s.weekday_jp === w)
                                                .filter((s) => isSameSlot(s.start_time, slot))
                                                .map(
                                                    (s) =>
                                                        s.plan_service_category ??
                                                        s.service_title ??
                                                        s.service_code ??
                                                        "",
                                                )
                                                .filter(Boolean)
                                                .join(" / ")}
                                        </Td>
                                    ))}
                                    <Td>{idx === 0 ? plan.weekly_plan_comment ?? "" : ""}</Td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    <div className="grid grid-cols-[90px_150px_110px_1fr] border border-black border-t-0 min-h-[44px]">
                        <div className="border-r border-black p-2 text-center font-bold">
                            交付日
                        </div>
                        <div className="border-r border-black p-2 text-center">
                            {formatDate(plan.issued_on)}
                        </div>
                        <div className="border-r border-black p-2 text-center font-bold">
                            利用者サイン
                        </div>
                        <div className="p-2">&nbsp;</div>
                    </div>

                    <div className="mt-2 text-[9.5px]">
                        計画期間　{formatDate(plan.plan_start_date)} -{" "}
                        {formatDate(plan.plan_end_date)}
                    </div>
                </section>

                <section className="print-page bg-white mx-auto mb-6 shadow p-4 w-[210mm] min-h-[297mm] text-[10.5px] leading-relaxed">
                    <div className="font-bold text-base mb-2">
                        【サービス内容】以下の方法で、居宅介護等サービスを提供していきます。
                    </div>

                    <table className="w-full border-collapse border border-black mb-2">
                        <tbody>
                            <tr>
                                <Th className="w-[12%]">種類等</Th>
                                <Td>
                                    {monthlySummary.map((m, idx) => (
                                        <span key={`${m.category}-type-${idx}`} className="mr-5">
                                            ■{m.category}（{m.monthlyHours}時間）
                                        </span>
                                    ))}
                                </Td>
                            </tr>
                        </tbody>
                    </table>

                    <table className="w-full border-collapse border border-black">
                        <thead>
                            <tr>
                                <Th className="w-[10%]">サービス</Th>
                                <Th className="w-[15%]">所要時間</Th>
                                <Th className="w-[22%]">サービスの内容</Th>
                                <Th className="w-[31%]">手順・留意事項・観察ポイント</Th>
                                <Th className="w-[22%]">
                                    本人・家族にやっていただくこと
                                </Th>
                            </tr>
                        </thead>
                        <tbody>
                            {groupedServices.map((s, idx) => (
                                <tr key={s.plan_service_id}>
                                    <Th>サービス{idx + 1}</Th>
                                    <Td className="whitespace-nowrap">
                                        {s.duration_minutes ? `${s.duration_minutes}分` : ""}
                                        <br />
                                        {s.weekday_jp ? `${s.weekday_jp} ` : ""}
                                        {(s.start_time ?? "").slice(0, 5)}
                                        {s.start_time || s.end_time ? " - " : ""}
                                        {(s.end_time ?? "").slice(0, 5)}
                                    </Td>
                                    <Td className="whitespace-pre-wrap">
                                        {s.service_detail || s.service_title || s.service_code || ""}
                                    </Td>
                                    <Td className="whitespace-pre-wrap">
                                        {s.procedure_notes || s.observation_points || ""}
                                    </Td>
                                    <Td className="whitespace-pre-wrap">
                                        {s.family_action ?? ""}
                                    </Td>
                                </tr>
                            ))}

                            {Array.from({
                                length: Math.max(0, 7 - groupedServices.length),
                            }).map((_, idx) => (
                                <tr key={`empty-${idx}`}>
                                    <Th>&nbsp;</Th>
                                    <Td className="h-[44px]">&nbsp;</Td>
                                    <Td>&nbsp;</Td>
                                    <Td>&nbsp;</Td>
                                    <Td>&nbsp;</Td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </section>
            </main>
        </div>
    );
}

function Th({
    children,
    className = "",
}: {
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <th
            className={`border border-black bg-gray-100 px-2 py-1 text-center font-bold ${className}`}
        >
            {children}
        </th>
    );
}

function Td({
    children,
    colSpan,
    className = "",
}: {
    children: React.ReactNode;
    colSpan?: number;
    className?: string;
}) {
    return (
        <td colSpan={colSpan} className={`border border-black px-2 py-1 ${className}`}>
            {children}
        </td>
    );
}

function normalizeMonthlySummary(v: unknown): Array<{
    category: string;
    monthlyHours: string;
}> {
    if (!Array.isArray(v)) return [];

    return v.map((x) => {
        const obj = x && typeof x === "object" ? (x as Record<string, unknown>) : {};
        const category =
            typeof obj.category === "string" && obj.category.trim()
                ? obj.category.trim()
                : "未分類";

        const rawHours = obj.monthly_hours;
        const monthlyHours =
            rawHours === null || rawHours === undefined ? "" : String(rawHours);

        return {
            category,
            monthlyHours,
        };
    });
}

function groupServicesForPrint(services: ServiceRow[]): ServiceRow[] {
    const map = new Map<string, ServiceRow>();

    for (const s of services) {
        const key = [
            s.start_time ?? "",
            s.end_time ?? "",
            s.duration_minutes ?? "",
            s.service_title ?? "",
            s.service_detail ?? "",
            s.procedure_notes ?? "",
            s.observation_points ?? "",
            s.family_action ?? "",
            s.schedule_note ?? "",
            s.plan_service_category ?? "",
        ].join("|");

        const existing = map.get(key);

        if (!existing) {
            map.set(key, {
                ...s,
                weekday_jp: s.weekday_jp ?? "",
            });
            continue;
        }

        const weekdays = new Set(
            [
                ...(existing.weekday_jp ?? "").split("・").filter(Boolean),
                s.weekday_jp ?? "",
            ].filter(Boolean),
        );

        existing.weekday_jp = sortWeekdays([...weekdays]).join("・");
    }

    return [...map.values()].sort((a, b) => {
        const aTime = `${a.start_time ?? ""}-${a.end_time ?? ""}`;
        const bTime = `${b.start_time ?? ""}-${b.end_time ?? ""}`;
        return aTime.localeCompare(bTime);
    });
}

function sortWeekdays(days: string[]): string[] {
    const order = ["月", "火", "水", "木", "金", "土", "日"];
    return [...days].sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

function isSameSlot(startTime: string | null, slot: string) {
    if (!startTime) return false;
    const hour = Number(startTime.slice(0, 2));
    const slotHour = Number(slot.split(":")[0]);
    if (!Number.isFinite(hour) || !Number.isFinite(slotHour)) return false;
    return hour >= slotHour && hour < slotHour + 2;
}

function formatDate(v: string | null | undefined) {
    return v ?? "";
}