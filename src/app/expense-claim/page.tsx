"use client";

import Link from "next/link";
import {
    ChangeEvent,
    FormEvent,
    useMemo,
    useRef,
    useState,
} from "react";

type ExpenseRow = {
    description: string;
    amount: string;
};

const MAX_EXPENSE_COUNT = 5;
const MAX_RECEIPT_COUNT = 10;
const MAX_FILE_SIZE_MB = 10;

const INITIAL_EXPENSES: ExpenseRow[] = Array.from(
    { length: MAX_EXPENSE_COUNT },
    () => ({
        description: "",
        amount: "",
    })
);

function normalizeAmount(value: string) {
    return value.replace(/[^\d]/g, "");
}

function formatAmount(value: number) {
    return new Intl.NumberFormat("ja-JP").format(value);
}

export default function ExpenseClaimPage() {
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const [name, setName] = useState("");
    const [phone, setPhone] = useState("");
    const [email, setEmail] = useState("");
    const [workDate, setWorkDate] = useState("");

    const [expenses, setExpenses] =
        useState<ExpenseRow[]>(INITIAL_EXPENSES);

    const [receiptFiles, setReceiptFiles] = useState<File[]>([]);

    const [bankName, setBankName] = useState("");
    const [branchName, setBranchName] = useState("");
    const [accountType, setAccountType] = useState<"普通" | "当座">(
        "普通"
    );
    const [accountNumber, setAccountNumber] = useState("");
    const [accountHolder, setAccountHolder] = useState("");

    const [agreed, setAgreed] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");

    const totalAmount = useMemo(() => {
        return expenses.reduce((sum, expense) => {
            const amount = Number(expense.amount || 0);

            return sum + (Number.isFinite(amount) ? amount : 0);
        }, 0);
    }, [expenses]);

    function updateExpense(
        index: number,
        field: keyof ExpenseRow,
        value: string
    ) {
        setExpenses((current) =>
            current.map((expense, expenseIndex) => {
                if (expenseIndex !== index) {
                    return expense;
                }

                return {
                    ...expense,
                    [field]:
                        field === "amount" ? normalizeAmount(value) : value,
                };
            })
        );
    }

    function handleReceiptChange(
        event: ChangeEvent<HTMLInputElement>
    ) {
        setErrorMessage("");

        const selectedFiles = Array.from(event.target.files ?? []);

        if (selectedFiles.length === 0) {
            return;
        }

        const combinedFiles = [...receiptFiles, ...selectedFiles];

        if (combinedFiles.length > MAX_RECEIPT_COUNT) {
            setErrorMessage(
                `レシートは最大${MAX_RECEIPT_COUNT}ファイルまで添付できます。`
            );

            event.target.value = "";
            return;
        }

        const invalidTypeFile = combinedFiles.find((file) => {
            const isImage = file.type.startsWith("image/");
            const isPdf = file.type === "application/pdf";

            return !isImage && !isPdf;
        });

        if (invalidTypeFile) {
            setErrorMessage(
                `「${invalidTypeFile.name}」は添付できません。画像またはPDFを選択してください。`
            );

            event.target.value = "";
            return;
        }

        const oversizedFile = combinedFiles.find(
            (file) =>
                file.size > MAX_FILE_SIZE_MB * 1024 * 1024
        );

        if (oversizedFile) {
            setErrorMessage(
                `「${oversizedFile.name}」は${MAX_FILE_SIZE_MB}MBを超えています。`
            );

            event.target.value = "";
            return;
        }

        setReceiptFiles(combinedFiles);
        event.target.value = "";
    }

    function removeReceipt(index: number) {
        setReceiptFiles((current) =>
            current.filter((_, fileIndex) => fileIndex !== index)
        );
    }

    function validateForm() {
        if (!name.trim()) {
            return "お名前を入力してください。";
        }

        if (!phone.trim()) {
            return "電話番号を入力してください。";
        }

        if (!email.trim()) {
            return "メールアドレスを入力してください。";
        }

        if (!workDate) {
            return "お仕事に入られた日を入力してください。";
        }

        const firstExpense = expenses[0];

        if (!firstExpense.description.trim()) {
            return "経費①の内容を入力してください。";
        }

        if (!firstExpense.amount || Number(firstExpense.amount) <= 0) {
            return "経費①の金額を入力してください。";
        }

        for (let index = 0; index < expenses.length; index += 1) {
            const expense = expenses[index];
            const hasDescription = Boolean(expense.description.trim());
            const hasAmount =
                Boolean(expense.amount) && Number(expense.amount) > 0;

            if (hasDescription !== hasAmount) {
                return `経費${index + 1}は、内容と金額の両方を入力してください。`;
            }
        }

        if (totalAmount <= 0) {
            return "経費金額を入力してください。";
        }

        if (!bankName.trim()) {
            return "お振込先銀行名を入力してください。";
        }

        if (!branchName.trim()) {
            return "支店名を入力してください。";
        }

        if (!accountNumber.trim()) {
            return "口座番号を入力してください。";
        }

        if (!accountHolder.trim()) {
            return "口座名義を入力してください。";
        }

        if (!agreed) {
            return "注意事項を確認し、同意欄にチェックしてください。";
        }

        return null;
    }

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        setErrorMessage("");

        const validationError = validateForm();

        if (validationError) {
            setErrorMessage(validationError);
            window.scrollTo({
                top: 0,
                behavior: "smooth",
            });
            return;
        }

        const confirmed = window.confirm(
            [
                "以下の内容で経費精算を申請しますか？",
                "",
                `お名前：${name}`,
                `勤務日：${workDate}`,
                `合計金額：${formatAmount(totalAmount)}円`,
                `添付ファイル：${receiptFiles.length}件`,
            ].join("\n")
        );

        if (!confirmed) {
            return;
        }

        setIsSubmitting(true);

        try {
            const formData = new FormData();

            formData.append("name", name.trim());
            formData.append("phone", phone.trim());
            formData.append("email", email.trim());
            formData.append("work_date", workDate);

            expenses.forEach((expense, index) => {
                const number = index + 1;

                formData.append(
                    `expense${number}_description`,
                    expense.description.trim()
                );

                formData.append(
                    `expense${number}_amount`,
                    expense.amount || "0"
                );
            });

            formData.append("total_amount", String(totalAmount));

            formData.append("bank_name", bankName.trim());
            formData.append("branch_name", branchName.trim());
            formData.append("account_type", accountType);
            formData.append(
                "account_number",
                accountNumber.replace(/[^\d]/g, "")
            );
            formData.append(
                "account_holder",
                accountHolder.trim().toUpperCase()
            );

            receiptFiles.forEach((file) => {
                formData.append("receipt_files", file);
            });

            const response = await fetch(
                "/api/public/expense-claims",
                {
                    method: "POST",
                    body: formData,
                }
            );

            const result = (await response.json().catch(() => null)) as
                | {
                    ok?: boolean;
                    message?: string;
                    claimId?: string;
                }
                | null;

            if (!response.ok || !result?.ok) {
                throw new Error(
                    result?.message ??
                    "経費精算の送信に失敗しました。"
                );
            }

            setSubmitted(true);
            window.scrollTo({
                top: 0,
                behavior: "smooth",
            });
        } catch (error) {
            console.error("[expense-claim] submit failed", error);

            setErrorMessage(
                error instanceof Error
                    ? error.message
                    : "経費精算の送信に失敗しました。"
            );

            window.scrollTo({
                top: 0,
                behavior: "smooth",
            });
        } finally {
            setIsSubmitting(false);
        }
    }

    if (submitted) {
        return (
            <main className="min-h-screen bg-slate-50 px-4 py-10">
                <div className="mx-auto max-w-3xl">
                    <div className="rounded-2xl border border-green-200 bg-white p-6 shadow-sm sm:p-10">
                        <div className="text-center">
                            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-3xl text-green-700">
                                ✓
                            </div>

                            <h1 className="mt-6 text-2xl font-bold text-slate-900">
                                経費精算を受け付けました
                            </h1>

                            <p className="mt-4 leading-7 text-slate-600">
                                ご入力いただいた内容を確認後、指定された銀行口座へお振込みいたします。
                            </p>

                            <p className="mt-2 leading-7 text-slate-600">
                                確認が必要な場合は、ご入力いただいた電話番号またはメールアドレスへご連絡します。
                            </p>

                            <div className="mt-8 rounded-xl bg-slate-50 p-4 text-left text-sm leading-6 text-slate-700">
                                ご不明点は、
                                <a
                                    href="tel:05037022802"
                                    className="font-semibold text-blue-700 underline"
                                >
                                    050-3702-2802
                                </a>
                                （塩澤）までご連絡ください。
                            </div>

                            <Link
                                href="/"
                                className="mt-8 inline-flex rounded-lg bg-slate-900 px-6 py-3 font-semibold text-white hover:bg-slate-700"
                            >
                                トップページへ戻る
                            </Link>
                        </div>
                    </div>
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-slate-50 px-4 py-8 sm:py-12">
            <div className="mx-auto max-w-4xl">
                <div className="mb-5">
                    <Link
                        href="/"
                        className="text-sm font-medium text-blue-700 hover:underline"
                    >
                        ← トップページへ戻る
                    </Link>
                </div>

                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <div className="bg-slate-900 px-5 py-7 text-white sm:px-8">
                        <p className="text-sm font-semibold text-slate-300">
                            株式会社ファミーユ
                        </p>

                        <h1 className="mt-2 text-2xl font-bold sm:text-3xl">
                            経費精算（スキマバイト用）
                        </h1>
                    </div>

                    <div className="space-y-5 px-5 py-6 sm:px-8">
                        <p className="leading-7 text-slate-700">
                            スキマバイト等でファミーユのお仕事をしてくださった方で、経費の立替をされた場合は、こちらから精算を行ってください。指定の銀行口座へお振込みいたします。
                        </p>

                        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-7 text-amber-950">
                            <p className="font-bold">
                                精算できる経費
                            </p>

                            <ol className="mt-2 list-decimal space-y-2 pl-5">
                                <li>
                                    交通費・コインパーキング代
                                    <br />
                                    お仕事中に、ある拠点から別の拠点へ移動した際の費用です。お仕事前後の通勤費は精算対象外です。また、福祉乗車券（介助者用）を使用できる区間も精算対象外です。
                                </li>

                                <li>
                                    お食事代
                                    <br />
                                    サービス中に利用者様とお食事をした場合、800円を上限として会社負担があります。
                                </li>
                            </ol>
                        </div>

                        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-7 text-blue-950">
                            経費は最大5項目、レシートは最大10ファイルまで添付できます。それを超える場合は、申請を分けて提出してください。
                            レシートを添付できない場合は、経費内容欄に「バス乗車・レシートなし」などの理由を記載してください。
                        </div>

                        <p className="text-sm text-slate-600">
                            <span className="font-bold text-red-600">*</span>
                            は必須項目です。
                        </p>

                        {errorMessage && (
                            <div
                                role="alert"
                                className="rounded-xl border border-red-300 bg-red-50 p-4 font-medium text-red-800"
                            >
                                {errorMessage}
                            </div>
                        )}
                    </div>

                    <form
                        onSubmit={handleSubmit}
                        className="space-y-10 border-t border-slate-200 px-5 py-8 sm:px-8"
                    >
                        <section>
                            <SectionTitle>申請者情報</SectionTitle>

                            <div className="mt-5 grid gap-5 sm:grid-cols-2">
                                <Field label="お名前（フルネーム）" required>
                                    <input
                                        type="text"
                                        value={name}
                                        onChange={(event) =>
                                            setName(event.target.value)
                                        }
                                        autoComplete="name"
                                        className={inputClassName}
                                        placeholder="例：山田 太郎"
                                        required
                                    />
                                </Field>

                                <Field label="電話番号" required>
                                    <input
                                        type="tel"
                                        value={phone}
                                        onChange={(event) =>
                                            setPhone(event.target.value)
                                        }
                                        autoComplete="tel"
                                        inputMode="tel"
                                        className={inputClassName}
                                        placeholder="例：090-1234-5678"
                                        required
                                    />

                                    <p className="mt-2 text-xs text-slate-500">
                                        確認・折り返し用の電話番号を入力してください。
                                    </p>
                                </Field>

                                <Field label="メールアドレス" required>
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(event) =>
                                            setEmail(event.target.value)
                                        }
                                        autoComplete="email"
                                        className={inputClassName}
                                        placeholder="例：example@example.com"
                                        required
                                    />

                                    <p className="mt-2 text-xs text-slate-500">
                                        振込完了または却下のご連絡に使用します。
                                    </p>
                                </Field>

                                <Field label="お仕事に入られた日" required>
                                    <input
                                        type="date"
                                        value={workDate}
                                        onChange={(event) =>
                                            setWorkDate(event.target.value)
                                        }
                                        className={inputClassName}
                                        required
                                    />
                                </Field>
                            </div>
                        </section>

                        <section>
                            <SectionTitle>経費の内容</SectionTitle>

                            <p className="mt-3 text-sm leading-6 text-slate-600">
                                複数ある場合は、それぞれの行に内容と金額を入力してください。
                            </p>

                            <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200">
                                <table className="w-full min-w-[640px] border-collapse">
                                    <thead className="bg-slate-100 text-left text-sm text-slate-700">
                                        <tr>
                                            <th className="w-16 border-b border-slate-200 px-4 py-3 text-center">
                                                No.
                                            </th>

                                            <th className="border-b border-slate-200 px-4 py-3">
                                                経費の概要
                                            </th>

                                            <th className="w-52 border-b border-slate-200 px-4 py-3">
                                                金額
                                            </th>
                                        </tr>
                                    </thead>

                                    <tbody>
                                        {expenses.map((expense, index) => (
                                            <tr
                                                key={index}
                                                className="border-b border-slate-100 last:border-b-0"
                                            >
                                                <td className="px-4 py-4 text-center font-semibold text-slate-700">
                                                    {index + 1}
                                                    {index === 0 && (
                                                        <span className="ml-1 text-red-600">
                                                            *
                                                        </span>
                                                    )}
                                                </td>

                                                <td className="px-4 py-4">
                                                    <textarea
                                                        value={expense.description}
                                                        onChange={(event) =>
                                                            updateExpense(
                                                                index,
                                                                "description",
                                                                event.target.value
                                                            )
                                                        }
                                                        rows={2}
                                                        className={inputClassName}
                                                        placeholder={
                                                            index === 0
                                                                ? "例：○○駅から△△駅までの交通費"
                                                                : "経費の内容"
                                                        }
                                                        required={index === 0}
                                                    />
                                                </td>

                                                <td className="px-4 py-4">
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            type="text"
                                                            inputMode="numeric"
                                                            value={expense.amount}
                                                            onChange={(event) =>
                                                                updateExpense(
                                                                    index,
                                                                    "amount",
                                                                    event.target.value
                                                                )
                                                            }
                                                            className={`${inputClassName} text-right`}
                                                            placeholder="0"
                                                            required={index === 0}
                                                        />

                                                        <span className="shrink-0 text-slate-700">
                                                            円
                                                        </span>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>

                                    <tfoot className="bg-slate-50">
                                        <tr>
                                            <th
                                                colSpan={2}
                                                className="px-4 py-4 text-right text-base text-slate-800"
                                            >
                                                申請合計
                                            </th>

                                            <td className="px-4 py-4 text-right text-xl font-bold text-slate-900">
                                                {formatAmount(totalAmount)}円
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </section>

                        <section>
                            <SectionTitle>レシート添付</SectionTitle>

                            <p className="mt-3 text-sm leading-6 text-slate-600">
                                画像またはPDFを最大10ファイルまで添付できます。1ファイルあたり最大
                                {MAX_FILE_SIZE_MB}MBです。
                            </p>

                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*,.pdf,application/pdf"
                                multiple
                                onChange={handleReceiptChange}
                                className="hidden"
                            />

                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={
                                    receiptFiles.length >= MAX_RECEIPT_COUNT
                                }
                                className="mt-5 rounded-lg border border-blue-700 bg-white px-5 py-3 font-semibold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-400"
                            >
                                レシートを選択
                            </button>

                            <p className="mt-2 text-sm text-slate-500">
                                {receiptFiles.length} / {MAX_RECEIPT_COUNT}
                                ファイル選択済み
                            </p>

                            {receiptFiles.length > 0 && (
                                <ul className="mt-4 space-y-2">
                                    {receiptFiles.map((file, index) => (
                                        <li
                                            key={`${file.name}-${file.lastModified}-${index}`}
                                            className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3"
                                        >
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-medium text-slate-800">
                                                    {index + 1}. {file.name}
                                                </p>

                                                <p className="text-xs text-slate-500">
                                                    {(file.size / 1024 / 1024).toFixed(2)}
                                                    MB
                                                </p>
                                            </div>

                                            <button
                                                type="button"
                                                onClick={() => removeReceipt(index)}
                                                className="shrink-0 text-sm font-semibold text-red-700 hover:underline"
                                            >
                                                削除
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>

                        <section>
                            <SectionTitle>お振込先</SectionTitle>

                            <div className="mt-5 grid gap-5 sm:grid-cols-2">
                                <Field label="お振込先銀行名" required>
                                    <input
                                        type="text"
                                        value={bankName}
                                        onChange={(event) =>
                                            setBankName(event.target.value)
                                        }
                                        autoComplete="off"
                                        className={inputClassName}
                                        placeholder="例：三菱UFJ銀行"
                                        required
                                    />
                                </Field>

                                <Field label="支店名" required>
                                    <input
                                        type="text"
                                        value={branchName}
                                        onChange={(event) =>
                                            setBranchName(event.target.value)
                                        }
                                        autoComplete="off"
                                        className={inputClassName}
                                        placeholder="例：名古屋支店"
                                        required
                                    />
                                </Field>

                                <Field label="口座種別" required>
                                    <div className="flex min-h-12 items-center gap-6 rounded-lg border border-slate-300 px-4">
                                        <label className="flex cursor-pointer items-center gap-2">
                                            <input
                                                type="radio"
                                                name="accountType"
                                                value="普通"
                                                checked={accountType === "普通"}
                                                onChange={() =>
                                                    setAccountType("普通")
                                                }
                                            />

                                            <span>普通口座</span>
                                        </label>

                                        <label className="flex cursor-pointer items-center gap-2">
                                            <input
                                                type="radio"
                                                name="accountType"
                                                value="当座"
                                                checked={accountType === "当座"}
                                                onChange={() =>
                                                    setAccountType("当座")
                                                }
                                            />

                                            <span>当座口座</span>
                                        </label>
                                    </div>
                                </Field>

                                <Field label="口座番号" required>
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        value={accountNumber}
                                        onChange={(event) =>
                                            setAccountNumber(
                                                event.target.value.replace(/[^\d]/g, "")
                                            )
                                        }
                                        autoComplete="off"
                                        className={inputClassName}
                                        placeholder="例：1234567"
                                        required
                                    />
                                </Field>

                                <div className="sm:col-span-2">
                                    <Field label="口座名義（カタカナ）" required>
                                        <input
                                            type="text"
                                            value={accountHolder}
                                            onChange={(event) =>
                                                setAccountHolder(
                                                    event.target.value.toUpperCase()
                                                )
                                            }
                                            autoComplete="off"
                                            className={inputClassName}
                                            placeholder="例：ヤマダ タロウ"
                                            required
                                        />

                                        <p className="mt-2 text-xs text-slate-500">
                                            通帳や銀行アプリに表示されている口座名義を、カタカナで入力してください。
                                        </p>
                                    </Field>
                                </div>
                            </div>
                        </section>

                        <section>
                            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-300 bg-slate-50 p-4">
                                <input
                                    type="checkbox"
                                    checked={agreed}
                                    onChange={(event) =>
                                        setAgreed(event.target.checked)
                                    }
                                    className="mt-1 h-5 w-5"
                                />

                                <span className="text-sm leading-7 text-slate-700">
                                    精算対象、入力内容および振込先口座情報に誤りがないことを確認しました。
                                    <span className="ml-1 font-bold text-red-600">
                                        *
                                    </span>
                                </span>
                            </label>
                        </section>

                        <div className="border-t border-slate-200 pt-7">
                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="w-full rounded-xl bg-blue-700 px-6 py-4 text-lg font-bold text-white shadow-sm hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                            >
                                {isSubmitting
                                    ? "送信しています..."
                                    : "入力内容を確認して申請する"}
                            </button>

                            <p className="mt-5 text-center text-sm leading-6 text-slate-600">
                                ご不明点は、
                                <a
                                    href="tel:05037022802"
                                    className="font-semibold text-blue-700 underline"
                                >
                                    050-3702-2802
                                </a>
                                （塩澤）までご連絡ください。
                            </p>
                        </div>
                    </form>
                </div>
            </div>
        </main>
    );
}

function SectionTitle({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <h2 className="border-l-4 border-blue-700 pl-3 text-xl font-bold text-slate-900">
            {children}
        </h2>
    );
}

function Field({
    label,
    required = false,
    children,
}: {
    label: string;
    required?: boolean;
    children: React.ReactNode;
}) {
    return (
        <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-800">
                {label}

                {required && (
                    <span className="ml-1 text-red-600">*</span>
                )}
            </span>

            {children}
        </label>
    );
}

const inputClassName =
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100";