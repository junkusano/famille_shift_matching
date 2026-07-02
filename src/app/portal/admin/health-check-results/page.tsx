"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type StaffRow = {
    user_id: string;
    auth_user_id: string | null;
    last_name_kanji: string | null;
    first_name_kanji: string | null;
    system_role: string | null;
    status: string | null;
    orgunitname: string | null;
};

type HealthRequest = {
    id: string;
    applicant_user_id: string;
    title: string | null;
    status: string;
    submitted_at: string | null;
    created_at: string;
    payload: Record<string, unknown> | null;
    health_check_doctor_comment: string | null;
};

type HealthAttachment = {
    id: string;
    request_id: string;
    file_name: string;
    file_path: string;
    mime_type: string | null;
    file_size: number | null;
    kind: string;
    created_at: string;
};

type DisplayRow = {
    user_id: string;
    staff_name: string;
    submitted: boolean;
    request: HealthRequest | null;
    attachments: HealthAttachment[];
};

function getFiscalYear() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    return month >= 4 ? year : year - 1;
}

function fiscalStartEnd(fiscalYear: number) {
    return {
        startDate: `${fiscalYear}-04-01`,
        endDate: `${fiscalYear + 1}-03-31`,
    };
}

function extractFileId(u?: string | null) {
    if (!u) return null;
    const m = u.match(/(?:\/d\/|[?&]id=)([-\w]{25,})/);
    return m ? m[1] : null;
}

function formatDate(value?: string | null) {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    return `${d.getFullYear()}年${String(d.getMonth() + 1).padStart(2, "0")}月${String(
        d.getDate()
    ).padStart(2, "0")}日`;
}

function getRequestFiscalYear(req: HealthRequest) {
    const rawDate =
        typeof req.payload?.health_check_date === "string"
            ? req.payload.health_check_date
            : req.submitted_at ?? req.created_at;

    const d = new Date(rawDate);
    if (Number.isNaN(d.getTime())) return getFiscalYear();

    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    return month >= 4 ? year : year - 1;
}

export default function AdminHealthCheckResultsPage() {
    const [rows, setRows] = useState<DisplayRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [savingRequestId, setSavingRequestId] = useState<string | null>(null);
    const [comments, setComments] = useState<Record<string, string>>({});
    const [error, setError] = useState<string | null>(null);

    const fiscalYear = useMemo(() => getFiscalYear(), []);
    const { startDate, endDate } = useMemo(
        () => fiscalStartEnd(fiscalYear),
        [fiscalYear]
    );

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            setError(null);

            try {
                const { data: sessionData, error: sessionError } =
                    await supabase.auth.getSession();

                if (sessionError) throw sessionError;

                const authUserId = sessionData.session?.user?.id;
                if (!authUserId) {
                    setError("ログイン情報を取得できませんでした。");
                    setRows([]);
                    return;
                }

                const { data: loginRows, error: loginError } = await supabase
                    .from("user_entry_united_view_single")
                    .select("user_id, auth_user_id, system_role")
                    .eq("auth_user_id", authUserId)
                    .limit(1);

                if (loginError) throw loginError;

                const loginUser = loginRows?.[0];

                if (loginUser?.system_role !== "admin") {
                    setError("このページは管理者のみ閲覧できます。");
                    setRows([]);
                    return;
                }

                const { data: typeRow, error: typeError } = await supabase
                    .from("wf_request_type")
                    .select("id")
                    .eq("code", "health_check")
                    .single();

                if (typeError) throw typeError;

                const { data: shiftRows, error: shiftError } = await supabase
                    .from("shift")
                    .select("staff_01_user_id, staff_02_user_id, staff_03_user_id")
                    .gte("shift_start_date", startDate)
                    .lte("shift_start_date", endDate);

                if (shiftError) throw shiftError;

                const workedUserIds = new Set<string>();

                for (const shift of shiftRows ?? []) {
                    if (shift.staff_01_user_id) workedUserIds.add(shift.staff_01_user_id);
                    if (shift.staff_02_user_id) workedUserIds.add(shift.staff_02_user_id);
                    if (shift.staff_03_user_id) workedUserIds.add(shift.staff_03_user_id);
                }

                const { data: staffRows, error: staffError } = await supabase
                    .from("user_entry_united_view_single")
                    .select(
                        "user_id, auth_user_id, last_name_kanji, first_name_kanji, system_role, status, orgunitname"
                    )
                    .neq("status", "removed_from_lineworks_kaipoke");

                if (staffError) throw staffError;

                const targetStaff = ((staffRows ?? []) as StaffRow[])
                    .filter((u) => u.user_id && workedUserIds.has(u.user_id))
                    .sort((a, b) => {
                        const an = `${a.last_name_kanji ?? ""}${a.first_name_kanji ?? ""}`;
                        const bn = `${b.last_name_kanji ?? ""}${b.first_name_kanji ?? ""}`;
                        return an.localeCompare(bn, "ja");
                    });

                const { data: requestRows, error: requestError } = await supabase
                    .from("wf_request")
                    .select(
                        "id, applicant_user_id, title, status, submitted_at, created_at, payload, health_check_doctor_comment"
                    )
                    .eq("request_type_id", typeRow.id)
                    .in("status", ["submitted", "approved", "completed"])
                    .order("submitted_at", { ascending: false });

                if (requestError) throw requestError;

                const currentYearRequests = ((requestRows ?? []) as HealthRequest[])
                    .filter((req) => getRequestFiscalYear(req) === fiscalYear);

                const latestRequestByUser = new Map<string, HealthRequest>();

                for (const req of currentYearRequests) {
                    const current = latestRequestByUser.get(req.applicant_user_id);
                    const reqTime = new Date(req.submitted_at ?? req.created_at).getTime();
                    const currentTime = current
                        ? new Date(current.submitted_at ?? current.created_at).getTime()
                        : 0;

                    if (!current || reqTime > currentTime) {
                        latestRequestByUser.set(req.applicant_user_id, req);
                    }
                }

                const latestRequestIds = Array.from(latestRequestByUser.values()).map(
                    (req) => req.id
                );

                let attachmentRows: HealthAttachment[] = [];

                if (latestRequestIds.length > 0) {
                    const { data: fetchedAttachments, error: attachmentError } =
                        await supabase
                            .from("wf_request_attachment")
                            .select(
                                "id, request_id, file_name, file_path, mime_type, file_size, kind, created_at"
                            )
                            .in("request_id", latestRequestIds)
                            .eq("kind", "health_result")
                            .order("created_at", { ascending: false });

                    if (attachmentError) throw attachmentError;

                    attachmentRows = (fetchedAttachments ?? []) as HealthAttachment[];
                }

                const attachmentsByRequest = new Map<string, HealthAttachment[]>();

                for (const attachment of attachmentRows) {
                    const list = attachmentsByRequest.get(attachment.request_id) ?? [];
                    list.push(attachment);
                    attachmentsByRequest.set(attachment.request_id, list);
                }

                const nextComments: Record<string, string> = {};

                const displayRows: DisplayRow[] = targetStaff.map((staff) => {
                    const request = latestRequestByUser.get(staff.user_id) ?? null;
                    const staffName =
                        `${staff.last_name_kanji ?? ""}${staff.first_name_kanji ?? ""}`.trim() ||
                        staff.user_id;

                    if (request) {
                        nextComments[request.id] =
                            request.health_check_doctor_comment ?? "";
                    }

                    return {
                        user_id: staff.user_id,
                        staff_name: staffName,
                        submitted: Boolean(request),
                        request,
                        attachments: request
                            ? attachmentsByRequest.get(request.id) ?? []
                            : [],
                    };
                });

                setComments(nextComments);
                setRows(displayRows);
            } catch (e) {
                console.error(e);
                setError(e instanceof Error ? e.message : "読み込みに失敗しました。");
            } finally {
                setLoading(false);
            }
        };

        load();
    }, [fiscalYear, startDate, endDate]);

    const submittedCount = rows.filter((r) => r.submitted).length;
    const notSubmittedCount = rows.length - submittedCount;

    const saveComment = async (requestId: string) => {
        setSavingRequestId(requestId);

        try {
            const { error: updateError } = await supabase
                .from("wf_request")
                .update({
                    health_check_doctor_comment: comments[requestId] ?? "",
                    updated_at: new Date().toISOString(),
                })
                .eq("id", requestId);

            if (updateError) throw updateError;

            alert("産業医コメントを保存しました。");
        } catch (e) {
            console.error(e);
            alert(e instanceof Error ? e.message : "保存に失敗しました。");
        } finally {
            setSavingRequestId(null);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 text-black">
            <div className="border-b bg-white px-4 py-3">
                <h1 className="text-lg font-bold">健康診断結果 管理</h1>
                <p className="mt-1 text-sm text-gray-600">
                    {fiscalYear}年度（{startDate} ～ {endDate}）の健康診断提出状況と結果を確認します。
                </p>
            </div>

            <main className="mx-auto max-w-7xl p-4">
                {loading && (
                    <div className="rounded border bg-white p-4 text-sm text-gray-600">
                        読み込み中です…
                    </div>
                )}

                {!loading && error && (
                    <div className="rounded border border-red-300 bg-red-50 p-4 text-sm text-red-700">
                        {error}
                    </div>
                )}

                {!loading && !error && (
                    <>
                        <div className="mb-4 grid gap-3 md:grid-cols-3">
                            <div className="rounded border bg-white p-4">
                                <div className="text-xs text-gray-500">対象職員</div>
                                <div className="mt-1 text-2xl font-bold">{rows.length}人</div>
                            </div>
                            <div className="rounded border bg-white p-4">
                                <div className="text-xs text-gray-500">提出済み</div>
                                <div className="mt-1 text-2xl font-bold text-green-700">
                                    {submittedCount}人
                                </div>
                            </div>
                            <div className="rounded border bg-white p-4">
                                <div className="text-xs text-gray-500">未提出</div>
                                <div className="mt-1 text-2xl font-bold text-red-700">
                                    {notSubmittedCount}人
                                </div>
                            </div>
                        </div>

                        <div className="overflow-hidden rounded border bg-white">
                            <div className="grid grid-cols-12 border-b bg-gray-100 px-3 py-2 text-xs font-bold text-gray-700">
                                <div className="col-span-2">氏名</div>
                                <div className="col-span-2">user_id</div>
                                <div className="col-span-1">状況</div>
                                <div className="col-span-7">健診結果・産業医コメント</div>
                            </div>

                            {rows.length === 0 && (
                                <div className="p-4 text-sm text-gray-600">
                                    今年度シフトに入っている職員がいません。
                                </div>
                            )}

                            {rows.map((row) => (
                                <div
                                    key={row.user_id}
                                    className="grid grid-cols-12 gap-3 border-b px-3 py-4 last:border-b-0"
                                >
                                    <div className="col-span-2">
                                        <div className="font-semibold">{row.staff_name}</div>
                                    </div>

                                    <div className="col-span-2 break-all text-sm text-gray-700">
                                        {row.user_id}
                                    </div>

                                    <div className="col-span-1">
                                        {row.submitted ? (
                                            <span className="rounded bg-green-100 px-2 py-1 text-xs font-bold text-green-700">
                                                提出済み
                                            </span>
                                        ) : (
                                            <span className="rounded bg-red-100 px-2 py-1 text-xs font-bold text-red-700">
                                                未提出
                                            </span>
                                        )}
                                    </div>

                                    <div className="col-span-7">
                                        {!row.request && (
                                            <div className="text-sm text-gray-500">
                                                健診結果は未提出です。
                                            </div>
                                        )}

                                        {row.request && (
                                            <div className="space-y-4">
                                                <div className="rounded border bg-gray-50 p-3 text-sm">
                                                    <div>
                                                        提出日：
                                                        {formatDate(
                                                            row.request.submitted_at ??
                                                            row.request.created_at
                                                        )}
                                                    </div>
                                                    <div>申請ID：{row.request.id}</div>
                                                    <div>ステータス：{row.request.status}</div>
                                                </div>

                                                {row.attachments.length === 0 && (
                                                    <div className="rounded border bg-yellow-50 p-3 text-sm text-yellow-700">
                                                        健診結果ファイルがありません。
                                                    </div>
                                                )}

                                                {row.attachments.map((attachment) => {
                                                    const fileId = extractFileId(attachment.file_path);

                                                    const imageUrl = fileId
                                                        ? `https://drive.google.com/thumbnail?id=${fileId}&sz=w1600`
                                                        : attachment.file_path;

                                                    const pdfUrl = fileId
                                                        ? `https://drive.google.com/file/d/${fileId}/preview`
                                                        : attachment.file_path;

                                                    const isImage =
                                                        attachment.mime_type?.startsWith("image/") ||
                                                        /\.(png|jpe?g|webp|gif)$/i.test(
                                                            attachment.file_name
                                                        );

                                                    const isPdf =
                                                        attachment.mime_type === "application/pdf" ||
                                                        /\.pdf$/i.test(attachment.file_name);

                                                    return (
                                                        <div
                                                            key={attachment.id}
                                                            className="rounded border bg-gray-50 p-3"
                                                        >
                                                            <div className="mb-2 text-sm font-semibold">
                                                                {attachment.file_name}
                                                            </div>

                                                            {isImage ? (
                                                                <div className="rounded border bg-white p-2">
                                                                    <img
                                                                        src={imageUrl}
                                                                        alt={attachment.file_name}
                                                                        className="max-h-[520px] w-full object-contain"
                                                                    />
                                                                </div>
                                                            ) : isPdf ? (
                                                                <div className="rounded border bg-white p-2">
                                                                    <iframe
                                                                        src={pdfUrl}
                                                                        title={attachment.file_name}
                                                                        className="h-[520px] w-full rounded border"
                                                                    />
                                                                </div>
                                                            ) : (
                                                                <div className="rounded border bg-white p-3 text-sm text-gray-600">
                                                                    このファイル形式はプレビュー表示できません。
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}

                                                <div className="rounded border bg-white p-3">
                                                    <label className="mb-2 block text-sm font-bold">
                                                        産業医コメント
                                                    </label>

                                                    <textarea
                                                        className="min-h-[120px] w-full rounded border p-2 text-sm"
                                                        value={comments[row.request.id] ?? ""}
                                                        onChange={(e) =>
                                                            setComments((prev) => ({
                                                                ...prev,
                                                                [row.request!.id]: e.target.value,
                                                            }))
                                                        }
                                                        placeholder="産業医コメントを入力してください。"
                                                    />

                                                    <div className="mt-2 flex justify-end">
                                                        <button
                                                            type="button"
                                                            className="rounded bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                                                            disabled={savingRequestId === row.request.id}
                                                            onClick={() => saveComment(row.request!.id)}
                                                        >
                                                            {savingRequestId === row.request.id
                                                                ? "保存中..."
                                                                : "保存"}
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </main>
        </div>
    );
}