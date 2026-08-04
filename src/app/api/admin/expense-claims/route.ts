import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import { getUserFromBearer } from "@/lib/auth/getUserFromBearer";

export const dynamic = "force-dynamic";

function json(message: unknown, status = 200) {
    return NextResponse.json(message, { status });
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
            .select("user_id, level_sort, orgunitname, system_role")
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
        (entryRow?.system_role ?? "").toLowerCase() === "admin";

    return {
        myUserId: userRow.user_id as string,
        isAdmin,
    };
}

export async function GET(req: NextRequest) {
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
                    message: "ユーザー情報が見つかりません。",
                },
                401
            );
        }

        if (!isAdmin) {
            return json(
                {
                    ok: false,
                    message:
                        "経費精算の管理ページを閲覧する権限がありません。",
                },
                403
            );
        }

        const { searchParams } = new URL(req.url);

        const status = (
            searchParams.get("status") ?? ""
        ).trim();

        const keyword = (
            searchParams.get("keyword") ?? ""
        ).trim();

        const fromDate = (
            searchParams.get("from_date") ?? ""
        ).trim();

        const toDate = (
            searchParams.get("to_date") ?? ""
        ).trim();

        let query = supabaseAdmin
            .from("external_expense_claims")
            .select(
                `
        id,
        created_at,
        updated_at,
        name,
        phone,
        email,
        work_date,
        expense1_description,
        expense1_amount,
        expense2_description,
        expense2_amount,
        expense3_description,
        expense3_amount,
        expense4_description,
        expense4_amount,
        expense5_description,
        expense5_amount,
        total_amount,
        receipt_files,
        bank_name,
        branch_name,
        account_type,
        account_number,
        account_holder,
        status,
        rejection_reason,
        approved_at,
        approved_by,
        paid_at,
        paid_by,
        rejected_at,
        rejected_by
        `
            )
            .order("created_at", {
                ascending: false,
            });

        if (status) {
            query = query.eq("status", status);
        }

        if (fromDate) {
            query = query.gte("work_date", fromDate);
        }

        if (toDate) {
            query = query.lte("work_date", toDate);
        }

        if (keyword) {
            const safeKeyword = keyword
                .replace(/,/g, "")
                .replace(/%/g, "");

            query = query.or(
                [
                    `name.ilike.%${safeKeyword}%`,
                    `phone.ilike.%${safeKeyword}%`,
                    `email.ilike.%${safeKeyword}%`,
                ].join(",")
            );
        }

        const { data, error } = await query;

        if (error) {
            console.error(
                "[admin-expense-claims] select failed",
                error
            );

            return json(
                {
                    ok: false,
                    message:
                        "経費精算一覧の取得に失敗しました。",
                },
                500
            );
        }

        type ReceiptFile = {
            // 共通項目
            name?: string;
            size?: number | string;
            url?: string | null;

            // 旧Supabase Storage形式
            path?: string;
            type?: string;

            // 新Google Drive形式
            id?: string;
            originalName?: string;
            mimeType?: string | null;
            directUrl?: string | null;
            viewUrl?: string | null;
            webViewLink?: string | null;
            createdTime?: string | null;
        };

        const claimsWithReceiptUrls = await Promise.all(
            (data ?? []).map(async (claim) => {
                const receiptFiles = Array.isArray(
                    claim.receipt_files
                )
                    ? (claim.receipt_files as ReceiptFile[])
                    : [];

                const receiptFilesWithUrls =
                    await Promise.all(
                        receiptFiles.map(async (file) => {
                            /*
                             * Google Drive形式の場合は、
                             * 保存済みのURLをそのまま使用します。
                             */
                            if (
                                file.id ||
                                file.webViewLink ||
                                file.viewUrl ||
                                file.directUrl
                            ) {
                                const openUrl =
                                    file.webViewLink ??
                                    file.viewUrl ??
                                    file.url ??
                                    file.directUrl ??
                                    null;

                                const imageUrl =
                                    file.id &&
                                        (
                                            file.mimeType ??
                                            file.type ??
                                            ""
                                        ).startsWith("image/")
                                        ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(
                                            file.id
                                        )}&sz=w1600`
                                        : file.directUrl ??
                                        file.url ??
                                        null;

                                return {
                                    ...file,
                                    url: imageUrl,
                                    openUrl,
                                };
                            }

                            /*
                             * 過去のSupabase Storage形式は、
                             * 従来どおり署名URLを発行します。
                             */
                            if (!file.path) {
                                return {
                                    ...file,
                                    url: file.url ?? null,
                                    openUrl: file.url ?? null,
                                };
                            }

                            const {
                                data: signedUrlData,
                                error: signedUrlError,
                            } = await supabaseAdmin.storage
                                .from("expense-receipts")
                                .createSignedUrl(
                                    file.path,
                                    60 * 60
                                );

                            if (signedUrlError) {
                                console.error(
                                    "[admin-expense-claims] signed URL creation failed",
                                    {
                                        claimId: claim.id,
                                        path: file.path,
                                        error: signedUrlError,
                                    }
                                );

                                return {
                                    ...file,
                                    url: null,
                                    openUrl: null,
                                };
                            }

                            const signedUrl =
                                signedUrlData.signedUrl ??
                                null;

                            return {
                                ...file,
                                url: signedUrl,
                                openUrl: signedUrl,
                            };
                        })
                    );

                return {
                    ...claim,
                    receipt_files:
                        receiptFilesWithUrls,
                };
            })
        );

        return json({
            ok: true,
            data: claimsWithReceiptUrls,
        });
    } catch (error) {
        console.error(
            "[admin-expense-claims] unexpected error",
            error
        );

        return json(
            {
                ok: false,
                message:
                    "経費精算一覧の取得中にエラーが発生しました。",
            },
            500
        );
    }
}