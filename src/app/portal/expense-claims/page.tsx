"use client";

import Link from "next/link";
import {
    useCallback,
    useEffect,
    useMemo,
    useState,
} from "react";
import { supabase } from "@/lib/supabase";

type ReceiptFile = {
    name?: string;
    path?: string;
    url?: string;
};

type ExpenseClaim = {
    id: string;
    created_at: string;
    updated_at: string;

    name: string;
    phone: string;
    email: string | null;
    work_date: string;

    expense1_description: string | null;
    expense1_amount: number | null;
    expense2_description: string | null;
    expense2_amount: number | null;
    expense3_description: string | null;
    expense3_amount: number | null;
    expense4_description: string | null;
    expense4_amount: number | null;
    expense5_description: string | null;
    expense5_amount: number | null;

    total_amount: number;
    receipt_files: ReceiptFile[] | null;

    bank_name: string;
    branch_name: string;
    account_type: string;
    account_number: string;
    account_holder: string;

    status:
    | "申請中"
    | "確認中"
    | "承認済"
    | "振込済"
    | "却下";

    rejection_reason: string | null;

    approved_at: string | null;
    approved_by: string | null;

    paid_at: string | null;
    paid_by: string | null;

    rejected_at: string | null;
    rejected_by: string | null;
};

type ApiResponse = {
    ok?: boolean;
    data?: ExpenseClaim[];
    message?: string;
};

const STATUS_OPTIONS = [
    "",
    "申請中",
    "確認中",
    "承認済",
    "振込済",
    "却下",
] as const;

function formatCurrency(value: number | null | undefined) {
    return `${new Intl.NumberFormat("ja-JP").format(
        Number(value ?? 0)
    )}円`;
}

function formatDate(value: string | null | undefined) {
    if (!value) {
        return "—";
    }

    const date = new Date(`${value}T00:00:00`);

    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return new Intl.DateTimeFormat("ja-JP", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(date);
}

function formatDateTime(value: string | null | undefined) {
    if (!value) {
        return "—";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return new Intl.DateTimeFormat("ja-JP", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    }).format(date);
}

function getStatusClassName(status: ExpenseClaim["status"]) {
    switch (status) {
        case "申請中":
            return "border-amber-200 bg-amber-50 text-amber-800";

        case "確認中":
            return "border-blue-200 bg-blue-50 text-blue-800";

        case "承認済":
            return "border-indigo-200 bg-indigo-50 text-indigo-800";

        case "振込済":
            return "border-green-200 bg-green-50 text-green-800";

        case "却下":
            return "border-red-200 bg-red-50 text-red-800";

        default:
            return "border-slate-200 bg-slate-50 text-slate-700";
    }
}

function maskAccountNumber(value: string) {
    if (!value) {
        return "—";
    }

    if (value.length <= 3) {
        return value;
    }

    return `${"*".repeat(
        Math.max(value.length - 3, 1)
    )}${value.slice(-3)}`;
}

export default function ExpenseClaimsAdminPage() {
    const [claims, setClaims] = useState<ExpenseClaim[]>([]);
    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState("");

    const [keyword, setKeyword] = useState("");
    const [status, setStatus] = useState("");
    const [fromDate, setFromDate] = useState("");
    const [toDate, setToDate] = useState("");

    const [selectedClaim, setSelectedClaim] =
        useState<ExpenseClaim | null>(null);

    const fetchClaims = useCallback(async () => {
        setLoading(true);
        setErrorMessage("");

        try {
            const {
                data: { session },
                error: sessionError,
            } = await supabase.auth.getSession();

            if (sessionError) {
                throw sessionError;
            }

            if (!session?.access_token) {
                throw new Error(
                    "ログイン情報を取得できませんでした。再度ログインしてください。"
                );
            }

            const params = new URLSearchParams();

            if (keyword.trim()) {
                params.set("keyword", keyword.trim());
            }

            if (status) {
                params.set("status", status);
            }

            if (fromDate) {
                params.set("from_date", fromDate);
            }

            if (toDate) {
                params.set("to_date", toDate);
            }

            const queryString = params.toString();

            const response = await fetch(
                `/api/admin/expense-claims${queryString ? `?${queryString}` : ""
                }`,
                {
                    method: "GET",
                    headers: {
                        Authorization: `Bearer ${session.access_token}`,
                    },
                    cache: "no-store",
                }
            );

            const result =
                (await response.json().catch(() => null)) as
                | ApiResponse
                | null;

            if (!response.ok || !result?.ok) {
                throw new Error(
                    result?.message ??
                    "経費精算一覧の取得に失敗しました。"
                );
            }

            setClaims(result.data ?? []);
        } catch (error) {
            console.error(
                "[expense-claims-admin] fetch failed",
                error
            );

            setClaims([]);

            setErrorMessage(
                error instanceof Error
                    ? error.message
                    : "経費精算一覧の取得に失敗しました。"
            );
        } finally {
            setLoading(false);
        }
    }, [keyword, status, fromDate, toDate]);

    useEffect(() => {
        void fetchClaims();
    }, [fetchClaims]);

    const summary = useMemo(() => {
        return claims.reduce(
            (current, claim) => {
                current.totalCount += 1;
                current.totalAmount += Number(
                    claim.total_amount ?? 0
                );

                if (claim.status === "申請中") {
                    current.submittedCount += 1;
                    current.unpaidAmount += Number(
                        claim.total_amount ?? 0
                    );
                }

                if (
                    claim.status === "確認中" ||
                    claim.status === "承認済"
                ) {
                    current.processingCount += 1;
                    current.unpaidAmount += Number(
                        claim.total_amount ?? 0
                    );
                }

                if (claim.status === "振込済") {
                    current.paidCount += 1;
                }

                if (claim.status === "却下") {
                    current.rejectedCount += 1;
                }

                return current;
            },
            {
                totalCount: 0,
                totalAmount: 0,
                submittedCount: 0,
                processingCount: 0,
                paidCount: 0,
                rejectedCount: 0,
                unpaidAmount: 0,
            }
        );
    }, [claims]);

    function clearFilters() {
        setKeyword("");
        setStatus("");
        setFromDate("");
        setToDate("");
    }

    return (
        <main className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6">
            <div className="mx-auto max-w-7xl">
                <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <p className="text-sm font-medium text-slate-500">
                            管理者ページ
                        </p>

                        <h1 className="mt-1 text-2xl font-bold text-slate-900 sm:text-3xl">
                            経費精算管理
                        </h1>

                        <p className="mt-2 text-sm text-slate-600">
                            スキマバイト用経費精算の申請内容と振込状況を確認します。
                        </p>
                    </div>

                    <Link
                        href="/portal"
                        className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                    >
                        ポータルへ戻る
                    </Link>
                </div>

                <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                    <SummaryCard
                        label="表示件数"
                        value={`${summary.totalCount}件`}
                    />

                    <SummaryCard
                        label="申請中"
                        value={`${summary.submittedCount}件`}
                    />

                    <SummaryCard
                        label="確認・承認中"
                        value={`${summary.processingCount}件`}
                    />

                    <SummaryCard
                        label="未振込合計"
                        value={formatCurrency(summary.unpaidAmount)}
                    />

                    <SummaryCard
                        label="振込済"
                        value={`${summary.paidCount}件`}
                    />
                </section>

                <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
                    <div className="grid gap-4 lg:grid-cols-5">
                        <label className="block lg:col-span-2">
                            <span className="mb-2 block text-sm font-semibold text-slate-700">
                                氏名・電話番号・メール
                            </span>

                            <input
                                type="text"
                                value={keyword}
                                onChange={(event) =>
                                    setKeyword(event.target.value)
                                }
                                placeholder="検索キーワード"
                                className={inputClassName}
                            />
                        </label>

                        <label className="block">
                            <span className="mb-2 block text-sm font-semibold text-slate-700">
                                ステータス
                            </span>

                            <select
                                value={status}
                                onChange={(event) =>
                                    setStatus(event.target.value)
                                }
                                className={inputClassName}
                            >
                                {STATUS_OPTIONS.map((option) => (
                                    <option key={option} value={option}>
                                        {option || "すべて"}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <label className="block">
                            <span className="mb-2 block text-sm font-semibold text-slate-700">
                                勤務日（開始）
                            </span>

                            <input
                                type="date"
                                value={fromDate}
                                onChange={(event) =>
                                    setFromDate(event.target.value)
                                }
                                className={inputClassName}
                            />
                        </label>

                        <label className="block">
                            <span className="mb-2 block text-sm font-semibold text-slate-700">
                                勤務日（終了）
                            </span>

                            <input
                                type="date"
                                value={toDate}
                                onChange={(event) =>
                                    setToDate(event.target.value)
                                }
                                className={inputClassName}
                            />
                        </label>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-3">
                        <button
                            type="button"
                            onClick={() => void fetchClaims()}
                            disabled={loading}
                            className="rounded-lg bg-blue-700 px-5 py-2.5 font-semibold text-white hover:bg-blue-800 disabled:bg-slate-400"
                        >
                            {loading ? "取得中..." : "検索・再読み込み"}
                        </button>

                        <button
                            type="button"
                            onClick={clearFilters}
                            className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 font-semibold text-slate-700 hover:bg-slate-100"
                        >
                            条件をクリア
                        </button>
                    </div>
                </section>

                {errorMessage && (
                    <div className="mt-6 rounded-xl border border-red-300 bg-red-50 p-4 font-medium text-red-800">
                        {errorMessage}
                    </div>
                )}

                <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                        <h2 className="text-lg font-bold text-slate-900">
                            申請一覧
                        </h2>

                        <p className="text-sm text-slate-500">
                            {claims.length}件
                        </p>
                    </div>

                    {loading ? (
                        <div className="px-5 py-16 text-center text-slate-500">
                            読み込み中です...
                        </div>
                    ) : claims.length === 0 ? (
                        <div className="px-5 py-16 text-center text-slate-500">
                            該当する申請はありません。
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[1180px] border-collapse text-sm">
                                <thead className="bg-slate-100 text-left text-slate-700">
                                    <tr>
                                        <th className={tableHeaderClassName}>
                                            申請日時
                                        </th>

                                        <th className={tableHeaderClassName}>
                                            申請者
                                        </th>

                                        <th className={tableHeaderClassName}>
                                            勤務日
                                        </th>

                                        <th className={tableHeaderClassName}>
                                            経費概要
                                        </th>

                                        <th
                                            className={`${tableHeaderClassName} text-right`}
                                        >
                                            合計金額
                                        </th>

                                        <th className={tableHeaderClassName}>
                                            ステータス
                                        </th>

                                        <th className={tableHeaderClassName}>
                                            振込先
                                        </th>

                                        <th className={tableHeaderClassName}>
                                            操作
                                        </th>
                                    </tr>
                                </thead>

                                <tbody>
                                    {claims.map((claim) => (
                                        <tr
                                            key={claim.id}
                                            className="border-t border-slate-200 align-top hover:bg-slate-50"
                                        >
                                            <td className={tableCellClassName}>
                                                {formatDateTime(claim.created_at)}
                                            </td>

                                            <td className={tableCellClassName}>
                                                <p className="font-semibold text-slate-900">
                                                    {claim.name}
                                                </p>

                                                <p className="mt-1 text-xs text-slate-500">
                                                    {claim.phone}
                                                </p>

                                                {claim.email && (
                                                    <p className="mt-1 max-w-52 truncate text-xs text-slate-500">
                                                        {claim.email}
                                                    </p>
                                                )}
                                            </td>

                                            <td className={tableCellClassName}>
                                                {formatDate(claim.work_date)}
                                            </td>

                                            <td className={tableCellClassName}>
                                                <p className="max-w-72 whitespace-pre-wrap text-slate-700">
                                                    {claim.expense1_description ||
                                                        "—"}
                                                </p>
                                            </td>

                                            <td
                                                className={`${tableCellClassName} text-right text-base font-bold text-slate-900`}
                                            >
                                                {formatCurrency(
                                                    claim.total_amount
                                                )}
                                            </td>

                                            <td className={tableCellClassName}>
                                                <span
                                                    className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${getStatusClassName(
                                                        claim.status
                                                    )}`}
                                                >
                                                    {claim.status}
                                                </span>
                                            </td>

                                            <td className={tableCellClassName}>
                                                <p className="font-medium text-slate-800">
                                                    {claim.bank_name}
                                                </p>

                                                <p className="mt-1 text-xs text-slate-500">
                                                    {claim.branch_name}・
                                                    {claim.account_type}
                                                </p>

                                                <p className="mt-1 text-xs text-slate-500">
                                                    {maskAccountNumber(
                                                        claim.account_number
                                                    )}
                                                </p>
                                            </td>

                                            <td className={tableCellClassName}>
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setSelectedClaim(claim)
                                                    }
                                                    className="whitespace-nowrap rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white hover:bg-slate-700"
                                                >
                                                    詳細を見る
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>
            </div>

            {selectedClaim && (
                <ClaimDetailDialog
                    claim={selectedClaim}
                    onClose={() => setSelectedClaim(null)}
                />
            )}
        </main>
    );
}

function SummaryCard({
    label,
    value,
}: {
    label: string;
    value: string;
}) {
    return (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">
                {label}
            </p>

            <p className="mt-2 text-2xl font-bold text-slate-900">
                {value}
            </p>
        </div>
    );
}

function ClaimDetailDialog({
    claim,
    onClose,
}: {
    claim: ExpenseClaim;
    onClose: () => void;
}) {
    const expenseRows = [
        {
            description: claim.expense1_description,
            amount: claim.expense1_amount,
        },
        {
            description: claim.expense2_description,
            amount: claim.expense2_amount,
        },
        {
            description: claim.expense3_description,
            amount: claim.expense3_amount,
        },
        {
            description: claim.expense4_description,
            amount: claim.expense4_amount,
        },
        {
            description: claim.expense5_description,
            amount: claim.expense5_amount,
        },
    ].filter(
        (expense) =>
            Boolean(expense.description) ||
            Number(expense.amount ?? 0) > 0
    );

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={onClose}
        >
            <div
                role="dialog"
                aria-modal="true"
                className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
                    <div>
                        <p className="text-sm text-slate-500">
                            経費精算詳細
                        </p>

                        <h2 className="text-xl font-bold text-slate-900">
                            {claim.name}
                        </h2>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg border border-slate-300 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-100"
                    >
                        閉じる
                    </button>
                </div>

                <div className="space-y-7 p-5 sm:p-7">
                    <div className="flex flex-wrap items-center gap-3">
                        <span
                            className={`inline-flex rounded-full border px-3 py-1 text-sm font-bold ${getStatusClassName(
                                claim.status
                            )}`}
                        >
                            {claim.status}
                        </span>

                        <span className="text-sm text-slate-500">
                            申請日時：
                            {formatDateTime(claim.created_at)}
                        </span>
                    </div>

                    <DetailSection title="申請者情報">
                        <DetailGrid>
                            <DetailItem
                                label="氏名"
                                value={claim.name}
                            />

                            <DetailItem
                                label="電話番号"
                                value={claim.phone}
                            />

                            <DetailItem
                                label="メールアドレス"
                                value={claim.email || "—"}
                            />

                            <DetailItem
                                label="勤務日"
                                value={formatDate(claim.work_date)}
                            />
                        </DetailGrid>
                    </DetailSection>

                    <DetailSection title="経費明細">
                        <div className="overflow-x-auto rounded-xl border border-slate-200">
                            <table className="w-full min-w-[600px]">
                                <thead className="bg-slate-100">
                                    <tr>
                                        <th className="w-16 px-4 py-3 text-center">
                                            No.
                                        </th>

                                        <th className="px-4 py-3 text-left">
                                            内容
                                        </th>

                                        <th className="w-40 px-4 py-3 text-right">
                                            金額
                                        </th>
                                    </tr>
                                </thead>

                                <tbody>
                                    {expenseRows.map((expense, index) => (
                                        <tr
                                            key={index}
                                            className="border-t border-slate-200"
                                        >
                                            <td className="px-4 py-3 text-center">
                                                {index + 1}
                                            </td>

                                            <td className="whitespace-pre-wrap px-4 py-3">
                                                {expense.description || "—"}
                                            </td>

                                            <td className="px-4 py-3 text-right font-semibold">
                                                {formatCurrency(expense.amount)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>

                                <tfoot className="border-t border-slate-300 bg-slate-50">
                                    <tr>
                                        <th
                                            colSpan={2}
                                            className="px-4 py-4 text-right"
                                        >
                                            合計
                                        </th>

                                        <td className="px-4 py-4 text-right text-lg font-bold">
                                            {formatCurrency(
                                                claim.total_amount
                                            )}
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </DetailSection>

                    <DetailSection title="振込先">
                        <DetailGrid>
                            <DetailItem
                                label="銀行名"
                                value={claim.bank_name}
                            />

                            <DetailItem
                                label="支店名"
                                value={claim.branch_name}
                            />

                            <DetailItem
                                label="口座種別"
                                value={claim.account_type}
                            />

                            <DetailItem
                                label="口座番号"
                                value={claim.account_number}
                            />

                            <DetailItem
                                label="口座名義"
                                value={claim.account_holder}
                            />
                        </DetailGrid>
                    </DetailSection>

                    <DetailSection title="レシート">
                        {Array.isArray(claim.receipt_files) &&
                            claim.receipt_files.length > 0 ? (
                            <ul className="space-y-2">
                                {claim.receipt_files.map(
                                    (file, index) => (
                                        <li
                                            key={`${file.path ?? file.name}-${index}`}
                                            className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3"
                                        >
                                            {file.name ??
                                                `レシート${index + 1}`}
                                        </li>
                                    )
                                )}
                            </ul>
                        ) : (
                            <p className="text-sm text-slate-500">
                                添付ファイルはありません。
                            </p>
                        )}
                    </DetailSection>

                    {claim.rejection_reason && (
                        <DetailSection title="却下理由">
                            <div className="rounded-xl border border-red-200 bg-red-50 p-4 whitespace-pre-wrap text-red-800">
                                {claim.rejection_reason}
                            </div>
                        </DetailSection>
                    )}

                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
                        振込完了・却下ボタンは、次の工程で追加します。現在は申請内容の閲覧のみ可能です。
                    </div>
                </div>
            </div>
        </div>
    );
}

function DetailSection({
    title,
    children,
}: {
    title: string;
    children: React.ReactNode;
}) {
    return (
        <section>
            <h3 className="mb-4 border-l-4 border-blue-700 pl-3 text-lg font-bold text-slate-900">
                {title}
            </h3>

            {children}
        </section>
    );
}

function DetailGrid({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <dl className="grid gap-4 rounded-xl border border-slate-200 p-4 sm:grid-cols-2">
            {children}
        </dl>
    );
}

function DetailItem({
    label,
    value,
}: {
    label: string;
    value: string;
}) {
    return (
        <div>
            <dt className="text-xs font-semibold text-slate-500">
                {label}
            </dt>

            <dd className="mt-1 break-words font-medium text-slate-900">
                {value}
            </dd>
        </div>
    );
}

const inputClassName =
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100";

const tableHeaderClassName =
    "whitespace-nowrap px-4 py-3 font-semibold";

const tableCellClassName =
    "px-4 py-4 text-slate-700";