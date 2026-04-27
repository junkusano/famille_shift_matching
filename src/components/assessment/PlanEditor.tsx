// src/components/assessment/PlanEditor.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const OFFICE_NAME = "ファミーユヘルパーサービス愛知";

async function getBearer() {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? `Bearer ${token}` : "";
}

export type PlanSummaryForEditor = {
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
    author_user_id: string | null;
    author_name: string | null;
    person_family_hope: string | null;
    assistance_goal: string | null;
    remarks: string | null;
    weekly_plan_comment: string | null;
    monthly_summary: unknown;
    pdf_file_url: string | null;
    pdf_generated_at: string | null;
    digisign_status: string | null;
    digisign_sent_at: string | null;
    digisign_completed_at: string | null;
    lineworks_sent_at: string | null;
    is_deleted: boolean;
    created_at: string;
    updated_at: string;
    content?: Record<string, unknown>;
};

export type PlanServiceForEditor = {
    plan_service_id: string;
    plan_id: string;
    template_id: number | null;
    shift_service_code_id: string | null;
    service_code: string | null;
    plan_document_kind: string;
    plan_service_category: string | null;
    display_order: number;
    service_no: number;
    weekday: number | null;
    weekday_jp: string | null;
    start_time: string | null;
    end_time: string | null;
    duration_minutes: number | null;
    is_biweekly: boolean | null;
    nth_weeks: number[] | null;
    monthly_occurrence_factor: number | string | null;
    monthly_minutes: number | null;
    monthly_hours: number | string | null;
    required_staff_count: number | null;
    two_person_work_flg: boolean;
    service_title: string | null;
    service_detail: string | null;
    procedure_notes: string | null;
    observation_points: string | null;
    family_action: string | null;
    schedule_note: string | null;
    source_snapshot: unknown;
    generation_meta: unknown;
    active: boolean;
    created_at: string;
    updated_at: string;
};

export type PlanDetailForEditor = {
    plan: PlanSummaryForEditor;
    services: PlanServiceForEditor[];
};

type Props = {
    detail: PlanDetailForEditor;
    onReload: (planId: string) => Promise<void> | void;
};

type PlanDraft = {
    title: string;
    issued_on: string;
    plan_start_date: string;
    plan_end_date: string;
    author_name: string;
    person_family_hope: string;
    assistance_goal: string;
    remarks: string;
    weekly_plan_comment: string;
};

export default function PlanEditor({ detail, onReload }: Props) {
    const [planDraft, setPlanDraft] = useState<PlanDraft>(() => toPlanDraft(detail.plan));
    const [serviceDrafts, setServiceDrafts] = useState<PlanServiceForEditor[]>(detail.services);
    const [savingPlan, setSavingPlan] = useState(false);
    const [savingServiceId, setSavingServiceId] = useState<string | null>(null);

    useEffect(() => {
        setPlanDraft(toPlanDraft(detail.plan));
        setServiceDrafts(detail.services);
    }, [detail.plan.plan_id, detail.services]);

    const monthlySummaryRows = useMemo(() => {
        if (!Array.isArray(detail.plan.monthly_summary)) return [];
        return detail.plan.monthly_summary as Array<{
            category?: string;
            monthly_minutes?: number;
            monthly_hours?: number | string;
            occurrence_factor?: number | string;
        }>;
    }, [detail.plan.monthly_summary]);

    async function savePlan() {

        setSavingPlan(true);
        try {
            const bearer = await getBearer();
            const res = await fetch(`/api/plans/${detail.plan.plan_id}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    ...(bearer ? { Authorization: bearer } : {}),
                },
                body: JSON.stringify({
                    title: planDraft.title,
                    issued_on: planDraft.issued_on,
                    plan_start_date: planDraft.plan_start_date,
                    plan_end_date: planDraft.plan_end_date,
                    author_name: planDraft.author_name,
                    person_family_hope: planDraft.person_family_hope,
                    assistance_goal: planDraft.assistance_goal,
                    remarks: planDraft.remarks,
                    weekly_plan_comment: planDraft.weekly_plan_comment,
                    content: {
                        office_name: OFFICE_NAME,
                    },
                }),
            });

            const j = await res.json();

            if (!j?.ok) {
                window.alert(`プラン保存に失敗: ${j?.error ?? "unknown error"}`);
                return;
            }

            await onReload(detail.plan.plan_id);
            window.alert("プランを保存しました。");
        } finally {
            setSavingPlan(false);
        }
    }

    async function saveService(service: PlanServiceForEditor) {
        setSavingServiceId(service.plan_service_id);
        try {
            const bearer = await getBearer();
            const res = await fetch(`/api/plan-services/${service.plan_service_id}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    ...(bearer ? { Authorization: bearer } : {}),
                },
                body: JSON.stringify({
                    service_title: service.service_title ?? "",
                    service_detail: service.service_detail ?? "",
                    procedure_notes: service.procedure_notes ?? "",
                    observation_points: service.observation_points ?? "",
                    family_action: service.family_action ?? "",
                    schedule_note: service.schedule_note ?? "",
                    display_order: service.display_order,
                    service_no: service.service_no,
                    monthly_occurrence_factor: service.monthly_occurrence_factor,
                    monthly_minutes: service.monthly_minutes,
                    monthly_hours: service.monthly_hours,
                }),
            });

            const j = await res.json();

            if (!j?.ok) {
                window.alert(`サービス保存に失敗: ${j?.error ?? "unknown error"}`);
                return;
            }

            await onReload(detail.plan.plan_id);
        } finally {
            setSavingServiceId(null);
        }
    }

    function updateService(
        planServiceId: string,
        patch: Partial<PlanServiceForEditor>,
    ) {
        setServiceDrafts((prev) =>
            prev.map((s) => (s.plan_service_id === planServiceId ? { ...s, ...patch } : s)),
        );
    }

    return (
        <div className="space-y-4">
            <div className="border rounded p-3 bg-white space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                        <div className="font-bold text-lg">計画書編集</div>
                        <div className="text-sm text-gray-500">
                            事業所名: {OFFICE_NAME}
                        </div>
                    </div>

                    <button
                        className="border rounded px-3 py-1 bg-black text-white disabled:opacity-40"
                        disabled={savingPlan}
                        onClick={savePlan}
                    >
                        {savingPlan ? "保存中..." : "計画書ヘッダ保存"}
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Field label="タイトル">
                        <input
                            className="border rounded px-2 py-1 w-full"
                            value={planDraft.title}
                            onChange={(e) => setPlanDraft({ ...planDraft, title: e.target.value })}
                        />
                    </Field>

                    <Field label="作成者">
                        <input
                            className="border rounded px-2 py-1 w-full"
                            value={planDraft.author_name}
                            onChange={(e) => setPlanDraft({ ...planDraft, author_name: e.target.value })}
                        />
                    </Field>

                    <Field label="交付日">
                        <input
                            type="date"
                            className="border rounded px-2 py-1 w-full"
                            value={planDraft.issued_on}
                            onChange={(e) => setPlanDraft({ ...planDraft, issued_on: e.target.value })}
                        />
                    </Field>

                    <Field label="計画開始日">
                        <input
                            type="date"
                            className="border rounded px-2 py-1 w-full"
                            value={planDraft.plan_start_date}
                            onChange={(e) => setPlanDraft({ ...planDraft, plan_start_date: e.target.value })}
                        />
                    </Field>

                    <Field label="計画終了日">
                        <input
                            type="date"
                            className="border rounded px-2 py-1 w-full"
                            value={planDraft.plan_end_date}
                            onChange={(e) => setPlanDraft({ ...planDraft, plan_end_date: e.target.value })}
                        />
                    </Field>
                </div>

                <Field label="本人（家族）の希望">
                    <textarea
                        className="border rounded px-2 py-1 w-full min-h-[80px]"
                        value={planDraft.person_family_hope}
                        onChange={(e) =>
                            setPlanDraft({ ...planDraft, person_family_hope: e.target.value })
                        }
                    />
                </Field>

                <Field label="援助目標">
                    <textarea
                        className="border rounded px-2 py-1 w-full min-h-[80px]"
                        value={planDraft.assistance_goal}
                        onChange={(e) =>
                            setPlanDraft({ ...planDraft, assistance_goal: e.target.value })
                        }
                    />
                </Field>

                <Field label="週間計画コメント">
                    <textarea
                        className="border rounded px-2 py-1 w-full min-h-[60px]"
                        value={planDraft.weekly_plan_comment}
                        onChange={(e) =>
                            setPlanDraft({ ...planDraft, weekly_plan_comment: e.target.value })
                        }
                    />
                </Field>

                <Field label="備考（必須）">
                    <textarea
                        className="border rounded px-2 py-1 w-full min-h-[70px]"
                        value={planDraft.remarks}
                        onChange={(e) => setPlanDraft({ ...planDraft, remarks: e.target.value })}
                        placeholder="必要に応じて備考を入力(2名介助の場合にはその旨記載が必要です）"
                    />
                </Field>
            </div>

            <div className="border rounded p-3 bg-white space-y-3">
                <div className="font-bold text-lg">サービス詳細編集</div>

                {serviceDrafts.length === 0 ? (
                    <div className="text-sm text-gray-500">サービス明細がありません。</div>
                ) : (
                    <div className="space-y-3">
                        {serviceDrafts.map((s, index) => (
                            <div key={s.plan_service_id} className="border rounded p-3 space-y-3 bg-gray-50">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="font-semibold">
                                        サービス{index + 1} / {s.weekday_jp ?? ""}{" "}
                                        {(s.start_time ?? "").slice(0, 5)}
                                        {s.start_time || s.end_time ? " - " : ""}
                                        {(s.end_time ?? "").slice(0, 5)}
                                    </div>

                                    <button
                                        className="border rounded px-3 py-1 bg-blue-600 text-white disabled:opacity-40"
                                        disabled={savingServiceId === s.plan_service_id}
                                        onClick={() => saveService(s)}
                                    >
                                        {savingServiceId === s.plan_service_id ? "保存中..." : "このサービスを保存"}
                                    </button>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <Field label="サービス名">
                                        <input
                                            className="border rounded px-2 py-1 w-full"
                                            value={s.service_title ?? ""}
                                            onChange={(e) =>
                                                updateService(s.plan_service_id, { service_title: e.target.value })
                                            }
                                        />
                                    </Field>

                                    <Field label="月時間">
                                        <input
                                            className="border rounded px-2 py-1 w-full"
                                            value={s.monthly_hours ?? ""}
                                            onChange={(e) =>
                                                updateService(s.plan_service_id, { monthly_hours: e.target.value })
                                            }
                                        />
                                    </Field>

                                    <Field label="備考">
                                        <input
                                            className="border rounded px-2 py-1 w-full"
                                            value={s.schedule_note ?? ""}
                                            onChange={(e) =>
                                                updateService(s.plan_service_id, { schedule_note: e.target.value })
                                            }
                                        />
                                    </Field>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <Field label="サービスの内容">
                                        <textarea
                                            className="border rounded px-2 py-1 w-full min-h-[90px]"
                                            value={s.service_detail ?? ""}
                                            onChange={(e) =>
                                                updateService(s.plan_service_id, { service_detail: e.target.value })
                                            }
                                            placeholder="例: 掃除、整理整頓 / 買い物"
                                        />
                                    </Field>

                                    <Field label="手順・留意事項・観察ポイント">
                                        <textarea
                                            className="border rounded px-2 py-1 w-full min-h-[90px]"
                                            value={s.procedure_notes ?? ""}
                                            onChange={(e) =>
                                                updateService(s.plan_service_id, { procedure_notes: e.target.value })
                                            }
                                            placeholder="例: 居室・水回りの清掃"
                                        />
                                    </Field>

                                    <Field label="本人・家族にやっていただくこと">
                                        <textarea
                                            className="border rounded px-2 py-1 w-full min-h-[90px]"
                                            value={s.family_action ?? ""}
                                            onChange={(e) =>
                                                updateService(s.plan_service_id, { family_action: e.target.value })
                                            }
                                        />
                                    </Field>
                                </div>

                                <Field label="観察ポイント">
                                    <textarea
                                        className="border rounded px-2 py-1 w-full min-h-[60px]"
                                        value={s.observation_points ?? ""}
                                        onChange={(e) =>
                                            updateService(s.plan_service_id, { observation_points: e.target.value })
                                        }
                                    />
                                </Field>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <PlanPreview
                plan={detail.plan}
                planDraft={planDraft}
                services={serviceDrafts}
                monthlySummaryRows={monthlySummaryRows}
            />
        </div>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="block">
            <div className="text-sm font-semibold mb-1">{label}</div>
            {children}
        </label>
    );
}

function PlanPreview({
    plan,
    planDraft,
    services,
    monthlySummaryRows,
}: {
    plan: PlanSummaryForEditor;
    planDraft: PlanDraft;
    services: PlanServiceForEditor[];
    monthlySummaryRows: Array<{
        category?: string;
        monthly_minutes?: number;
        monthly_hours?: number | string;
        occurrence_factor?: number | string;
    }>;
}) {
    const groupedServices = groupServicesForPreview(services);
    return (
        <div className="border rounded p-3 bg-white space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <div className="font-bold text-lg">PDFプレビュー</div>
                    <div className="text-sm text-gray-500">
                        既定フォーマットに近い表示です。次工程でPDF化します。
                    </div>
                </div>
            </div>

            <div className="border border-black p-2 bg-white text-xs overflow-x-auto">
                <div className="text-center font-bold text-xl mb-2">
                    {plan.plan_document_kind === "移動支援サービス"
                        ? "移動支援サービス計画書"
                        : "居宅介護等計画書"}
                </div>

                <table className="w-full border-collapse border border-black">
                    <tbody>
                        <tr>
                            <Th>事業所名</Th>
                            <Td colSpan={3}>{OFFICE_NAME}</Td>
                            <Th>作成者</Th>
                            <Td>{planDraft.author_name}</Td>
                        </tr>
                        <tr>
                            <Th>作成日</Th>
                            <Td>{formatDate(planDraft.plan_start_date)}</Td>
                            <Th>交付日</Th>
                            <Td>{formatDate(planDraft.issued_on)}</Td>
                            <Th>計画期間</Th>
                            <Td>
                                {formatDate(planDraft.plan_start_date)}
                                {planDraft.plan_start_date || planDraft.plan_end_date ? " - " : ""}
                                {formatDate(planDraft.plan_end_date)}
                            </Td>
                        </tr>
                        <tr>
                            <Th>利用者番号</Th>
                            <Td>{plan.kaipoke_cs_id}</Td>
                            <Th>帳票種別</Th>
                            <Td colSpan={3}>{plan.plan_document_kind}</Td>
                        </tr>
                    </tbody>
                </table>

                <table className="w-full border-collapse border border-black mt-2">
                    <tbody>
                        <tr>
                            <Th className="w-[140px]">本人(家族)の希望</Th>
                            <Td className="min-h-[55px] whitespace-pre-wrap" colSpan={5}>
                                {planDraft.person_family_hope}
                            </Td>
                        </tr>
                        <tr>
                            <Th>援助目標</Th>
                            <Td className="min-h-[55px] whitespace-pre-wrap" colSpan={5}>
                                {planDraft.assistance_goal}
                            </Td>
                        </tr>
                        <tr>
                            <Th>備考</Th>
                            <Td className="min-h-[45px] whitespace-pre-wrap" colSpan={5}>
                                {planDraft.remarks}
                            </Td>
                        </tr>
                    </tbody>
                </table>

                <table className="w-full border-collapse border border-black mt-2">
                    <tbody>
                        <tr>
                            <Th className="w-[140px]">サービス内容</Th>
                            <Td>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1">
                                    {monthlySummaryRows.length === 0 ? (
                                        <span>集計なし</span>
                                    ) : (
                                        monthlySummaryRows.map((m, idx) => (
                                            <span key={`${m.category}-${idx}`}>
                                                ■{m.category ?? "未分類"} {m.monthly_hours ?? ""}時間
                                            </span>
                                        ))
                                    )}
                                </div>
                            </Td>
                        </tr>
                    </tbody>
                </table>

                <div className="font-bold text-base mt-3 mb-1">【計画予定表】</div>
                <table className="w-full border-collapse border border-black">
                    <thead>
                        <tr>
                            <Th>時間</Th>
                            <Th>月</Th>
                            <Th>火</Th>
                            <Th>水</Th>
                            <Th>木</Th>
                            <Th>金</Th>
                            <Th>土</Th>
                            <Th>日</Th>
                            <Th>備考</Th>
                        </tr>
                    </thead>
                    <tbody>
                        {["2:00", "4:00", "6:00", "8:00", "10:00", "12:00", "14:00", "16:00", "18:00", "20:00", "22:00", "24:00"].map((time) => (
                            <tr key={time}>
                                <Th>{time}</Th>
                                {["月", "火", "水", "木", "金", "土", "日"].map((w) => (
                                    <Td key={w} className="h-[28px] align-top">
                                        {services
                                            .filter((s) => s.weekday_jp === w)
                                            .filter((s) => isSameSlot(s.start_time, time))
                                            .map((s) => s.plan_service_category ?? s.service_title ?? s.service_code ?? "")
                                            .join(" / ")}
                                    </Td>
                                ))}
                                <Td className="align-top">
                                    {time === "2:00" ? planDraft.weekly_plan_comment : ""}
                                </Td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                <div className="grid grid-cols-[140px_180px_140px_1fr] border border-black mt-2">
                    <div className="border-r border-black p-2 font-bold text-center">交付日</div>
                    <div className="border-r border-black p-2 text-center">
                        {formatDate(planDraft.issued_on)}
                    </div>
                    <div className="border-r border-black p-2 font-bold text-center">
                        利用者サイン
                    </div>
                    <div className="p-2 min-h-[44px]">&nbsp;</div>
                </div>
            </div>

            <div className="border border-black p-2 bg-white text-xs overflow-x-auto">
                <div className="font-bold mb-2">
                    【サービス内容】以下の方法で、居宅介護等サービスを提供していきます。
                </div>

                <table className="w-full border-collapse border border-black">
                    <thead>
                        <tr>
                            <Th className="w-[80px]">サービス</Th>
                            <Th className="w-[100px]">所要時間</Th>
                            <Th className="w-[180px]">サービスの内容</Th>
                            <Th>手順・留意事項・観察ポイント</Th>
                            <Th>本人・家族にやっていただくこと</Th>
                        </tr>
                    </thead>
                    <tbody>
                        {groupedServices.map((s, idx) => (
                            <tr key={s.plan_service_id}>
                                <Th>サービス{idx + 1}</Th>
                                <Td className="align-top">
                                    {s.duration_minutes ? `${s.duration_minutes}分` : ""}
                                    <div>
                                        {s.weekday_jp ? `${s.weekday_jp} ` : ""}
                                        {(s.start_time ?? "").slice(0, 5)}
                                        {s.start_time || s.end_time ? " - " : ""}
                                        {(s.end_time ?? "").slice(0, 5)}
                                    </div>
                                </Td>
                                <Td className="align-top whitespace-pre-wrap">
                                    {s.service_detail || s.service_title || s.service_code || ""}
                                </Td>
                                <Td className="align-top whitespace-pre-wrap">
                                    {[s.procedure_notes, s.observation_points]
                                        .filter(Boolean)
                                        .join("\n")}
                                </Td>
                                <Td className="align-top whitespace-pre-wrap">
                                    {s.family_action ?? ""}
                                </Td>
                            </tr>
                        ))}

                        {Array.from({ length: Math.max(0, 7 - groupedServices.length) }).map((_, idx) => (
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

                <table className="w-full border-collapse border border-black mt-2">
                    <tbody>
                        <tr>
                            <Th className="w-[80px]">種類等</Th>
                            <Td>
                                {monthlySummaryRows.length === 0 ? (
                                    <span>□身体（時間　分） □家事（時間　分） □重訪（時間　分）</span>
                                ) : (
                                    monthlySummaryRows.map((m, idx) => (
                                        <span key={`${m.category}-type-${idx}`} className="mr-4">
                                            ■{m.category ?? "未分類"}（{m.monthly_hours ?? ""}時間）
                                        </span>
                                    ))
                                )}
                            </Td>
                        </tr>
                    </tbody>
                </table>
            </div>
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
        <th className={`border border-black bg-gray-100 px-2 py-1 text-center font-bold ${className}`}>
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

function toPlanDraft(plan: PlanSummaryForEditor): PlanDraft {
    return {
        title: plan.title ?? "",
        issued_on: plan.issued_on ?? "",
        plan_start_date: plan.plan_start_date ?? "",
        plan_end_date: plan.plan_end_date ?? "",
        author_name: plan.author_name ?? "",
        person_family_hope: plan.person_family_hope ?? "",
        assistance_goal: plan.assistance_goal ?? "",
        remarks: plan.remarks ?? "",
        weekly_plan_comment: plan.weekly_plan_comment ?? "",
    };
}

function formatDate(v: string | null | undefined) {
    if (!v) return "";
    return v;
}

function isSameSlot(startTime: string | null, slot: string) {
    if (!startTime) return false;
    const hour = Number(startTime.slice(0, 2));
    const slotHour = Number(slot.split(":")[0]);
    if (!Number.isFinite(hour) || !Number.isFinite(slotHour)) return false;
    return hour >= slotHour && hour < slotHour + 2;
}

function groupServicesForPreview(
    services: PlanServiceForEditor[],
): PlanServiceForEditor[] {
    const map = new Map<string, PlanServiceForEditor>();

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