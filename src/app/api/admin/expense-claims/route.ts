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
            .select("user_id, level_sort, orgunitname")
            .eq("user_id", userRow.user_id)
            .maybeSingle();

    if (entryError) {
        throw entryError;
    }

    const levelSort = Number(
        entryRow?.level_sort ?? 99999999
    );

    const isAdmin =
        levelSort < 4500000 &&
        entryRow?.orgunitname !==
        "ファミーユケアプランセンター高蔵寺";

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

        return json({
            ok: true,
            data: data ?? [],
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