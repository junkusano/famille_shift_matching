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

type ClientRow = {
    id: string;
    kaipoke_cs_id: string;
    name: string | null;
    name_kana: string | null;
    kana: string | null;
    birth_yyyy_mm_dd: string | null;
    postal_code: string | null;
    address: string | null;
    phone_01: string | null;
    phone_02: string | null;
    email: string | null;
    gender: string | null;
    service_kind: string | null;
    shogai_jukyusha_no: string | null;
    ido_jukyusyasho: string | null;
};

type AuthorRow = {
    user_id: string;
    lw_userid: string | null;
    last_name_kanji: string | null;
    first_name_kanji: string | null;
    display_name: string;
} | null;

type ApiData = {
    plan: PlanRow;
    services: ServiceRow[];
    client: ClientRow | null;
    author: AuthorRow;
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

    const { plan, client, author } = data;

    const title =
        plan.plan_document_kind === "移動支援サービス"
            ? "移動支援サービス計画書"
            : "居宅介護等計画書";

    return (
        <div className="print-root min-h-screen">
            <style jsx global>{`
  @page {
    size: A4 portrait;
    margin: 0mm;
  }

  html,
  body {
    margin: 0 !important;
    padding: 0 !important;
    font-family: "Yu Gothic", "YuGothic", "Meiryo", "Noto Sans JP", sans-serif;
    color: #111;
    background: #eee;
  }

  .print-root {
    background: #eee;
    padding: 12px;
  }

  .print-only {
    width: 210mm;
    margin: 0 auto;
    background: #fff;
  }

  .print-page {
    width: 210mm;
    display: flex;
    justify-content: center;
    background: #fff;
    box-sizing: border-box;
  }

  .print-page + .print-page {
    margin-top: 12px;
  }

  .formBox {
    width: 204mm;
    min-height: 287mm;
    background: #fff;
    box-sizing: border-box;
    padding: 3mm;
  }

  table {
    border-collapse: collapse;
    width: 100%;
  }

  th,
  td {
    break-inside: avoid;
    page-break-inside: avoid;
  }

  @media print {
    body * {
      visibility: hidden !important;
    }

    .print-only,
    .print-only * {
      visibility: visible !important;
    }

    html,
    body {
      background: #fff !important;
      width: auto !important;
      height: auto !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .no-print {
      display: none !important;
    }

    .print-root {
      padding: 0 !important;
      margin: 0 !important;
      background: #fff !important;
    }

    .print-only {
      position: absolute !important;
      left: 0 !important;
      top: 0 !important;
      width: 210mm !important;
      margin: 0 !important;
      padding: 0 !important;
      box-sizing: border-box !important;
      background: #fff !important;
    }

    .print-only .print-page {
      width: 210mm !important;
      margin: 0 !important;
      padding: 0 !important;
      box-sizing: border-box !important;
      display: flex !important;
      justify-content: center !important;
      background: #fff !important;
      box-shadow: none !important;
    }

    .print-only .print-page + .print-page {
      margin-top: 0 !important;
      page-break-before: always !important;
      break-before: page !important;
    }

    .print-only .print-page > .formBox {
      width: 204mm !important;
      min-height: 287mm !important;
      height: auto !important;
      margin: 0 auto !important;
      padding: 3mm !important;
      box-sizing: border-box !important;
      background: #fff !important;
      box-shadow: none !important;
      overflow: visible !important;
    }

    table {
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .screen-only-shadow {
      box-shadow: none !important;
    }
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

            <main className="print-only">
                <section className="print-page">
                    <div className="formBox screen-only-shadow text-[10.5px] leading-relaxed flex flex-col">
                        <div className="grid grid-cols-2 mb-1 text-[11px]">
                            <div>作成日　{formatDate(plan.plan_start_date)}</div>
                            <div className="text-right">
                                作成者　{getAuthorDisplayName(author, plan.author_name)}
                            </div>
                        </div>

                        <h1 className="text-center font-bold text-xl tracking-widest mb-2">
                            {title}
                        </h1>

                        <table className="w-full border-collapse border border-black">
                            <tbody>
                                <tr>
                                    <Th>利用者名</Th>
                                    <Td>{client?.name || "\u00a0"}</Td>

                                    <Th>生年月日</Th>
                                    <Td>{formatDate(client?.birth_yyyy_mm_dd) || "\u00a0"}</Td>

                                    <Th>連絡先</Th>
                                    <Td>
                                        TEL: {client?.phone_01 || "\u00a0"}
                                        <br />
                                        携帯: {client?.phone_02 || "\u00a0"}
                                    </Td>
                                </tr>

                                <tr>
                                    <Th>住所</Th>
                                    <Td colSpan={5}>
                                        {client?.postal_code ? `〒${client.postal_code} ` : ""}
                                        {client?.address || "\u00a0"}
                                    </Td>
                                </tr>

                                <tr>
                                    <Th>受給者番号</Th>
                                    <Td>{client?.shogai_jukyusha_no || client?.ido_jukyusyasho || "\u00a0"}</Td>

                                    <Th>カイポケID</Th>
                                    <Td>{client?.kaipoke_cs_id || plan.kaipoke_cs_id || "\u00a0"}</Td>

                                    <Th>事業所名</Th>
                                    <Td>{OFFICE_NAME}</Td>
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
                                            <Td key={w} className="h-[28px] text-center align-top">
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

                        <div className="print-signature-spacer mt-2 flex-1 flex flex-col justify-end">
                            <div className="grid grid-cols-[90px_150px_110px_1fr] border border-black min-h-[72px]">
                                <div className="border-r border-black p-2 text-center font-bold flex items-center justify-center">
                                    交付日
                                </div>

                                <div className="border-r border-black p-2 text-center flex items-center justify-center">
                                    {formatDate(plan.issued_on)}
                                </div>

                                <div className="border-r border-black p-2 text-center font-bold flex items-center justify-center">
                                    利用者サイン
                                </div>

                                <div className="p-2">&nbsp;</div>
                            </div>

                            <div className="mt-2 text-[9.5px]">
                                計画期間　{formatDate(plan.plan_start_date)} -{" "}
                                {formatDate(plan.plan_end_date)}
                            </div>
                        </div>
                    </div>
                </section>

                <section className="print-page">
                    <div className="formBox screen-only-shadow text-[10.5px] leading-relaxed flex flex-col">
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
                                    <Th className="w-[22%]">本人・家族にやっていただくこと</Th>
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
                                    length: 0,
                                }).map((_, idx) => (
                                    <tr key={`empty-${idx}`}>
                                        <Th>&nbsp;</Th>
                                        <Td className="h-[36px]">&nbsp;</Td>
                                        <Td>&nbsp;</Td>
                                        <Td>&nbsp;</Td>
                                        <Td>&nbsp;</Td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
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

function getAuthorDisplayName(author: AuthorRow, fallback: string | null | undefined) {
    if (author?.display_name?.trim()) return author.display_name.trim();
    return fallback ?? "";
}