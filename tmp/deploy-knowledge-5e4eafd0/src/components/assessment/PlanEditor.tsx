// src/components/assessment/PlanEditor.tsx
"use client";

import { useEffect, useState } from "react";
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

    /*
     * 介護保険計画書専用項目
     */
    care_service_history: string | null;
    identified_needs: string | null;
    health_status: string | null;
    medical_care_risks: string | null;
    home_activity_participation: string | null;

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



/*
 * 長期目標
 */
export type PlanLongTermGoalForEditor = {
    plan_long_term_goal_id: string;
    plan_id: string;
    display_order: number;

    goal_start_date: string | null;
    goal_end_date: string | null;
    goal_text: string;

    achievement_level: string | null;
    effectiveness_satisfaction: string | null;

    active: boolean;
    created_at: string;
    updated_at: string;
};

/*
 * 短期目標
 */
export type PlanShortTermGoalForEditor = {
    plan_short_term_goal_id: string;
    plan_long_term_goal_id: string;
    display_order: number;

    goal_start_date: string | null;
    goal_end_date: string | null;
    goal_text: string;

    achievement_level: string | null;
    effectiveness_satisfaction: string | null;

    active: boolean;
    created_at: string;
    updated_at: string;
};

/*
 * 長期目標と、それに属する短期目標を
 * 画面で扱いやすい形にまとめる。
 */
export type PlanGoalGroupForEditor = {
    long_term_goal: PlanLongTermGoalForEditor;
    short_term_goals: PlanShortTermGoalForEditor[];
};

/*
 * このプランで選択・保存された
 * 基準ケアプラン
 */
export type BaseCarePlanForEditor = {
    id: string;
    kaipoke_cs_id: string | null;
    doc_name: string | null;
    summary: string | null;
    url: string | null;
    applicable_date: string | null;
    doc_date_raw: string | null;
    created_at: string | null;
};

export type PlanDetailForEditor = {
    plan: PlanSummaryForEditor;
    services: PlanServiceForEditor[];

    goal_groups?: PlanGoalGroupForEditor[];

    /*
     * 選択済みの基準ケアプラン
     */
    base_care_plan?: BaseCarePlanForEditor | null;
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

    /*
     * 介護保険計画書専用項目
     */
    care_service_history: string;
    identified_needs: string;
    health_status: string;
    medical_care_risks: string;
    home_activity_participation: string;

    remarks: string;
    weekly_plan_comment: string;
};

export default function PlanEditor({ detail, onReload }: Props) {
    const [planDraft, setPlanDraft] =
        useState<PlanDraft>(
            () => toPlanDraft(detail.plan),
        );

    const [serviceDrafts, setServiceDrafts] =
        useState<PlanServiceForEditor[]>(
            detail.services,
        );

    const [goalGroupDrafts, setGoalGroupDrafts] =
        useState<PlanGoalGroupForEditor[]>(
            detail.goal_groups ?? [],
        );

    const [savingPlan, setSavingPlan] =
        useState(false);

    const [savingServiceId, setSavingServiceId] =
        useState<string | null>(null);

    const [addingService, setAddingService] =
        useState(false);

    useEffect(() => {
        setPlanDraft(
            toPlanDraft(detail.plan),
        );

        setServiceDrafts(
            detail.services,
        );

        setGoalGroupDrafts(
            detail.goal_groups ?? [],
        );
    }, [
        detail.plan,
        detail.services,
        detail.goal_groups,
    ]);

    const isElderCarePlan =
        detail.plan.plan_document_kind ===
        "訪問介護サービス" ||
        detail.plan.plan_document_kind ===
        "訪問介護予防サービス";

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
                    title:
                        planDraft.title,

                    issued_on:
                        planDraft.issued_on,

                    plan_start_date:
                        planDraft.plan_start_date,

                    plan_end_date:
                        planDraft.plan_end_date,

                    author_name:
                        planDraft.author_name,

                    person_family_hope:
                        planDraft.person_family_hope,

                    assistance_goal:
                        planDraft.assistance_goal,

                    /*
                     * 介護保険計画書専用項目
                     */
                    care_service_history:
                        planDraft.care_service_history,

                    identified_needs:
                        planDraft.identified_needs,

                    health_status:
                        planDraft.health_status,

                    medical_care_risks:
                        planDraft.medical_care_risks,

                    home_activity_participation:
                        planDraft.home_activity_participation,

                    remarks:
                        planDraft.remarks,

                    weekly_plan_comment:
                        planDraft.weekly_plan_comment,

                    /*
                     * 長期目標・短期目標
                     */
                    goal_groups:
                        goalGroupDrafts,

                    /*
                     * 生成時に保存された
                     * base_care_planやassessment_contentを
                     * 消さないようにする。
                     */
                    content: {
                        ...(detail.plan.content ?? {}),
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
                    weekday: service.weekday,
                    start_time: service.start_time,
                    end_time: service.end_time,
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
        } catch (error) {
            window.alert(
                `サービス保存に失敗: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
        } finally {
            setSavingServiceId(null);
        }
    }

    async function addService() {
        setAddingService(true);
        try {
            const bearer = await getBearer();
            const res = await fetch("/api/plan-services", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...(bearer ? { Authorization: bearer } : {}),
                },
                body: JSON.stringify({ plan_id: detail.plan.plan_id }),
            });
            const result = await res.json();
            if (!res.ok || !result?.ok) {
                window.alert(`サービス追加に失敗: ${result?.error ?? "unknown error"}`);
                return;
            }
            setServiceDrafts((previous) => [
                ...previous,
                result.data as PlanServiceForEditor,
            ]);
        } catch (error) {
            window.alert(
                `サービス追加に失敗: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
        } finally {
            setAddingService(false);
        }
    }

    async function copyText(value: string | null, label: string) {
        const text = value?.trim() ?? "";
        if (!text) return;

        try {
            await navigator.clipboard.writeText(text);
        } catch {
            window.prompt(`${label}をコピーしてください`, text);
        }
    }

    function updateService(
        planServiceId: string,
        patch: Partial<PlanServiceForEditor>,
    ) {
        setServiceDrafts((prev) =>
            prev.map((s) =>
                s.plan_service_id === planServiceId
                    ? { ...s, ...patch }
                    : s
            ),
        );
    }

    /*
     * 長期目標を変更
     */
    function updateLongTermGoal(
        planLongTermGoalId: string,
        patch: Partial<PlanLongTermGoalForEditor>,
    ) {
        setGoalGroupDrafts((prev) =>
            prev.map((group) =>
                group.long_term_goal
                    .plan_long_term_goal_id ===
                    planLongTermGoalId
                    ? {
                        ...group,
                        long_term_goal: {
                            ...group.long_term_goal,
                            ...patch,
                        },
                    }
                    : group,
            ),
        );
    }

    /*
     * 短期目標を変更
     */
    function updateShortTermGoal(
        planShortTermGoalId: string,
        patch: Partial<PlanShortTermGoalForEditor>,
    ) {
        setGoalGroupDrafts((prev) =>
            prev.map((group) => ({
                ...group,

                short_term_goals:
                    group.short_term_goals.map(
                        (shortTermGoal) =>
                            shortTermGoal
                                .plan_short_term_goal_id ===
                                planShortTermGoalId
                                ? {
                                    ...shortTermGoal,
                                    ...patch,
                                }
                                : shortTermGoal,
                    ),
            })),
        );
    }

    function fillEmptyGoalDatesFromPeriod(
        sourceStartDate: string | null,
        sourceEndDate: string | null,
    ) {
        if (!isElderCarePlan) return;
        if (!sourceStartDate?.trim() || !sourceEndDate?.trim()) {
            window.alert(
                "この目標の開始日と終了日の両方を入力してから実行してください。",
            );
            return;
        }

        const allGoals = goalGroupDrafts.flatMap((group) => [
            group.long_term_goal,
            ...group.short_term_goals,
        ]);
        const targetCount = allGoals.filter(
            (goal) => !goal.goal_start_date?.trim() || !goal.goal_end_date?.trim(),
        ).length;
        if (targetCount === 0) {
            window.alert("開始日・終了日が空欄の目標はありません。");
            return;
        }

        setGoalGroupDrafts((previous) =>
            previous.map((group) => ({
                ...group,
                long_term_goal: {
                    ...group.long_term_goal,
                    goal_start_date:
                        group.long_term_goal.goal_start_date || sourceStartDate,
                    goal_end_date:
                        group.long_term_goal.goal_end_date || sourceEndDate,
                },
                short_term_goals: group.short_term_goals.map((goal) => ({
                    ...goal,
                    goal_start_date: goal.goal_start_date || sourceStartDate,
                    goal_end_date: goal.goal_end_date || sourceEndDate,
                })),
            })),
        );

        window.alert(
            `この目標の期間（${sourceStartDate} ～ ${sourceEndDate}）を、日付が空欄の目標 ${targetCount}件へ画面上で反映しました。保存ボタンを押すまでデータベースには保存されません。`,
        );
    }

    function addLongTermGoal() {
        const now = new Date().toISOString();
        const planLongTermGoalId = `draft-long-${crypto.randomUUID()}`;
        setGoalGroupDrafts((previous) => [
            ...previous,
            {
                long_term_goal: {
                    plan_long_term_goal_id: planLongTermGoalId,
                    plan_id: detail.plan.plan_id,
                    display_order: previous.length + 1,
                    goal_start_date: null,
                    goal_end_date: null,
                    goal_text: "",
                    achievement_level: null,
                    effectiveness_satisfaction: null,
                    active: true,
                    created_at: now,
                    updated_at: now,
                },
                short_term_goals: [],
            },
        ]);
    }

    function addShortTermGoal(planLongTermGoalId: string) {
        const now = new Date().toISOString();
        setGoalGroupDrafts((previous) =>
            previous.map((group) =>
                group.long_term_goal.plan_long_term_goal_id === planLongTermGoalId
                    ? {
                        ...group,
                        short_term_goals: [
                            ...group.short_term_goals,
                            {
                                plan_short_term_goal_id: `draft-short-${crypto.randomUUID()}`,
                                plan_long_term_goal_id: planLongTermGoalId,
                                display_order: group.short_term_goals.length + 1,
                                goal_start_date: null,
                                goal_end_date: null,
                                goal_text: "",
                                achievement_level: null,
                                effectiveness_satisfaction: null,
                                active: true,
                                created_at: now,
                                updated_at: now,
                            },
                        ],
                    }
                    : group,
            ),
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

                    <div className="flex flex-wrap gap-2">
                        <PlanSaveButton saving={savingPlan} onClick={savePlan} />
                    </div>

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
                            setPlanDraft({
                                ...planDraft,
                                assistance_goal:
                                    e.target.value,
                            })
                        }
                    />
                </Field>

                {isElderCarePlan ? (
                    <div className="rounded border bg-blue-50 p-3 space-y-3">
                        <div>
                            <div className="font-bold text-lg">
                                介護保険計画書項目
                            </div>

                            <div className="text-sm text-gray-600">
                                ケアプラン、アセスメント、担当者会議等から生成された内容です。
                            </div>
                        </div>

                        <Field label="訪問介護利用までの経緯（活動歴や病歴）">
                            <textarea
                                className="border rounded px-2 py-1 w-full min-h-[90px] bg-white"
                                value={
                                    planDraft
                                        .care_service_history
                                }
                                onChange={(e) =>
                                    setPlanDraft({
                                        ...planDraft,
                                        care_service_history:
                                            e.target.value,
                                    })
                                }
                            />
                        </Field>

                        <Field label="解決すべき課題">
                            <textarea
                                className="border rounded px-2 py-1 w-full min-h-[100px] bg-white"
                                value={
                                    planDraft.identified_needs
                                }
                                onChange={(e) =>
                                    setPlanDraft({
                                        ...planDraft,
                                        identified_needs:
                                            e.target.value,
                                    })
                                }
                            />
                        </Field>

                        <Field label="健康状態（病名、合併症、服薬状況等）">
                            <textarea
                                className="border rounded px-2 py-1 w-full min-h-[100px] bg-white"
                                value={
                                    planDraft.health_status
                                }
                                onChange={(e) =>
                                    setPlanDraft({
                                        ...planDraft,
                                        health_status:
                                            e.target.value,
                                    })
                                }
                            />
                        </Field>

                        <Field label="ケアの上での医学的リスク（血圧、転倒、嚥下障害等・留意事項）">
                            <textarea
                                className="border rounded px-2 py-1 w-full min-h-[100px] bg-white"
                                value={
                                    planDraft
                                        .medical_care_risks
                                }
                                onChange={(e) =>
                                    setPlanDraft({
                                        ...planDraft,
                                        medical_care_risks:
                                            e.target.value,
                                    })
                                }
                            />
                        </Field>

                        <Field label="自宅での活動・参加の状況（役割など）">
                            <textarea
                                className="border rounded px-2 py-1 w-full min-h-[100px] bg-white"
                                value={
                                    planDraft
                                        .home_activity_participation
                                }
                                onChange={(e) =>
                                    setPlanDraft({
                                        ...planDraft,
                                        home_activity_participation:
                                            e.target.value,
                                    })
                                }
                            />
                        </Field>
                    </div>
                ) : null}

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
                        onChange={(e) =>
                            setPlanDraft({
                                ...planDraft,
                                remarks: e.target.value,
                            })
                        }
                        placeholder="必要に応じて備考を入力(2名介助の場合にはその旨記載が必要です）"
                    />
                </Field>
            </div>

            {/* 選択済みケアプラン */}
            <div className="border rounded p-3 bg-white space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                        <div className="font-bold text-lg">
                            基準ケアプラン
                        </div>

                        <div className="text-sm text-gray-500">
                            このプラン生成時に選択・保存されたケアプランです。
                        </div>
                    </div>

                    {detail.base_care_plan?.url ? (
                        <a
                            href={detail.base_care_plan.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="border rounded px-3 py-1 bg-blue-600 text-white"
                        >
                            ケアプラン原本を別タブで開く
                        </a>
                    ) : null}
                </div>

                {detail.base_care_plan ? (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <Field label="文書名">
                                <div className="border rounded px-2 py-1 min-h-[34px] bg-gray-50">
                                    {detail.base_care_plan.doc_name ?? ""}
                                </div>
                            </Field>

                            <Field label="適用日">
                                <div className="border rounded px-2 py-1 min-h-[34px] bg-gray-50">
                                    {formatDate(
                                        detail.base_care_plan
                                            .applicable_date,
                                    )}
                                </div>
                            </Field>

                            <Field label="文書ID">
                                <div className="border rounded px-2 py-1 min-h-[34px] bg-gray-50 break-all">
                                    {detail.base_care_plan.id}
                                </div>
                            </Field>
                        </div>

                        <Field label="ケアプラン要約（全文）">
                            <div className="border rounded px-3 py-2 min-h-[120px] bg-gray-50 whitespace-pre-wrap break-words">
                                {detail.base_care_plan.summary?.trim() ||
                                    "要約は登録されていません。"}
                            </div>
                        </Field>
                    </>
                ) : (
                    <div className="rounded border border-dashed p-4 text-sm text-gray-500">
                        このプランには基準ケアプランが保存されていません。
                    </div>
                )}
            </div>

            {/* 長期目標・短期目標 */}
            <div className="border rounded p-3 bg-white space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <div className="font-bold text-lg">
                            利用目標編集
                        </div>

                        <div className="text-sm text-gray-500">
                            ケアプランから抽出した目標と期間です。
                            原文と照合し、必要な場合のみ修正してください。
                        </div>
                    </div>
                    <button
                        type="button"
                        className="rounded border border-blue-700 bg-blue-700 px-3 py-2 text-sm font-semibold text-white"
                        onClick={addLongTermGoal}
                    >
                        長期目標を追加
                    </button>
                </div>
                {goalGroupDrafts.length === 0 ? (
                    <div className="rounded border border-dashed p-4 text-sm text-gray-500">
                        長期目標・短期目標が登録されていません。
                    </div>
                ) : (
                    <div className="space-y-5">
                        {goalGroupDrafts.map(
                            (group, groupIndex) => {
                                const longGoal =
                                    group.long_term_goal;

                                return (
                                    <div
                                        key={
                                            longGoal
                                                .plan_long_term_goal_id
                                        }
                                        className="rounded border p-4 space-y-4 bg-gray-50"
                                    >
                                        <div className="font-semibold text-base">
                                            目標組
                                            {groupIndex + 1}
                                        </div>

                                        {/* 長期目標 */}
                                        <div className="rounded border bg-white p-3 space-y-3">
                                            <div className="font-bold">
                                                長期目標
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                <Field label="開始日">
                                                    <input
                                                        type="date"
                                                        className="border rounded px-2 py-1 w-full"
                                                        value={
                                                            longGoal
                                                                .goal_start_date ??
                                                            ""
                                                        }
                                                        onChange={(
                                                            e,
                                                        ) =>
                                                            updateLongTermGoal(
                                                                longGoal
                                                                    .plan_long_term_goal_id,
                                                                {
                                                                    goal_start_date:
                                                                        e
                                                                            .target
                                                                            .value ||
                                                                        null,
                                                                },
                                                            )
                                                        }
                                                    />
                                                </Field>

                                                <Field label="終了日">
                                                    <input
                                                        type="date"
                                                        className="border rounded px-2 py-1 w-full"
                                                        value={
                                                            longGoal
                                                                .goal_end_date ??
                                                            ""
                                                        }
                                                        onChange={(
                                                            e,
                                                        ) =>
                                                            updateLongTermGoal(
                                                                longGoal
                                                                    .plan_long_term_goal_id,
                                                                {
                                                                    goal_end_date:
                                                                        e
                                                                            .target
                                                                            .value ||
                                                                        null,
                                                                },
                                                            )
                                                        }
                                                    />
                                                </Field>
                                            </div>

                                            {isElderCarePlan ? (
                                                <button
                                                    type="button"
                                                    className="rounded border border-blue-600 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800 disabled:border-gray-300 disabled:bg-gray-100 disabled:text-gray-400"
                                                    disabled={
                                                        !longGoal.goal_start_date ||
                                                        !longGoal.goal_end_date
                                                    }
                                                    onClick={() =>
                                                        fillEmptyGoalDatesFromPeriod(
                                                            longGoal.goal_start_date,
                                                            longGoal.goal_end_date,
                                                        )
                                                    }
                                                >
                                                    この期間を空欄の目標へ反映
                                                </button>
                                            ) : null}
                                            <Field label="目標内容">
                                                <textarea
                                                    className="border rounded px-2 py-1 w-full min-h-[90px]"
                                                    value={
                                                        longGoal
                                                            .goal_text ??
                                                        ""
                                                    }
                                                    onChange={(
                                                        e,
                                                    ) =>
                                                        updateLongTermGoal(
                                                            longGoal
                                                                .plan_long_term_goal_id,
                                                            {
                                                                goal_text:
                                                                    e
                                                                        .target
                                                                        .value,
                                                            },
                                                        )
                                                    }
                                                />
                                            </Field>

                                            <Field label="目標達成度">
                                                <select
                                                    className="border rounded px-2 py-1 w-full"
                                                    value={
                                                        longGoal
                                                            .achievement_level ??
                                                        "未選択"
                                                    }
                                                    onChange={(
                                                        e,
                                                    ) =>
                                                        updateLongTermGoal(
                                                            longGoal
                                                                .plan_long_term_goal_id,
                                                            {
                                                                achievement_level:
                                                                    e
                                                                        .target
                                                                        .value,
                                                            },
                                                        )
                                                    }
                                                >
                                                    <option value="未選択">
                                                        未選択
                                                    </option>
                                                    <option value="達成">
                                                        達成
                                                    </option>
                                                    <option value="一部">
                                                        一部
                                                    </option>
                                                    <option value="未達">
                                                        未達
                                                    </option>
                                                </select>
                                            </Field>
                                        </div>

                                        {/* 短期目標 */}
                                        <div className="space-y-3">
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <div className="font-semibold">短期目標</div>
                                                <button
                                                    type="button"
                                                    className="rounded border border-blue-600 bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-800"
                                                    onClick={() =>
                                                        addShortTermGoal(
                                                            longGoal.plan_long_term_goal_id,
                                                        )
                                                    }
                                                >
                                                    短期目標を追加
                                                </button>
                                            </div>
                                            {group.short_term_goals
                                                .length ===
                                                0 ? (
                                                <div className="rounded border border-dashed bg-white p-3 text-sm text-gray-500">
                                                    この長期目標に紐づく短期目標はありません。
                                                </div>
                                            ) : (
                                                group.short_term_goals.map(
                                                    (
                                                        shortGoal,
                                                        shortIndex,
                                                    ) => (
                                                        <div
                                                            key={
                                                                shortGoal
                                                                    .plan_short_term_goal_id
                                                            }
                                                            className="rounded border bg-white p-3 space-y-3"
                                                        >
                                                            <div className="font-bold">
                                                                短期目標
                                                                {group
                                                                    .short_term_goals
                                                                    .length >
                                                                    1
                                                                    ? ` ${shortIndex +
                                                                    1
                                                                    }`
                                                                    : ""}
                                                            </div>

                                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                                <Field label="開始日">
                                                                    <input
                                                                        type="date"
                                                                        className="border rounded px-2 py-1 w-full"
                                                                        value={
                                                                            shortGoal
                                                                                .goal_start_date ??
                                                                            ""
                                                                        }
                                                                        onChange={(
                                                                            e,
                                                                        ) =>
                                                                            updateShortTermGoal(
                                                                                shortGoal
                                                                                    .plan_short_term_goal_id,
                                                                                {
                                                                                    goal_start_date:
                                                                                        e
                                                                                            .target
                                                                                            .value ||
                                                                                        null,
                                                                                },
                                                                            )
                                                                        }
                                                                    />
                                                                </Field>

                                                                <Field label="終了日">
                                                                    <input
                                                                        type="date"
                                                                        className="border rounded px-2 py-1 w-full"
                                                                        value={
                                                                            shortGoal
                                                                                .goal_end_date ??
                                                                            ""
                                                                        }
                                                                        onChange={(
                                                                            e,
                                                                        ) =>
                                                                            updateShortTermGoal(
                                                                                shortGoal
                                                                                    .plan_short_term_goal_id,
                                                                                {
                                                                                    goal_end_date:
                                                                                        e
                                                                                            .target
                                                                                            .value ||
                                                                                        null,
                                                                                },
                                                                            )
                                                                        }
                                                                    />
                                                                </Field>
                                                            </div>

                                                            {isElderCarePlan ? (
                                                                <button
                                                                    type="button"
                                                                    className="rounded border border-blue-600 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800 disabled:border-gray-300 disabled:bg-gray-100 disabled:text-gray-400"
                                                                    disabled={
                                                                        !shortGoal.goal_start_date ||
                                                                        !shortGoal.goal_end_date
                                                                    }
                                                                    onClick={() =>
                                                                        fillEmptyGoalDatesFromPeriod(
                                                                            shortGoal.goal_start_date,
                                                                            shortGoal.goal_end_date,
                                                                        )
                                                                    }
                                                                >
                                                                    この期間を空欄の目標へ反映
                                                                </button>
                                                            ) : null}
                                                            <Field label="目標内容">
                                                                <textarea
                                                                    className="border rounded px-2 py-1 w-full min-h-[90px]"
                                                                    value={
                                                                        shortGoal
                                                                            .goal_text ??
                                                                        ""
                                                                    }
                                                                    onChange={(
                                                                        e,
                                                                    ) =>
                                                                        updateShortTermGoal(
                                                                            shortGoal
                                                                                .plan_short_term_goal_id,
                                                                            {
                                                                                goal_text:
                                                                                    e
                                                                                        .target
                                                                                        .value,
                                                                            },
                                                                        )
                                                                    }
                                                                />
                                                            </Field>

                                                            <Field label="目標達成度">
                                                                <select
                                                                    className="border rounded px-2 py-1 w-full"
                                                                    value={
                                                                        shortGoal
                                                                            .achievement_level ??
                                                                        "未選択"
                                                                    }
                                                                    onChange={(
                                                                        e,
                                                                    ) =>
                                                                        updateShortTermGoal(
                                                                            shortGoal
                                                                                .plan_short_term_goal_id,
                                                                            {
                                                                                achievement_level:
                                                                                    e
                                                                                        .target
                                                                                        .value,
                                                                            },
                                                                        )
                                                                    }
                                                                >
                                                                    <option value="未選択">
                                                                        未選択
                                                                    </option>
                                                                    <option value="達成">
                                                                        達成
                                                                    </option>
                                                                    <option value="一部">
                                                                        一部
                                                                    </option>
                                                                    <option value="未達">
                                                                        未達
                                                                    </option>
                                                                </select>
                                                            </Field>
                                                        </div>
                                                    ),
                                                )
                                            )}
                                        </div>
                                    </div>
                                );
                            },
                        )}
                    </div>
                )}

                <div className="text-sm text-gray-600">
                    変更した目標は、画面上部の「計画書・目標を保存」でまとめて保存されます。
                </div>
                <div className="flex justify-end">
                    <PlanSaveButton saving={savingPlan} onClick={savePlan} />
                </div>
            </div>

            <div className="border rounded p-3 bg-white space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                        <div className="font-bold text-lg">サービス詳細編集</div>
                        <div className="text-sm text-gray-500">
                            曜日・時間を含め、生成後にサービスを手動追加できます。
                        </div>
                    </div>
                    <button
                        type="button"
                        className="rounded border border-blue-700 bg-blue-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                        disabled={addingService}
                        onClick={() => void addService()}
                    >
                        {addingService ? "追加中..." : "サービスを追加"}
                    </button>
                </div>

                {serviceDrafts.length === 0 ? (
                    <div className="text-sm text-gray-500">サービス明細がありません。</div>
                ) : (
                    <div className="space-y-3">
                        {serviceDrafts.map((s, index) => (
                            <div
                                key={s.plan_service_id}
                                className="border rounded p-3 space-y-3 bg-gray-50"
                                onBlur={(event) => {
                                    if (
                                        !event.currentTarget.contains(
                                            event.relatedTarget as Node | null,
                                        )
                                    ) {
                                        void saveService(s);
                                    }
                                }}
                            >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="font-semibold">
                                        サービス{index + 1} / {s.weekday_jp ?? ""}{" "}
                                        {(s.start_time ?? "").slice(0, 5)}
                                        {s.start_time || s.end_time ? " - " : ""}
                                        {(s.end_time ?? "").slice(0, 5)}
                                    </div>
                                    <div className="text-xs text-gray-500">
                                        {savingServiceId === s.plan_service_id
                                            ? "自動保存中..."
                                            : "編集欄から離れると自動保存"}
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <Field label="曜日">
                                        <select
                                            className="border rounded px-2 py-1 w-full"
                                            value={s.weekday ?? ""}
                                            onChange={(e) =>
                                                updateService(s.plan_service_id, {
                                                    weekday: e.target.value === "" ? null : Number(e.target.value),
                                                    weekday_jp:
                                                        e.target.value === ""
                                                            ? null
                                                            : WEEKDAY_OPTIONS[Number(e.target.value)]?.label ?? null,
                                                })
                                            }
                                        >
                                            <option value="">未選択</option>
                                            {WEEKDAY_OPTIONS.map((weekday) => (
                                                <option key={weekday.value} value={weekday.value}>
                                                    {weekday.label}曜日
                                                </option>
                                            ))}
                                        </select>
                                    </Field>

                                    <Field label="開始時刻">
                                        <input
                                            type="time"
                                            className="border rounded px-2 py-1 w-full"
                                            value={(s.start_time ?? "").slice(0, 5)}
                                            onChange={(e) =>
                                                updateService(s.plan_service_id, {
                                                    start_time: e.target.value || null,
                                                    monthly_minutes: null,
                                                    monthly_hours: null,
                                                })
                                            }
                                        />
                                    </Field>

                                    <Field label="終了時刻">
                                        <input
                                            type="time"
                                            className="border rounded px-2 py-1 w-full"
                                            value={(s.end_time ?? "").slice(0, 5)}
                                            onChange={(e) =>
                                                updateService(s.plan_service_id, {
                                                    end_time: e.target.value || null,
                                                    monthly_minutes: null,
                                                    monthly_hours: null,
                                                })
                                            }
                                        />
                                    </Field>

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
                                    <Field
                                        label="サービスの内容"
                                        action={
                                            <CopyButton
                                                label="サービスの内容"
                                                disabled={!s.service_detail?.trim()}
                                                onClick={() => copyText(s.service_detail, "サービスの内容")}
                                            />
                                        }
                                    >
                                        <textarea
                                            className="border rounded px-2 py-1 w-full min-h-[90px]"
                                            value={s.service_detail ?? ""}
                                            onChange={(e) =>
                                                updateService(s.plan_service_id, { service_detail: e.target.value })
                                            }
                                            placeholder="例: 掃除、整理整頓 / 買い物"
                                        />
                                    </Field>

                                    <Field
                                        label="手順・留意事項・観察ポイント"
                                        action={
                                            <CopyButton
                                                label="手順・留意事項・観察ポイント"
                                                disabled={!s.procedure_notes?.trim()}
                                                onClick={() => copyText(s.procedure_notes, "手順・留意事項・観察ポイント")}
                                            />
                                        }
                                    >
                                        <textarea
                                            className="border rounded px-2 py-1 w-full min-h-[90px]"
                                            value={s.procedure_notes ?? ""}
                                            onChange={(e) =>
                                                updateService(s.plan_service_id, { procedure_notes: e.target.value })
                                            }
                                            placeholder="例: 居室・水回りの清掃"
                                        />
                                    </Field>

                                    <Field
                                        label="本人・家族にやっていただくこと"
                                        action={
                                            <CopyButton
                                                label="本人・家族にやっていただくこと"
                                                disabled={!s.family_action?.trim()}
                                                onClick={() => copyText(s.family_action, "本人・家族にやっていただくこと")}
                                            />
                                        }
                                    >
                                        <textarea
                                            className="border rounded px-2 py-1 w-full min-h-[90px]"
                                            value={s.family_action ?? ""}
                                            onChange={(e) =>
                                                updateService(s.plan_service_id, { family_action: e.target.value })
                                            }
                                        />
                                    </Field>
                                </div>

                                <Field
                                    label="観察ポイント"
                                    action={
                                        <CopyButton
                                            label="観察ポイント"
                                            disabled={!s.observation_points?.trim()}
                                            onClick={() => copyText(s.observation_points, "観察ポイント")}
                                        />
                                    }
                                >
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
                <div className="flex justify-end">
                    <PlanSaveButton saving={savingPlan} onClick={savePlan} />
                </div>
            </div>
        </div>
    );
}

const WEEKDAY_OPTIONS = [
    { value: 0, label: "日" },
    { value: 1, label: "月" },
    { value: 2, label: "火" },
    { value: 3, label: "水" },
    { value: 4, label: "木" },
    { value: 5, label: "金" },
    { value: 6, label: "土" },
];

function PlanSaveButton({
    saving,
    onClick,
}: {
    saving: boolean;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            className="rounded border bg-black px-3 py-1 text-white disabled:opacity-40"
            disabled={saving}
            onClick={onClick}
        >
            {saving ? "保存中..." : "計画書・目標を保存"}
        </button>
    );
}

function CopyButton({
    label,
    disabled,
    onClick,
}: {
    label: string;
    disabled: boolean;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            className="rounded border border-gray-300 bg-white p-1 text-gray-600 hover:bg-gray-100 disabled:opacity-30"
            disabled={disabled}
            onMouseDown={(event) => event.preventDefault()}
            onClick={onClick}
            aria-label={`${label}をコピー`}
            title={`${label}をコピー`}
        >
            <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
            >
                <rect x="8" y="8" width="11" height="11" rx="2" />
                <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
            </svg>
        </button>
    );
}

function Field({
    label,
    action,
    children,
}: {
    label: string;
    action?: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <label className="block">
            <div className="mb-1 flex items-center justify-between gap-2">
                <div className="text-sm font-semibold">{label}</div>
                {action}
            </div>
            {children}
        </label>
    );
}

function toPlanDraft(plan: PlanSummaryForEditor): PlanDraft {
    return {
        title: plan.title ?? "",
        issued_on: plan.issued_on ?? "",
        plan_start_date: plan.plan_start_date ?? "",
        plan_end_date: plan.plan_end_date ?? "",
        author_name: plan.author_name ?? "",
        person_family_hope:
            plan.person_family_hope ?? "",

        assistance_goal:
            plan.assistance_goal ?? "",

        care_service_history:
            plan.care_service_history ?? "",

        identified_needs:
            plan.identified_needs ?? "",

        health_status:
            plan.health_status ?? "",

        medical_care_risks:
            plan.medical_care_risks ?? "",

        home_activity_participation:
            plan.home_activity_participation ?? "",

        remarks:
            plan.remarks ?? "",
        weekly_plan_comment: plan.weekly_plan_comment ?? "",
    };
}

function formatDate(v: string | null | undefined) {
    if (!v) return "";
    return v;
}
