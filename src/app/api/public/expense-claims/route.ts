import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

const MAX_EXPENSE_COUNT = 5;
const MAX_RECEIPT_COUNT = 10;

type GoogleDriveReceiptFile = {
    id: string;
    name: string;
    originalName: string;
    mimeType: string | null;
    size: string;
    url: string;
    directUrl: string;
    viewUrl: string;
    webViewLink: string;
    createdTime: string | null;
};

function json(message: unknown, status = 200) {
    return NextResponse.json(message, { status });
}

function getText(formData: FormData, key: string) {
    const value = formData.get(key);

    if (typeof value !== "string") {
        return "";
    }

    return value.trim();
}

function getRequiredText(formData: FormData, key: string) {
    return getText(formData, key);
}

function parseAmount(value: string) {
    const normalized = value.replace(/[^\d]/g, "");

    if (!normalized) {
        return 0;
    }

    const amount = Number(normalized);

    if (!Number.isSafeInteger(amount) || amount < 0) {
        return null;
    }

    return amount;
}

function isValidEmail(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidDate(value: string) {
    return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isValidAccountType(
    value: string
): value is "普通" | "当座" {
    return value === "普通" || value === "当座";
}

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();

        const name = getRequiredText(formData, "name");
        const phone = getRequiredText(formData, "phone");
        const email = getRequiredText(formData, "email");
        const workDate = getRequiredText(formData, "work_date");

        const bankName = getRequiredText(formData, "bank_name");
        const branchName = getRequiredText(formData, "branch_name");
        const accountType = getRequiredText(
            formData,
            "account_type"
        );
        const accountNumber = getRequiredText(
            formData,
            "account_number"
        ).replace(/[^\d]/g, "");
        const accountHolder = getRequiredText(
            formData,
            "account_holder"
        );

        if (!name) {
            return json(
                {
                    ok: false,
                    message: "お名前を入力してください。",
                },
                400
            );
        }

        if (!phone) {
            return json(
                {
                    ok: false,
                    message: "電話番号を入力してください。",
                },
                400
            );
        }

        if (!email) {
            return json(
                {
                    ok: false,
                    message: "メールアドレスを入力してください。",
                },
                400
            );
        }

        if (!isValidEmail(email)) {
            return json(
                {
                    ok: false,
                    message: "メールアドレスの形式が正しくありません。",
                },
                400
            );
        }

        if (!workDate || !isValidDate(workDate)) {
            return json(
                {
                    ok: false,
                    message: "お仕事に入られた日を入力してください。",
                },
                400
            );
        }

        if (!bankName) {
            return json(
                {
                    ok: false,
                    message: "お振込先銀行名を入力してください。",
                },
                400
            );
        }

        if (!branchName) {
            return json(
                {
                    ok: false,
                    message: "支店名を入力してください。",
                },
                400
            );
        }

        if (!isValidAccountType(accountType)) {
            return json(
                {
                    ok: false,
                    message: "口座種別が正しくありません。",
                },
                400
            );
        }

        if (!accountNumber) {
            return json(
                {
                    ok: false,
                    message: "口座番号を入力してください。",
                },
                400
            );
        }

        if (!accountHolder) {
            return json(
                {
                    ok: false,
                    message: "口座名義を入力してください。",
                },
                400
            );
        }

        const expenseData: Record<string, string | number> = {};
        let calculatedTotalAmount = 0;

        for (
            let index = 1;
            index <= MAX_EXPENSE_COUNT;
            index += 1
        ) {
            const description = getText(
                formData,
                `expense${index}_description`
            );

            const amountText = getText(
                formData,
                `expense${index}_amount`
            );

            const amount = parseAmount(amountText);

            if (amount === null) {
                return json(
                    {
                        ok: false,
                        message: `経費${index}の金額が正しくありません。`,
                    },
                    400
                );
            }

            const hasDescription = description.length > 0;
            const hasAmount = amount > 0;

            if (index === 1 && !hasDescription) {
                return json(
                    {
                        ok: false,
                        message: "経費1の内容を入力してください。",
                    },
                    400
                );
            }

            if (index === 1 && !hasAmount) {
                return json(
                    {
                        ok: false,
                        message: "経費1の金額を入力してください。",
                    },
                    400
                );
            }

            if (hasDescription !== hasAmount) {
                return json(
                    {
                        ok: false,
                        message: `経費${index}は、内容と金額の両方を入力してください。`,
                    },
                    400
                );
            }

            expenseData[`expense${index}_description`] =
                description || "";
            expenseData[`expense${index}_amount`] = amount;

            calculatedTotalAmount += amount;
        }

        if (calculatedTotalAmount <= 0) {
            return json(
                {
                    ok: false,
                    message: "経費金額を入力してください。",
                },
                400
            );
        }

        const receiptFilesJson = getText(
            formData,
            "receipt_files_json"
        );

        let receiptFiles: GoogleDriveReceiptFile[] = [];

        if (receiptFilesJson) {
            try {
                const parsed = JSON.parse(receiptFilesJson);

                if (!Array.isArray(parsed)) {
                    return json(
                        {
                            ok: false,
                            message:
                                "レシートファイル情報の形式が正しくありません。",
                        },
                        400
                    );
                }

                receiptFiles = parsed.filter(
                    (
                        value
                    ): value is GoogleDriveReceiptFile => {
                        if (
                            typeof value !== "object" ||
                            value === null
                        ) {
                            return false;
                        }

                        const file =
                            value as Partial<GoogleDriveReceiptFile>;

                        return (
                            typeof file.id === "string" &&
                            file.id.length > 0 &&
                            typeof file.name === "string" &&
                            file.name.length > 0 &&
                            typeof file.url === "string" &&
                            file.url.length > 0 &&
                            typeof file.viewUrl === "string" &&
                            file.viewUrl.length > 0
                        );
                    }
                );

                if (receiptFiles.length !== parsed.length) {
                    return json(
                        {
                            ok: false,
                            message:
                                "レシートファイル情報に不正なデータが含まれています。",
                        },
                        400
                    );
                }
            } catch {
                return json(
                    {
                        ok: false,
                        message:
                            "レシートファイル情報を読み取れませんでした。",
                    },
                    400
                );
            }
        }

        if (receiptFiles.length > MAX_RECEIPT_COUNT) {
            return json(
                {
                    ok: false,
                    message: `レシートは最大${MAX_RECEIPT_COUNT}ファイルまでです。`,
                },
                400
            );
        }

        const { data: claim, error: insertError } =
            await supabaseAdmin
                .from("external_expense_claims")
                .insert({
                    name,
                    phone,
                    email,
                    work_date: workDate,

                    ...expenseData,

                    total_amount: calculatedTotalAmount,
                    receipt_files: receiptFiles,

                    bank_name: bankName,
                    branch_name: branchName,
                    account_type: accountType,
                    account_number: accountNumber,
                    account_holder: accountHolder,

                    status: "申請中",
                })
                .select("id, created_at, status")
                .single();

        if (insertError || !claim) {
            console.error(
                "[public-expense-claims] insert failed",
                insertError
            );

            return json(
                {
                    ok: false,
                    message:
                        "経費精算の登録に失敗しました。時間をおいて再度お試しください。",
                },
                500
            );
        }

        console.log("[public-expense-claims] created", {
            claimId: claim.id,
            createdAt: claim.created_at,
            receiptCount: receiptFiles.length,
        });

        return json(
            {
                ok: true,
                message: "経費精算を受け付けました。",
                claimId: claim.id,
                status: claim.status,
            },
            201
        );
    } catch (error) {
        console.error(
            "[public-expense-claims] unexpected error",
            error
        );

        return json(
            {
                ok: false,
                message:
                    "経費精算の送信中にエラーが発生しました。",
            },
            500
        );
    }
}