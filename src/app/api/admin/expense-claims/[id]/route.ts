//src/app/api/admin/expense-claims/[id]/route.ts

// src/app/api/admin/expense-claims/[id]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import { getUserFromBearer } from "@/lib/auth/getUserFromBearer";
import { sendExpenseClaimNotifications } from "@/lib/expenseClaimNotification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UpdateAction = "paid" | "rejected";

type RequestBody = {
    action?: UpdateAction;
    rejectionReason?: string;
};

type LegacyEmailResult =
    | { status: "ok" }
    | { status: "error"; error: string };

function skippedLegacyEmailResult(): LegacyEmailResult {
    return { status: "ok" };
}

type RouteContext = {
    params: Promise<{
        id: string;
    }>;
};

function json(data: unknown, status = 200) {
    return NextResponse.json(data, { status });
}

function formatAmount(value: number) {
    return new Intl.NumberFormat("ja-JP").format(value);
}

function formatDate(value: string | null | undefined) {
    if (!value) {
        return "—";
    }

    const [year, month, day] = value.split("-");

    if (!year || !month || !day) {
        return value;
    }

    return `${year}年${Number(month)}月${Number(day)}日`;
}

function escapeHtml(value: string | null | undefined) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

async function readUser(req: NextRequest) {
    try {
        const { user } = await getUserFromBearer(req);
        return user ?? null;
    } catch {
        return null;
    }
}

async function getMyUserIdAndAdmin(authUid: string) {
    const { data: userRow, error: userError } =
        await supabaseAdmin
            .from("users")
            .select("user_id")
            .eq("auth_user_id", authUid)
            .maybeSingle();

    if (userError) {
        throw userError;
    }

    if (!userRow?.user_id) {
        return {
            myUserId: null as string | null,
            isAdmin: false,
        };
    }

    const { data: entryRow, error: entryError } =
        await supabaseAdmin
            .from("user_entry_united_view_single")
            .select(
                "user_id, level_sort, orgunitname, system_role"
            )
            .eq("user_id", userRow.user_id)
            .maybeSingle();

    if (entryError) {
        throw entryError;
    }

    const levelSort = Number(
        entryRow?.level_sort ?? 99999999
    );

    const isAdmin =
        levelSort < 4500000 ||
        (
            entryRow?.system_role ?? ""
        ).toLowerCase() === "admin";

    return {
        myUserId: userRow.user_id as string,
        isAdmin,
    };
}

export async function PATCH(
    req: NextRequest,
    context: RouteContext
) {
    try {
        const user = await readUser(req);

        if (!user) {
            return json(
                {
                    ok: false,
                    message: "ログインが必要です。",
                },
                401
            );
        }

        const { myUserId, isAdmin } =
            await getMyUserIdAndAdmin(user.id);

        if (!myUserId) {
            return json(
                {
                    ok: false,
                    message:
                        "ユーザー情報が見つかりません。",
                },
                401
            );
        }

        if (!isAdmin) {
            return json(
                {
                    ok: false,
                    message:
                        "経費精算を処理する権限がありません。",
                },
                403
            );
        }

        const { id } = await context.params;
        const claimId = id?.trim();

        if (!claimId) {
            return json(
                {
                    ok: false,
                    message:
                        "申請IDが指定されていません。",
                },
                400
            );
        }

        let body: RequestBody;

        try {
            body =
                (await req.json()) as RequestBody;
        } catch {
            return json(
                {
                    ok: false,
                    message:
                        "リクエストの形式が正しくありません。",
                },
                400
            );
        }

        const action = body.action;

        if (
            action !== "paid" &&
            action !== "rejected"
        ) {
            return json(
                {
                    ok: false,
                    message:
                        "処理内容が正しくありません。",
                },
                400
            );
        }

        const rejectionReason = String(
            body.rejectionReason ?? ""
        ).trim();

        if (
            action === "rejected" &&
            !rejectionReason
        ) {
            return json(
                {
                    ok: false,
                    message:
                        "却下理由を入力してください。",
                },
                400
            );
        }

        const { data: claim, error: claimError } =
            await supabaseAdmin
                .from("external_expense_claims")
                .select(
                    `
                    id,
                    name,
                    email,
                    phone,
                    work_date,
                    total_amount,
                    bank_name,
                    branch_name,
                    account_type,
                    account_number,
                    account_holder,
                    status,
                    paid_at,
                    rejected_at
                    `
                )
                .eq("id", claimId)
                .maybeSingle();

        if (claimError) {
            console.error(
                "[admin-expense-claim-update] select failed",
                {
                    claimId,
                    error: claimError,
                }
            );

            return json(
                {
                    ok: false,
                    message:
                        "経費精算申請の取得に失敗しました。",
                },
                500
            );
        }

        if (!claim) {
            return json(
                {
                    ok: false,
                    message:
                        "対象の経費精算申請が見つかりません。",
                },
                404
            );
        }

        if (claim.status === "振込済") {
            return json(
                {
                    ok: false,
                    message:
                        "この申請はすでに振込済です。",
                },
                409
            );
        }

        if (claim.status === "却下") {
            return json(
                {
                    ok: false,
                    message:
                        "この申請はすでに却下されています。",
                },
                409
            );
        }

        const now = new Date().toISOString();

        const updateData =
            action === "paid"
                ? {
                    status: "振込済",
                    paid_at: now,
                    paid_by: myUserId,
                    rejection_reason: null,
                    rejected_at: null,
                    rejected_by: null,
                }
                : {
                    status: "却下",
                    rejection_reason:
                        rejectionReason,
                    rejected_at: now,
                    rejected_by: myUserId,
                };

        const { data: updatedClaim, error: updateError } =
            await supabaseAdmin
                .from("external_expense_claims")
                .update(updateData)
                .eq("id", claimId)
                .select(
                    `
                    id,
                    name,
                    email,
                    work_date,
                    total_amount,
                    bank_name,
                    branch_name,
                    account_type,
                    account_number,
                    account_holder,
                    status,
                    rejection_reason,
                    paid_at,
                    paid_by,
                    rejected_at,
                    rejected_by
                    `
                )
                .single();

        if (updateError || !updatedClaim) {
            console.error(
                "[admin-expense-claim-update] update failed",
                {
                    claimId,
                    action,
                    error: updateError,
                }
            );

            return json(
                {
                    ok: false,
                    message:
                        action === "paid"
                            ? "振込完了への更新に失敗しました。"
                            : "却下処理に失敗しました。",
                },
                500
            );
        }

        const applicantName = escapeHtml(
            claim.name
        );

        const applicantEmail = String(
            claim.email ?? ""
        ).trim();

        const formattedWorkDate = formatDate(
            claim.work_date
        );

        const formattedAmount = formatAmount(
            Number(claim.total_amount ?? 0)
        );

        if (applicantEmail) {
            try {
                if (action === "paid") {
                    const applicantSubject =
                        "【Myファミーユ】経費精算の振込が完了しました";

                    const applicantHtml = `
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8" />
</head>
<body style="font-family: sans-serif; line-height: 1.7; color: #333;">
    <p>${applicantName} 様</p>

    <p>
        申請いただいた経費精算の振込が完了しました。
    </p>

    <h3>振込内容</h3>

    <table style="border-collapse: collapse;">
        <tbody>
            <tr>
                <th style="text-align: left; padding: 6px 12px 6px 0;">
                    申請番号
                </th>
                <td>${escapeHtml(claim.id)}</td>
            </tr>
            <tr>
                <th style="text-align: left; padding: 6px 12px 6px 0;">
                    勤務日
                </th>
                <td>${escapeHtml(formattedWorkDate)}</td>
            </tr>
            <tr>
                <th style="text-align: left; padding: 6px 12px 6px 0;">
                    振込金額
                </th>
                <td>${escapeHtml(formattedAmount)}円</td>
            </tr>
            <tr>
                <th style="text-align: left; padding: 6px 12px 6px 0;">
                    振込先
                </th>
                <td>
                    ${escapeHtml(claim.bank_name)}
                    ${escapeHtml(claim.branch_name)}
                </td>
            </tr>
        </tbody>
    </table>

    <p>
        金融機関の処理状況により、口座への反映まで時間がかかる場合があります。
    </p>

    <p style="font-size: 12px; color: #666;">
        このメールは自動送信されています。
    </p>
</body>
</html>
`;

                    const adminSubject =
                        `【経費精算】${claim.name}様の振込完了連絡を送信しました`;

                    const adminHtml = `
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8" />
</head>
<body style="font-family: sans-serif; line-height: 1.7; color: #333;">
    <p>
        経費精算を振込済へ更新し、申請者へ振込完了メールを送信しました。
    </p>

    <h3>処理内容</h3>

    <table style="border-collapse: collapse;">
        <tbody>
            <tr>
                <th style="text-align: left; padding: 6px 12px 6px 0;">
                    申請番号
                </th>
                <td>${escapeHtml(claim.id)}</td>
            </tr>
            <tr>
                <th style="text-align: left; padding: 6px 12px 6px 0;">
                    申請者
                </th>
                <td>${applicantName}</td>
            </tr>
            <tr>
                <th style="text-align: left; padding: 6px 12px 6px 0;">
                    勤務日
                </th>
                <td>${escapeHtml(formattedWorkDate)}</td>
            </tr>
            <tr>
                <th style="text-align: left; padding: 6px 12px 6px 0;">
                    振込金額
                </th>
                <td>${escapeHtml(formattedAmount)}円</td>
            </tr>
            <tr>
                <th style="text-align: left; padding: 6px 12px 6px 0;">
                    申請者メール
                </th>
                <td>${escapeHtml(applicantEmail)}</td>
            </tr>
        </tbody>
    </table>

    <p style="font-size: 12px; color: #666;">
        このメールは自動送信されています。
    </p>
</body>
</html>
`;

                    void applicantSubject;
                    void applicantHtml;
                    void adminSubject;
                    void adminHtml;
                    const applicantEmailResult = skippedLegacyEmailResult();
                    const adminEmailResult = skippedLegacyEmailResult();

                    if (
                        applicantEmailResult.status ===
                        "error"
                    ) {
                        console.error(
                            "[admin-expense-claim-update] applicant paid email failed",
                            {
                                claimId,
                                error:
                                    applicantEmailResult.error,
                            }
                        );
                    }

                    if (
                        adminEmailResult.status ===
                        "error"
                    ) {
                        console.error(
                            "[admin-expense-claim-update] admin paid email failed",
                            {
                                claimId,
                                error:
                                    adminEmailResult.error,
                            }
                        );
                    }
                } else {
                    const applicantSubject =
                        "【Myファミーユ】経費精算申請の結果について";

                    const applicantHtml = `
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8" />
</head>
<body style="font-family: sans-serif; line-height: 1.7; color: #333;">
    <p>${applicantName} 様</p>

    <p>
        申請いただいた経費精算は、以下の理由により却下されました。
    </p>

    <h3>申請内容</h3>

    <table style="border-collapse: collapse;">
        <tbody>
            <tr>
                <th style="text-align: left; padding: 6px 12px 6px 0;">
                    申請番号
                </th>
                <td>${escapeHtml(claim.id)}</td>
            </tr>
            <tr>
                <th style="text-align: left; padding: 6px 12px 6px 0;">
                    勤務日
                </th>
                <td>${escapeHtml(formattedWorkDate)}</td>
            </tr>
            <tr>
                <th style="text-align: left; padding: 6px 12px 6px 0;">
                    申請金額
                </th>
                <td>${escapeHtml(formattedAmount)}円</td>
            </tr>
        </tbody>
    </table>

    <h3>却下理由</h3>

    <div style="white-space: pre-wrap; padding: 12px; background: #fff1f2; border: 1px solid #fecdd3;">
        ${escapeHtml(rejectionReason)}
    </div>

    <p>
        内容をご確認のうえ、必要に応じて再度申請してください。
    </p>

    <p style="font-size: 12px; color: #666;">
        このメールは自動送信されています。
    </p>
</body>
</html>
`;

                    const adminSubject =
                        `【経費精算】${claim.name}様の申請を却下しました`;

                    const adminHtml = `
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8" />
</head>
<body style="font-family: sans-serif; line-height: 1.7; color: #333;">
    <p>
        経費精算申請を却下し、申請者へ結果メールを送信しました。
    </p>

    <h3>処理内容</h3>

    <table style="border-collapse: collapse;">
        <tbody>
            <tr>
                <th style="text-align: left; padding: 6px 12px 6px 0;">
                    申請番号
                </th>
                <td>${escapeHtml(claim.id)}</td>
            </tr>
            <tr>
                <th style="text-align: left; padding: 6px 12px 6px 0;">
                    申請者
                </th>
                <td>${applicantName}</td>
            </tr>
            <tr>
                <th style="text-align: left; padding: 6px 12px 6px 0;">
                    勤務日
                </th>
                <td>${escapeHtml(formattedWorkDate)}</td>
            </tr>
            <tr>
                <th style="text-align: left; padding: 6px 12px 6px 0;">
                    申請金額
                </th>
                <td>${escapeHtml(formattedAmount)}円</td>
            </tr>
            <tr>
                <th style="text-align: left; padding: 6px 12px 6px 0;">
                    申請者メール
                </th>
                <td>${escapeHtml(applicantEmail)}</td>
            </tr>
        </tbody>
    </table>

    <h3>却下理由</h3>

    <div style="white-space: pre-wrap; padding: 12px; background: #fff1f2; border: 1px solid #fecdd3;">
        ${escapeHtml(rejectionReason)}
    </div>

    <p style="font-size: 12px; color: #666;">
        このメールは自動送信されています。
    </p>
</body>
</html>
`;

                    void applicantSubject;
                    void applicantHtml;
                    void adminSubject;
                    void adminHtml;
                    const applicantEmailResult = skippedLegacyEmailResult();
                    const adminEmailResult = skippedLegacyEmailResult();

                    if (
                        applicantEmailResult.status ===
                        "error"
                    ) {
                        console.error(
                            "[admin-expense-claim-update] applicant rejected email failed",
                            {
                                claimId,
                                error:
                                    applicantEmailResult.error,
                            }
                        );
                    }

                    if (
                        adminEmailResult.status ===
                        "error"
                    ) {
                        console.error(
                            "[admin-expense-claim-update] admin rejected email failed",
                            {
                                claimId,
                                error:
                                    adminEmailResult.error,
                            }
                        );
                    }
                }
            } catch (emailError) {
                /*
                 * メール送信に失敗しても、
                 * ステータス更新は成功として扱います。
                 */
                console.error(
                    "[admin-expense-claim-update] email notification threw",
                    {
                        claimId,
                        action,
                        error: emailError,
                    }
                );
            }
        } else {
            console.error(
                "[admin-expense-claim-update] applicant email missing",
                {
                    claimId,
                }
            );
        }

        await sendExpenseClaimNotifications({
            event: action,
            claimId: updatedClaim.id,
            applicantName: claim.name,
            applicantEmail: claim.email,
            applicantPhone: claim.phone,
            workDate: claim.work_date ?? "",
            totalAmount: Number(claim.total_amount ?? 0),
            rejectionReason: action === "rejected" ? rejectionReason : null,
        });

        console.log(
            "[admin-expense-claim-update] success",
            {
                claimId,
                action,
                status: updatedClaim.status,
                operatedBy: myUserId,
            }
        );

        return json({
            ok: true,
            message:
                action === "paid"
                    ? "振込完了として更新しました。"
                    : "申請を却下しました。",
            data: updatedClaim,
        });
    } catch (error) {
        console.error(
            "[admin-expense-claim-update] fatal error",
            error
        );

        return json(
            {
                ok: false,
                message:
                    "経費精算の更新処理に失敗しました。",
            },
            500
        );
    }
}
