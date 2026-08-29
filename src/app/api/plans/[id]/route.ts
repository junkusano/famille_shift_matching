// src/app/api/plans/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import { getUserFromBearer } from "@/lib/auth/getUserFromBearer";

export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
    return NextResponse.json(body, { status });
}

type Ctx = {
    params: Promise<{ id: string }>;
};

export async function GET(req: NextRequest, { params }: Ctx) {
    try {
        await getUserFromBearer(req);

        const { id } = await params;

        const { data: plan, error: planError } = await supabaseAdmin
            .from("plans")
            .select("*")
            .eq("plan_id", id)
            .eq("is_deleted", false)
            .maybeSingle();

        if (planError) throw planError;
        if (!plan) {
            return json(
                {
                    ok: false,
                    error: "plan not found",
                },
                404,
            );
        }

        /*
         * このプランで選択・保存された
         * 基準ケアプランを取得する。
         */
        let baseCarePlan: {
            id: string;
            kaipoke_cs_id: string | null;
            doc_name: string | null;
            summary: string | null;
            url: string | null;
            applicable_date: string | null;
            doc_date_raw: string | null;
            created_at: string | null;
        } | null = null;

        if (
            typeof plan.base_care_plan_cs_doc_id ===
            "string" &&
            plan.base_care_plan_cs_doc_id.trim()
        ) {
            const {
                data: baseCarePlanRow,
                error: baseCarePlanError,
            } = await supabaseAdmin
                .from("cs_docs")
                .select(`
            id,
            kaipoke_cs_id,
            doc_name,
            summary,
            url,
            applicable_date,
            doc_date_raw,
            created_at
        `)
                .eq(
                    "id",
                    plan.base_care_plan_cs_doc_id,
                )
                /*
                 * 別利用者の文書を返さないための条件
                 */
                .eq(
                    "kaipoke_cs_id",
                    plan.kaipoke_cs_id,
                )
                .maybeSingle();

            if (baseCarePlanError) {
                throw baseCarePlanError;
            }

            baseCarePlan =
                baseCarePlanRow ?? null;
        }

        const {
            data: services,
            error: servicesError,
        } = await supabaseAdmin
            .from("plan_services")
            .select(`
        plan_service_id,
        plan_id,
        template_id,
        shift_service_code_id,
        service_code,
        plan_document_kind,
        plan_service_category,
        display_order,
        service_no,
        weekday,
        weekday_jp,
        start_time,
        end_time,
        duration_minutes,
        is_biweekly,
        nth_weeks,
        monthly_occurrence_factor,
        monthly_minutes,
        monthly_hours,
        required_staff_count,
        two_person_work_flg,
        service_title,
        service_detail,
        procedure_notes,
        observation_points,
        family_action,
        schedule_note,
        source_snapshot,
        generation_meta,
        active,
        created_at,
        updated_at
      `)
            .eq("plan_id", id)
            .eq("active", true)
            .order("service_no", { ascending: true })
            .order("display_order", { ascending: true })
            .order("weekday", { ascending: true })
            .order("start_time", { ascending: true });

        if (servicesError) throw servicesError;

        /*
         * 長期目標を取得
         */
        const {
            data: longTermGoals,
            error: longTermGoalsError,
        } = await supabaseAdmin
            .from("plan_long_term_goals")
            .select(`
        plan_long_term_goal_id,
        plan_id,
        display_order,
        goal_start_date,
        goal_end_date,
        goal_text,
        achievement_level,
        effectiveness_satisfaction,
        active,
        created_at,
        updated_at
    `)
            .eq("plan_id", id)
            .eq("active", true)
            .order("display_order", {
                ascending: true,
            });

        if (longTermGoalsError) {
            throw longTermGoalsError;
        }

        /*
         * 長期目標IDを取り出す
         */
        const longTermGoalIds =
            (longTermGoals ?? []).map(
                (goal) =>
                    goal.plan_long_term_goal_id,
            );

        /*
         * 短期目標を取得
         */
        let shortTermGoals: Array<{
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
        }> = [];

        if (longTermGoalIds.length > 0) {
            const {
                data: shortTermGoalRows,
                error: shortTermGoalsError,
            } = await supabaseAdmin
                .from("plan_short_term_goals")
                .select(`
            plan_short_term_goal_id,
            plan_long_term_goal_id,
            display_order,
            goal_start_date,
            goal_end_date,
            goal_text,
            achievement_level,
            effectiveness_satisfaction,
            active,
            created_at,
            updated_at
        `)
                .in(
                    "plan_long_term_goal_id",
                    longTermGoalIds,
                )
                .eq("active", true)
                .order("display_order", {
                    ascending: true,
                });

            if (shortTermGoalsError) {
                throw shortTermGoalsError;
            }

            shortTermGoals =
                shortTermGoalRows ?? [];
        }

        /*
         * 長期目標ごとに短期目標をまとめる
         */
        const goalGroups =
            (longTermGoals ?? []).map(
                (longTermGoal) => ({
                    long_term_goal:
                        longTermGoal,

                    short_term_goals:
                        shortTermGoals.filter(
                            (shortTermGoal) =>
                                shortTermGoal
                                    .plan_long_term_goal_id ===
                                longTermGoal
                                    .plan_long_term_goal_id,
                        ),
                }),
            );

        const { data: client, error: clientError } = await supabaseAdmin
            .from("cs_kaipoke_info")
            .select(`
        id,
        kaipoke_cs_id,
        name,
        name_kana,
        kana,
        birth_yyyy_mm_dd,
        postal_code,
        address,
        phone_01,
        phone_02,
        email,
        gender,
        service_kind,
        shogai_jukyusha_no,
        ido_jukyusyasho
      `)
            .eq("id", plan.client_info_id)
            .maybeSingle();

        if (clientError) throw clientError;

        let author = null;

        if (plan.author_user_id) {
            const { data: authorRow, error: authorError } = await supabaseAdmin
                .from("user_entry_united_view_single")
                .select("user_id, lw_userid, last_name_kanji, first_name_kanji")
                .eq("user_id", plan.author_user_id)
                .maybeSingle();

            if (authorError) throw authorError;

            author = authorRow
                ? {
                    user_id: authorRow.user_id,
                    lw_userid: authorRow.lw_userid,
                    last_name_kanji: authorRow.last_name_kanji,
                    first_name_kanji: authorRow.first_name_kanji,
                    display_name: [authorRow.last_name_kanji, authorRow.first_name_kanji]
                        .filter(Boolean)
                        .join(" "),
                }
                : null;
        }

        return json({
            ok: true,
            data: {
                plan,
                services: services ?? [],

                /*
                 * 長期目標と短期目標
                 */
                goal_groups: goalGroups,

                /*
                 * 選択・保存済みの
                 * 基準ケアプラン。
                 *
                 * summaryは省略せず全文を返す。
                 */
                base_care_plan:
                    baseCarePlan,

                client,
                author,
            },
        });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[api/plans/[id]][GET] error", msg);
        return json({ ok: false, error: msg }, 500);
    }
}

export async function PUT(req: NextRequest, { params }: Ctx) {
    try {
        await getUserFromBearer(req);

        const { id } = await params;
        const body = await req.json();

        /*
         * plans本体の更新内容
         */
        const patch = {
            title: String(
                body.title ?? "",
            ).trim(),

            issued_on:
                normalizeDateOrNull(
                    body.issued_on,
                ),

            plan_start_date:
                normalizeDateOrNull(
                    body.plan_start_date,
                ),

            plan_end_date:
                normalizeDateOrNull(
                    body.plan_end_date,
                ),

            author_name:
                nullableString(
                    body.author_name,
                ),

            person_family_hope:
                nullableString(
                    body.person_family_hope,
                ),

            assistance_goal:
                nullableString(
                    body.assistance_goal,
                ),

            /*
             * 介護保険計画書専用項目
             */
            care_service_history:
                nullableString(
                    body.care_service_history,
                ),

            identified_needs:
                nullableString(
                    body.identified_needs,
                ),

            health_status:
                nullableString(
                    body.health_status,
                ),

            medical_care_risks:
                nullableString(
                    body.medical_care_risks,
                ),

            home_activity_participation:
                nullableString(
                    body.home_activity_participation,
                ),

            remarks:
                nullableString(
                    body.remarks,
                ),

            weekly_plan_comment:
                nullableString(
                    body.weekly_plan_comment,
                ),

            content:
                body.content &&
                    typeof body.content ===
                    "object"
                    ? body.content
                    : {},
        };

        if (!patch.title) {
            return json(
                {
                    ok: false,
                    error:
                        "タイトルは必須です",
                },
                400,
            );
        }

        /*
         * プラン本体を更新
         */
        const {
            data: updatedPlan,
            error: planUpdateError,
        } = await supabaseAdmin
            .from("plans")
            .update(patch)
            .eq("plan_id", id)
            .eq("is_deleted", false)
            .select("*")
            .single();

        if (planUpdateError) {
            throw planUpdateError;
        }

        /*
         * 画面から送られた目標グループ
         *
         * まだ画面側がgoal_groupsを
         * 送っていない場合でも、
         * プラン本体だけ保存できる。
         */
        const goalGroups =
            Array.isArray(
                body.goal_groups,
            )
                ? body.goal_groups
                : [];

        for (
            const group
            of goalGroups
        ) {
            const longTermGoal =
                group &&
                    typeof group ===
                    "object"
                    ? group.long_term_goal
                    : null;

            if (
                longTermGoal &&
                typeof longTermGoal ===
                "object" &&
                typeof longTermGoal
                    .plan_long_term_goal_id ===
                "string"
            ) {
                const {
                    error:
                    longTermGoalUpdateError,
                } = await supabaseAdmin
                    .from(
                        "plan_long_term_goals",
                    )
                    .update({
                        goal_start_date:
                            normalizeDateOrNull(
                                longTermGoal
                                    .goal_start_date,
                            ),

                        goal_end_date:
                            normalizeDateOrNull(
                                longTermGoal
                                    .goal_end_date,
                            ),

                        goal_text:
                            String(
                                longTermGoal
                                    .goal_text ??
                                "",
                            ).trim(),

                        achievement_level:
                            nullableString(
                                longTermGoal
                                    .achievement_level,
                            ),

                        effectiveness_satisfaction:
                            nullableString(
                                longTermGoal
                                    .effectiveness_satisfaction,
                            ),

                        updated_at:
                            new Date()
                                .toISOString(),
                    })
                    .eq(
                        "plan_long_term_goal_id",
                        longTermGoal
                            .plan_long_term_goal_id,
                    )
                    /*
                     * 他プランの目標を
                     * 誤って更新しないための条件
                     */
                    .eq(
                        "plan_id",
                        id,
                    )
                    .eq(
                        "active",
                        true,
                    );

                if (
                    longTermGoalUpdateError
                ) {
                    throw longTermGoalUpdateError;
                }
            }

            const shortTermGoals =
                Array.isArray(
                    group?.short_term_goals,
                )
                    ? group.short_term_goals
                    : [];

            for (
                const shortTermGoal
                of shortTermGoals
            ) {
                if (
                    !shortTermGoal ||
                    typeof shortTermGoal !==
                    "object" ||
                    typeof shortTermGoal
                        .plan_short_term_goal_id !==
                    "string"
                ) {
                    continue;
                }

                const {
                    error:
                    shortTermGoalUpdateError,
                } = await supabaseAdmin
                    .from(
                        "plan_short_term_goals",
                    )
                    .update({
                        goal_start_date:
                            normalizeDateOrNull(
                                shortTermGoal
                                    .goal_start_date,
                            ),

                        goal_end_date:
                            normalizeDateOrNull(
                                shortTermGoal
                                    .goal_end_date,
                            ),

                        goal_text:
                            String(
                                shortTermGoal
                                    .goal_text ??
                                "",
                            ).trim(),

                        achievement_level:
                            nullableString(
                                shortTermGoal
                                    .achievement_level,
                            ),

                        effectiveness_satisfaction:
                            nullableString(
                                shortTermGoal
                                    .effectiveness_satisfaction,
                            ),

                        updated_at:
                            new Date()
                                .toISOString(),
                    })
                    .eq(
                        "plan_short_term_goal_id",
                        shortTermGoal
                            .plan_short_term_goal_id,
                    )
                    .eq(
                        "active",
                        true,
                    );

                if (
                    shortTermGoalUpdateError
                ) {
                    throw shortTermGoalUpdateError;
                }
            }
        }

        return json({
            ok: true,
            data: updatedPlan,
        });
    } catch (e: unknown) {
        const msg =
            e instanceof Error
                ? e.message
                : String(e);

        console.error(
            "[api/plans/[id]][PUT] error",
            msg,
        );

        return json(
            {
                ok: false,
                error: msg,
            },
            500,
        );
    }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
    try {
        await getUserFromBearer(req);

        const { id } = await params;
        const { data, error } = await supabaseAdmin
            .from("plans")
            .update({
                is_deleted: true,
                updated_at: new Date().toISOString(),
            })
            .eq("plan_id", id)
            .eq("is_deleted", false)
            .select("plan_id")
            .maybeSingle();

        if (error) throw error;
        if (!data) {
            return json(
                {
                    ok: false,
                    error: "plan not found",
                },
                404,
            );
        }

        return json({
            ok: true,
            data,
        });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[api/plans/[id]][DELETE] error", msg);
        return json({ ok: false, error: msg }, 500);
    }
}

function nullableString(v: unknown): string | null {
    if (typeof v !== "string") return null;
    const s = v.trim();
    return s ? s : null;
}

function normalizeDateOrNull(v: unknown): string | null {
    if (typeof v !== "string") return null;
    const s = v.trim();
    if (!s) return null;
    return s;
}
