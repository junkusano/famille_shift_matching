//portal/wf-seisan-shinsei/page.tsx

"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";

type RequestType = {
    id: string;
    code: string;
    label: string;
    is_general: boolean;
    is_active: boolean;
};

type ApplicantLite = {
    user_id: string;
    name: string;      // 表示名（例：山田 太郎）
    org?: string | null;
};

type WfRequestListItem = {
    id: string;
    status: string;
    title: string;
    created_at: string;
    updated_at: string;
    submitted_at: string | null;
    request_type: { id: string; code: string; label: string } | null;
    applicant_user_id: string;        // ★追加
    applicant?: ApplicantLite | null; // ★追加
};

type WfPayload = Record<string, unknown>;

type ClientOption = {
    kaipoke_cs_id: string;
    name: string;
    kana: string | null;
};


type WfRequest = {
    id: string;
    request_type_id: string;
    applicant_user_id: string;
    title: string;
    body: string | null;
    payload: WfPayload;
    status: string;
    submitted_at: string | null;
    approved_at: string | null;
    completed_at: string | null;
    created_at: string;
    updated_at: string;
    request_type?: { id: string; code: string; label: string; is_general: boolean } | null;
    applicant?: ApplicantLite | null; // ★追加（詳細にも出す）
};

type ApprovalStep = {
    id: string;
    request_id: string;
    step_no: number;
    approver_user_id: string;
    status: string;
    action_comment: string | null;
    acted_at: string | null;
    created_at: string;
};

type AttachmentRow = {
    id: string;
    request_id: string;
    file_name: string;
    file_path: string;
    mime_type: string | null;
    file_size: number | null;
    kind: string;
    uploaded_by_user_id: string;
    created_at: string;
};

type DetailResponse = {
    request: WfRequest;
    steps: ApprovalStep[];
    attachments: AttachmentRow[];
    perms?: { isAdmin: boolean; canEdit: boolean };
};

type ApproverCandidate = {
    user_id: string;
    last_name_kanji: string | null;
    first_name_kanji: string | null;
    orgunitname: string | null;
    level_sort: number | null;
};

function fmt(dt: string | null | undefined) {
    if (!dt) return "";
    try {
        const d = new Date(dt);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(
            2,
            "0"
        )} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    } catch {
        return String(dt);
    }
}

function toErrorMessage(e: unknown): string {
    if (e instanceof Error) {
        return e.message;
    }

    if (typeof e === "object" && e !== null) {
        // { message: string }
        if (
            "message" in e &&
            typeof (e as { message?: unknown }).message === "string"
        ) {
            return (e as { message: string }).message;
        }

        // { error: { message: string } }
        if (
            "error" in e &&
            typeof (e as { error?: unknown }).error === "object" &&
            (e as { error: { message?: unknown } }).error !== null &&
            typeof (e as { error: { message?: unknown } }).error.message === "string"
        ) {
            return (e as { error: { message: string } }).error.message;
        }

        // { msg: string }
        if (
            "msg" in e &&
            typeof (e as { msg?: unknown }).msg === "string"
        ) {
            return (e as { msg: string }).msg;
        }

        // 最終手段：オブジェクトの中身を見せる
        try {
            return JSON.stringify(e);
        } catch {
            return "[object error]";
        }
    }

    if (typeof e === "string") {
        return e;
    }

    return "Unknown error";
}

function statusBadgeClass(status: string) {
    switch (status) {
        case "draft":
            return "bg-gray-100 text-gray-800 border-gray-300";
        case "submitted":
            return "bg-blue-100 text-blue-800 border-blue-300";
        case "approved":
            return "bg-green-100 text-green-800 border-green-300";
        case "rejected":
            return "bg-red-100 text-red-800 border-red-300";
        case "completed":
            return "bg-purple-100 text-purple-800 border-purple-300";
        default:
            return "bg-gray-100 text-gray-800 border-gray-300";
    }
}

function statusPanelClass(status: string) {
    switch (status) {
        case "draft":
            return "bg-gray-50";
        case "submitted":
            return "bg-blue-50";
        case "approved":
            return "bg-green-50";
        case "rejected":
            return "bg-red-50";
        case "completed":
            return "bg-purple-50";
        default:
            return "bg-white";
    }
}

async function apiFetch(path: string, init?: RequestInit) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const headers = new Headers(init?.headers ?? {});
    if (token) headers.set("Authorization", `Bearer ${token}`);
    headers.set("Content-Type", "application/json");

    const res = await fetch(path, { ...init, headers });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
        const msg = json?.message ?? `API error: ${res.status}`;
        throw new Error(msg);
    }
    return json;
}

export default function WfSeisanShinseiPage() {
    // コインパーキング申請フォーム用
    const [cpDate, setCpDate] = useState<string>("");
    const [cpAmount, setCpAmount] = useState<string>(""); // 入力は文字列→保存時に数値化
    const [cpMemo, setCpMemo] = useState<string>("");
    const [cpKaipokeCsId, setCpKaipokeCsId] = useState<string>("");
    //const [cpClientName, setCpClientName] = useState<string>("");

    // 利用者候補
    const [clients, setClients] = useState<ClientOption[]>([]);
    //const [clientQuery, setClientQuery] = useState<string>("");

    // 左ペイン
    const [types, setTypes] = useState<RequestType[]>([]);
    const [list, setList] = useState<WfRequestListItem[]>([]);
    const [listLoading, setListLoading] = useState(false);
    const [listError, setListError] = useState<string | null>(null);

    const [filterStatus, setFilterStatus] = useState<string>("");
    const [filterType, setFilterType] = useState<string>("");

    // 右ペイン（詳細）
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [detail, setDetail] = useState<DetailResponse | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailError, setDetailError] = useState<string | null>(null);

    // 編集用
    const [editTitle, setEditTitle] = useState("");
    //const [editBody, setEditBody] = useState("");

    const [titleTouched, setTitleTouched] = useState(false);

    // 承認者（提出時）
    const [candidates, setCandidates] = useState<ApproverCandidate[]>([]);
    const [candidateQuery, setCandidateQuery] = useState("");
    const [selectedApprovers, setSelectedApprovers] = useState<string[]>([]);

    const deleteRequest = async () => {
        if (!selectedId) return;
        if (!window.confirm("この下書きを削除します。よろしいですか？")) return;

        try {
            await apiFetch(`/api/wf-requests/${selectedId}`, { method: "DELETE" });
            setDetail(null);
            setSelectedId(null);

            setEditTitle("");
            setTitleTouched(false);
            setCpDate("");
            setCpAmount("");
            setCpMemo("");
            setCpKaipokeCsId("");
            setSelectedApprovers([]);

            await loadList();

            alert("削除しました");
        } catch (e: unknown) {
            alert(toErrorMessage(e));
        }
    };

    // 添付
    const [attachKind, setAttachKind] = useState("receipt");
    const [attachUploading, setAttachUploading] = useState(false);

    const canEdit = detail?.perms?.canEdit ?? (detail?.request?.status !== "completed");

    const selectedTypeLabel = useMemo(() => {
        const code = detail?.request?.request_type?.code;
        if (!code) return "";
        const t = types.find((x) => x.code === code);
        return t?.label ?? "";
    }, [detail?.request?.request_type?.code, types]);

    const filteredCandidates = useMemo(() => {
        const q = candidateQuery.trim();
        const base = candidates;
        if (!q) return base.slice(0, 50);
        const lower = q.toLowerCase();
        return base
            .filter((c) => {
                const name = `${c.last_name_kanji ?? ""}${c.first_name_kanji ?? ""}`;
                const org = c.orgunitname ?? "";
                return name.toLowerCase().includes(lower) || org.toLowerCase().includes(lower) || c.user_id.includes(q);
            })
            .slice(0, 50);
    }, [candidates, candidateQuery]);

    // ★追加：DocUploader と同じ /api/upload（Google Drive）アップロード
    const uploadFileViaApi = async (file: File) => {
        const form = new FormData();
        form.append("file", file);
        form.append("filename", `${Date.now()}_${file.name}`);

        const res = await fetch("/api/upload", { method: "POST", body: form });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.message ?? `upload failed: ${res.status}`);

        const lower = file.name.toLowerCase();
        const guessed =
            lower.endsWith(".pdf") ? "application/pdf" :
                lower.endsWith(".png") ? "image/png" :
                    (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) ? "image/jpeg" :
                        null;

        const mimeType = (file.type || json.mimeType || guessed || null) as string | null;
        if (!json.url) throw new Error("upload response missing url");
        return { url: json.url, mimeType };
    };


    // 初期ロード：申請タイプ
    useEffect(() => {
        const run = async () => {
            const { data, error } = await supabase.from("wf_request_type").select("*").eq("is_active", true).order("code");
            if (!error) setTypes((data ?? []) as RequestType[]);
        };
        run();
    }, []);

    useEffect(() => {
        const run = async () => {
            const { data, error } = await supabase
                .from("cs_kaipoke_info")
                .select("kaipoke_cs_id, name, kana")
                .eq("is_active", true)
                .order("kana", { ascending: true })
                .limit(5000);

            if (!error) setClients((data ?? []) as ClientOption[]);
        };
        run();
    }, []);


    // 一覧ロード
    const loadList = async () => {
        setListLoading(true);
        setListError(null);
        try {
            const qs = new URLSearchParams();
            if (filterStatus) qs.set("status", filterStatus);
            if (filterType) qs.set("type", filterType);
            const r = await apiFetch(`/api/wf-requests?${qs.toString()}`);
            setList((r.data ?? []) as WfRequestListItem[]);
        } catch (e: unknown) {
            alert(toErrorMessage(e));
        } finally {
            setListLoading(false);
        }
    };

    useEffect(() => {
        loadList();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filterStatus, filterType]);

    // 詳細ロード
    const loadDetail = async (id: string) => {
        setDetailLoading(true);
        setDetailError(null);
        try {
            const r = await apiFetch(`/api/wf-requests/${id}`);
            const d = r.data as DetailResponse;
            setDetail(d);
            setSelectedId(id);
            const rawTitle = (d.request.title ?? "").trim();
            setTitleTouched(!!rawTitle); // ★タイトルが入ってたら自動更新しない
            const baseDefault = d.request.request_type?.code === "expense" ? "コインパーキング申請" : "";
            setEditTitle(rawTitle || baseDefault);

            setCpMemo(d.request.body ?? ""); // ★経緯・理由は body から復元

            // 互換（過去データが payload.memo で入ってた場合だけ救う）
            if (!(d.request.body ?? "").trim()) {
                const p = (d.request.payload ?? {}) as Record<string, unknown>;
                const legacyMemo = String(p["memo"] ?? "").trim();
                if (legacyMemo) setCpMemo(legacyMemo);
            }

            // payload からコインパーキングフォームを復元
            const p = (d.request.payload ?? {}) as Record<string, unknown>;
            const kind = String(p["expense_kind"] ?? "");

            if (kind === "coin_parking") {
                setCpDate(String(p["date"] ?? ""));
                const amt = p["amount"];
                setCpAmount(typeof amt === "number" ? String(amt) : String(amt ?? ""));
                setCpKaipokeCsId(String(p["kaipoke_cs_id"] ?? ""));
                // memo は payload ではなく body（cpMemo）に一本化したのでここでは触らない
            } else {
                setCpDate("");
                setCpAmount("");
                setCpKaipokeCsId("");
                // cpMemo は body を表示するので、ここではクリアしない（別種にしても理由は残してOKなら）
                // クリアしたいなら setCpMemo("") をここに入れる
            }

            // 既にstepがあればそこから承認者候補を初期化（再提出想定）
            const approverIds = (d.steps ?? [])
                .slice()
                .sort((a, b) => a.step_no - b.step_no)
                .map((s) => s.approver_user_id);
            setSelectedApprovers(approverIds);
        } catch (e: unknown) {
            alert(toErrorMessage(e));
        } finally {
            setDetailLoading(false);
        }
    };

    // 承認者候補ロード（level_sort<4500000）
    const loadCandidates = async () => {
        const { data, error } = await supabase
            .from("user_entry_united_view_single")
            .select("user_id,last_name_kanji,first_name_kanji,orgunitname,level_sort")
            .lt("level_sort", 4500000)
            .order("level_sort", { ascending: true })
            .limit(500);

        if (!error) setCandidates((data ?? []) as ApproverCandidate[]);
    };

    useEffect(() => {
        loadCandidates();
    }, []);

    // 新規下書き作成
    const createDraft = async () => {
        const typeCode = filterType || "expense";
        try {
            const r = await apiFetch("/api/wf-requests", {
                method: "POST",
                body: JSON.stringify({
                    request_type_code: typeCode,
                    title: "",
                    body_text: "",
                    payload: {},
                }),
            });
            const created = r.data as WfRequest;
            await loadList();
            await loadDetail(created.id);
        } catch (e: unknown) {
            alert(toErrorMessage(e));
        }
    };

    // 保存（PATCH）
    const saveDraft = async () => {
        if (!selectedId) return;
        try {
            const amountNum =
                cpAmount.trim() === "" ? null : Number(cpAmount.replace(/,/g, ""));

            if (amountNum !== null && Number.isNaN(amountNum)) {
                alert("金額が数値ではありません");
                return;
            }
            if (!cpDate.trim()) {
                alert("利用日を入力してください");
                return;
            }

            // 利用者名は候補から引く（手入力しない）
            const selectedClient = clients.find((c) => c.kaipoke_cs_id === cpKaipokeCsId);
            const clientName = selectedClient?.name ?? "";

            const payload: Record<string, unknown> = {
                template: "expense",
                expense_kind: "coin_parking",
                date: cpDate.trim(),
                amount: amountNum,
                kaipoke_cs_id: cpKaipokeCsId.trim() || null,
                client_name: clientName || null,
            };

            await apiFetch(`/api/wf-requests/${selectedId}`, {
                method: "PATCH",
                body: JSON.stringify({
                    title: editTitle,
                    body: cpMemo.trim(), // ★ここに一本化
                    payload,
                }),
            });

            await loadList();
            await loadDetail(selectedId);
            alert("保存しました");
        } catch (e: unknown) {
            alert(toErrorMessage(e));
        }
    };

    useEffect(() => {
        if (!detail) return;
        if (detail.request.request_type?.code !== "expense") return;
        if (titleTouched) return;

        const selectedClient = clients.find((c) => c.kaipoke_cs_id === cpKaipokeCsId);
        const clientName = selectedClient?.name?.trim();
        const base = "コインパーキング申請";
        setEditTitle(clientName ? `${base}（${clientName}）` : base);
    }, [cpKaipokeCsId, clients, detail, titleTouched]);

    // 提出（submit）
    const submitRequest = async () => {
        if (!selectedId) return;
        if (selectedApprovers.length === 0) {
            alert("承認者を選択してください");
            return;
        }
        try {
            await apiFetch(`/api/wf-requests/${selectedId}/submit`, {
                method: "POST",
                body: JSON.stringify({ approver_user_ids: selectedApprovers }),
            });
            await loadList();
            await loadDetail(selectedId);
            alert("提出しました");
        } catch (e: unknown) {
            alert(toErrorMessage(e));
        }
    };

    // 承認 / 差戻し
    const approveOrReject = async (action: "approve" | "reject") => {
        if (!selectedId) return;
        const comment =
            action === "reject"
                ? window.prompt("差戻し理由（任意）", "") ?? ""
                : window.prompt("コメント（任意）", "") ?? "";

        try {
            await apiFetch(`/api/wf-requests/${selectedId}/approve`, {
                method: "POST",
                body: JSON.stringify({ action, comment }),
            });
            await loadList();
            await loadDetail(selectedId);
            alert(action === "approve" ? "承認しました" : "差戻ししました");
        } catch (e: unknown) {
            alert(toErrorMessage(e));
        }
    };

    // 添付アップロード（Google Driveへ → wf_request_attachmentへinsert）
    const onUploadAttachment = async (file: File | null) => {
        if (!file || !selectedId) return;

        setAttachUploading(true);
        try {
            // user_id は DB側で必要なので取得（ここはそのまま）
            const { data: sess } = await supabase.auth.getSession();
            const authUid = sess.session?.user?.id;
            if (!authUid) throw new Error("ログイン情報が取得できません");

            const { data: u, error: uErr } = await supabase
                .from("users")
                .select("user_id")
                .eq("auth_user_id", authUid)
                .maybeSingle();

            if (uErr) throw uErr;
            const myUserId = u?.user_id;
            if (!myUserId) throw new Error("ユーザーが見つかりません");

            // ★ここが差分：/api/upload（Google Drive）
            const { url, mimeType } = await uploadFileViaApi(file);

            // ★file_path には Drive URL
            const { error: insErr } = await supabase.from("wf_request_attachment").insert({
                request_id: selectedId,
                file_name: file.name,
                file_path: url,
                mime_type: mimeType,
                file_size: file.size || null,
                kind: attachKind,
                uploaded_by_user_id: myUserId,
            });

            if (insErr) throw insErr;

            await loadDetail(selectedId);
            alert("添付を追加しました");
        } catch (e: unknown) {
            alert(toErrorMessage(e));
        } finally {
            setAttachUploading(false);
        }
    };

    const extractFileId = (u?: string | null) => {
        if (!u) return null;
        const m = u.match(/(?:\/d\/|[?&]id=)([-\w]{25,})/);
        return m ? m[1] : null;
    };

    return (
        <div className="min-h-screen bg-white text-black">
            <div className="p-3 border-b flex items-center gap-3">
                <div className="text-lg font-bold">精算・申請</div>
                <button
                    className="px-3 py-1 border rounded"
                    onClick={createDraft}
                    title="新規下書きを作成"
                >
                    ＋ 新規
                </button>

                <div className="ml-auto flex items-center gap-2">
                    <select className="border rounded px-2 py-1" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                        <option value="">種別：すべて</option>
                        {types.map((t) => (
                            <option key={t.id} value={t.code}>
                                {t.label}
                            </option>
                        ))}
                    </select>

                    <select
                        className="border rounded px-2 py-1"
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                    >
                        <option value="">状態：すべて</option>
                        <option value="draft">下書き</option>
                        <option value="submitted">申請中</option>
                        <option value="approved">承認済</option>
                        <option value="rejected">差戻し</option>
                        <option value="completed">完了</option>
                    </select>

                    <button className="px-3 py-1 border rounded" onClick={loadList}>
                        再読込
                    </button>
                </div>
            </div>

            <div className="flex" style={{ height: "calc(100vh - 56px)" }}>
                {/* 左：一覧 */}
                <div className="w-[380px] border-r overflow-auto">
                    {listLoading && <div className="p-3 text-sm">読み込み中…</div>}
                    {listError && <div className="p-3 text-sm text-red-600">{listError}</div>}

                    {!listLoading && list.length === 0 && <div className="p-3 text-sm">該当データなし</div>}

                    <div className="divide-y">
                        {list.map((x) => {
                            const active = x.id === selectedId;
                            return (
                                <div
                                    key={x.id}
                                    className={`p-3 cursor-pointer ${active ? "bg-gray-100" : ""}`}
                                    onClick={() => loadDetail(x.id)}
                                >
                                    <div className="flex items-center gap-2">
                                        <div className={`text-xs px-2 py-0.5 border rounded ${statusBadgeClass(x.status)}`}>
                                            {x.status}
                                        </div>
                                        <div className="text-xs text-gray-600">{x.request_type?.label ?? ""}</div>
                                    </div>
                                    <div className="mt-1 font-semibold text-sm">{x.title?.trim() || "(無題)"}</div>
                                    <div className="mt-1 text-xs text-gray-600">
                                        申請者：{x.applicant?.name ?? x.applicant_user_id}
                                    </div>
                                    <div className="mt-1 text-xs text-gray-600">
                                        作成：{fmt(x.created_at)} / 更新：{fmt(x.updated_at)}
                                    </div>

                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* 右：詳細 */}
                <div className="flex-1 overflow-auto">
                    {!selectedId && <div className="p-6 text-sm text-gray-600">左から申請を選択するか「＋ 新規」を押してください。</div>}

                    {selectedId && detailLoading && <div className="p-6 text-sm">読み込み中…</div>}
                    {selectedId && detailError && <div className="p-6 text-sm text-red-600">{detailError}</div>}

                    {selectedId && detail && (
                        <div className="p-4 max-w-[1100px]">
                            <div className="flex items-start gap-3">
                                {/* 左：フォーム */}
                                <div className={`flex-1 rounded p-3 ${statusPanelClass(detail.request.status)}`}>
                                    <div className="text-xs text-gray-600">
                                        種別：{selectedTypeLabel || detail.request.request_type?.label || ""} / 状態：{detail.request.status}
                                    </div>
                                    <div className="text-xs text-gray-600 mt-1">
                                        申請者：{detail.request.applicant?.name ?? detail.request.applicant_user_id}
                                        {detail.request.applicant?.org ? `（${detail.request.applicant.org}）` : ""}
                                    </div>
                                    <div className="mt-2">
                                        <div className="text-xs text-gray-600 mb-1">件名</div>
                                        <input
                                            className="w-full border rounded px-2 py-1"
                                            value={editTitle}
                                            onChange={(e) => {
                                                setTitleTouched(true);
                                                setEditTitle(e.target.value);
                                            }}
                                            disabled={!canEdit}
                                        />
                                    </div>

                                    <div className="mt-3">
                                        {detail.request.request_type?.code === "expense" && (
                                            <div className="mt-3 border rounded p-3">
                                                <div className="font-semibold text-sm">コインパーキング申請</div>

                                                <div className="mt-3 grid grid-cols-2 gap-3">
                                                    <div>
                                                        <div className="text-xs text-gray-600 mb-1">利用日</div>
                                                        <input
                                                            type="date"
                                                            className="w-full border rounded px-2 py-1"
                                                            value={cpDate}
                                                            onChange={(e) => setCpDate(e.target.value)}
                                                            disabled={!canEdit}
                                                        />
                                                    </div>

                                                    <div>
                                                        <div className="text-xs text-gray-600 mb-1">金額（円）</div>
                                                        <input
                                                            type="text"
                                                            inputMode="numeric"
                                                            className="w-full border rounded px-2 py-1"
                                                            placeholder="例：1200"
                                                            value={cpAmount}
                                                            onChange={(e) => setCpAmount(e.target.value)}
                                                            disabled={!canEdit}
                                                        />
                                                        <div className="mt-1 text-xs text-gray-500">※あとから修正できます</div>
                                                    </div>
                                                </div>

                                                <div className="mt-3">
                                                    <div className="text-xs text-gray-600 mb-1">利用者（任意）</div>
                                                    <select
                                                        className="w-full border rounded px-2 py-1 text-sm"
                                                        value={cpKaipokeCsId}
                                                        onChange={(e) => setCpKaipokeCsId(e.target.value)}
                                                        disabled={!canEdit}
                                                    >
                                                        <option value="">（未選択）</option>
                                                        {clients.map((c) => (
                                                            <option key={c.kaipoke_cs_id} value={c.kaipoke_cs_id}>
                                                                {(c.kana ?? "")} {c.name}（{c.kaipoke_cs_id}）
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>

                                                <div className="mt-3">
                                                    <div className="text-xs text-gray-600 mb-1">経緯・理由</div>
                                                    <textarea
                                                        className="w-full border rounded px-2 py-1"
                                                        rows={3}
                                                        value={cpMemo}
                                                        onChange={(e) => setCpMemo(e.target.value)}
                                                        disabled={!canEdit}
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    <div className="mt-4 flex flex-wrap gap-2">
                                        <Button onClick={saveDraft} disabled={!canEdit}>下書き保存</Button>
                                        <Button onClick={submitRequest} disabled={detail.request.status === "completed"}>提出</Button>
                                        <Button variant="outline" onClick={() => approveOrReject("approve")}>承認</Button>
                                        <Button variant="destructive" onClick={() => approveOrReject("reject")}>差戻し</Button>
                                        <Button
                                            variant="destructive"
                                            onClick={deleteRequest}
                                            disabled={!detail || detail.request.status !== "draft"}
                                        >
                                            削除
                                        </Button>
                                    </div>

                                    {/* 添付：左の下に置く（見た目も自然） */}
                                    <div className="mt-5 border rounded p-3">
                                        <div className="flex items-center gap-3">
                                            <div className="font-semibold text-sm">添付（後からレシートOK）</div>
                                            <div className="text-xs text-gray-600">Google Drive にアップロードします</div>
                                            <div className="ml-auto flex items-center gap-2">
                                                <select
                                                    className="border rounded px-2 py-1 text-sm"
                                                    value={attachKind}
                                                    onChange={(e) => setAttachKind(e.target.value)}
                                                >
                                                    <option value="receipt">レシート</option>
                                                    <option value="doc">書類</option>
                                                    <option value="other">その他</option>
                                                </select>

                                                <label className="px-3 py-1 border rounded text-sm cursor-pointer">
                                                    {attachUploading ? "アップロード中…" : "ファイル追加"}
                                                    <input
                                                        type="file"
                                                        className="hidden"
                                                        disabled={attachUploading || !canEdit}
                                                        onChange={(e) => onUploadAttachment(e.target.files?.[0] ?? null)}
                                                    />
                                                </label>
                                            </div>
                                        </div>

                                        <div className="mt-3 border rounded">
                                            {(detail.attachments ?? []).map((a) => {
                                                const fileId = extractFileId(a.file_path);
                                                const openUrl = fileId
                                                    ? `https://drive.google.com/file/d/${fileId}/view`
                                                    : a.file_path;

                                                return (
                                                    <div key={a.id} className="p-2 border-b last:border-b-0 text-xs">
                                                        ...
                                                        <div className="mt-1">
                                                            <a className="text-blue-600 underline" href={openUrl} target="_blank" rel="noreferrer">
                                                                添付を開く
                                                            </a>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>

                                {/* 右：承認者 */}
                                <div className="w-[360px] border rounded p-3">
                                    <div className="font-semibold text-sm">承認者（提出用）</div>
                                    <div className="text-xs text-gray-600 mt-1">level_sort &lt; 4500000 の候補から選択</div>

                                    <div className="mt-2">
                                        <input
                                            className="w-full border rounded px-2 py-1 text-sm"
                                            placeholder="氏名/所属/IDで検索"
                                            value={candidateQuery}
                                            onChange={(e) => setCandidateQuery(e.target.value)}
                                        />
                                    </div>

                                    <div className="mt-2 flex gap-2">
                                        <select
                                            className="flex-1 border rounded px-2 py-1 text-sm"
                                            size={6}
                                            onDoubleClick={(e) => {
                                                const v = (e.target as HTMLSelectElement).value;
                                                if (!v) return;
                                                if (!selectedApprovers.includes(v)) setSelectedApprovers([...selectedApprovers, v]);
                                            }}
                                        >
                                            {filteredCandidates.map((c) => {
                                                const name = `${c.last_name_kanji ?? ""}${c.first_name_kanji ?? ""}`.trim() || c.user_id;
                                                const org = c.orgunitname ?? "";
                                                return (
                                                    <option key={c.user_id} value={c.user_id}>
                                                        {name}（{org}）
                                                    </option>
                                                );
                                            })}
                                        </select>

                                        <div className="flex flex-col gap-2">
                                            <button
                                                className="px-2 py-1 border rounded text-sm"
                                                onClick={() => setSelectedApprovers([])}
                                                title="選択クリア"
                                            >
                                                クリア
                                            </button>
                                        </div>
                                    </div>

                                    <div className="mt-2">
                                        <div className="text-xs text-gray-600 mb-1">選択中（順番が承認順）</div>
                                        <div className="border rounded p-2 text-sm min-h-[72px]">
                                            {selectedApprovers.length === 0 && <div className="text-gray-500 text-xs">未選択</div>}
                                            {selectedApprovers.map((uid, idx) => (
                                                <div key={uid} className="flex items-center gap-2">
                                                    <div className="text-xs w-6">{idx + 1}.</div>
                                                    <div className="flex-1 font-mono text-xs">{uid}</div>
                                                    <button
                                                        className="px-2 py-0.5 border rounded text-xs"
                                                        onClick={() => setSelectedApprovers(selectedApprovers.filter((x) => x !== uid))}
                                                    >
                                                        削除
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="mt-1 text-xs text-gray-500">候補一覧からダブルクリックで追加</div>
                                    </div>

                                    <div className="mt-4 font-semibold text-sm">承認履歴</div>
                                    <div className="mt-2 border rounded">
                                        {(detail.steps ?? []).length === 0 && <div className="p-2 text-xs text-gray-600">なし</div>}
                                        {(detail.steps ?? [])
                                            .slice()
                                            .sort((a, b) => a.step_no - b.step_no)
                                            .map((s) => (
                                                <div key={s.id} className="p-2 border-b last:border-b-0 text-xs">
                                                    <div className="flex items-center gap-2">
                                                        <div className="px-2 py-0.5 border rounded">#{s.step_no}</div>
                                                        <div className="font-mono">{s.approver_user_id}</div>
                                                        <div className="ml-auto">{s.status}</div>
                                                    </div>
                                                    {s.acted_at && <div className="mt-1 text-gray-600">日時：{fmt(s.acted_at)}</div>}
                                                    {s.action_comment && <div className="mt-1">コメント：{s.action_comment}</div>}
                                                </div>
                                            ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div >
    );
}
