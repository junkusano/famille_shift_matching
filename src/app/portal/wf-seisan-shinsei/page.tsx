"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type RequestType = {
    id: string;
    code: string;
    label: string;
    is_general: boolean;
    is_active: boolean;
};

type WfRequestListItem = {
    id: string;
    status: string;
    title: string;
    created_at: string;
    updated_at: string;
    submitted_at: string | null;
    request_type: { id: string; code: string; label: string } | null;
};

type WfPayload = Record<string, unknown>;

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

const ATTACH_BUCKET = process.env.NEXT_PUBLIC_WF_ATTACH_BUCKET ?? "wf_request_attachment";

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
    const [editBody, setEditBody] = useState("");
    const [editPayloadText, setEditPayloadText] = useState<string>("{}");

    // 承認者（提出時）
    const [candidates, setCandidates] = useState<ApproverCandidate[]>([]);
    const [candidateQuery, setCandidateQuery] = useState("");
    const [selectedApprovers, setSelectedApprovers] = useState<string[]>([]);

    // 添付
    const [attachKind, setAttachKind] = useState("receipt");
    const [attachUploading, setAttachUploading] = useState(false);

    const canEdit = detail?.perms?.canEdit ?? (detail?.request?.status !== "completed");
    const isAdmin = detail?.perms?.isAdmin ?? false;

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

    // 初期ロード：申請タイプ
    useEffect(() => {
        const run = async () => {
            const { data, error } = await supabase.from("wf_request_type").select("*").eq("is_active", true).order("code");
            if (!error) setTypes((data ?? []) as RequestType[]);
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
            setDetailError(e instanceof Error ? e.message : String(e));
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

            setEditTitle(d.request.title ?? "");
            setEditBody(d.request.body ?? "");
            setEditPayloadText(JSON.stringify(d.request.payload ?? {}, null, 2));

            // 既にstepがあればそこから承認者候補を初期化（再提出想定）
            const approverIds = (d.steps ?? [])
                .slice()
                .sort((a, b) => a.step_no - b.step_no)
                .map((s) => s.approver_user_id);
            setSelectedApprovers(approverIds);
        } catch (e: unknown) {
            setDetailError(e instanceof Error ? e.message : String(e));
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
            const msg = e instanceof Error ? e.message : String(e);
            alert(msg);
        }
    };

    // 保存（PATCH）
    const saveDraft = async () => {
        if (!selectedId) return;
        try {
            let payloadObj: Record<string, unknown> = {};
            try {
                payloadObj = JSON.parse(editPayloadText || "{}");
            } catch {
                alert("payload(JSON)の形式が不正です");
                return;
            }

            await apiFetch(`/api/wf-requests/${selectedId}`, {
                method: "PATCH",
                body: JSON.stringify({
                    title: editTitle,
                    body: editBody,
                    payload: payloadObj,
                }),
            });
            await loadList();
            await loadDetail(selectedId);
            alert("保存しました");
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            alert(msg);
        }
    };

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
            const msg = e instanceof Error ? e.message : String(e);
            alert(msg);
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
            const msg = e instanceof Error ? e.message : String(e);
            alert(msg);
        }
    };

    // 添付アップロード（Storageへ → wf_request_attachmentへinsert）
    const onUploadAttachment = async (file: File | null) => {
        if (!file || !selectedId) return;

        setAttachUploading(true);
        try {
            // user_id は DB側で必要なので取得
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

            // Storage path
            const ext = file.name.includes(".") ? file.name.split(".").pop() : "";
            const safeExt = ext ? `.${ext}` : "";
            const path = `wf/${selectedId}/${Date.now()}_${Math.random().toString(16).slice(2)}${safeExt}`;

            // upload
            const up = await supabase.storage.from(ATTACH_BUCKET).upload(path, file, {
                contentType: file.type || undefined,
                upsert: false,
            });
            if (up.error) throw up.error;

            // insert attachment row
            const { error: insErr } = await supabase.from("wf_request_attachment").insert({
                request_id: selectedId,
                file_name: file.name,
                file_path: path,
                mime_type: file.type || null,
                file_size: file.size || null,
                kind: attachKind,
                uploaded_by_user_id: myUserId,
            });

            if (insErr) throw insErr;

            await loadDetail(selectedId);
            alert("添付を追加しました");
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            alert(msg);
        } finally {
            setAttachUploading(false);
        }
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
                                        <div className="text-xs px-2 py-0.5 border rounded">{x.status}</div>
                                        <div className="text-xs text-gray-600">{x.request_type?.label ?? ""}</div>
                                    </div>
                                    <div className="mt-1 font-semibold text-sm">{x.title?.trim() || "(無題)"}</div>
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
                                <div className="flex-1">
                                    <div className="text-xs text-gray-600">
                                        種別：{selectedTypeLabel || detail.request.request_type?.label || ""} / 状態：{detail.request.status}
                                    </div>

                                    <div className="mt-2">
                                        <div className="text-xs text-gray-600 mb-1">件名</div>
                                        <input
                                            className="w-full border rounded px-2 py-1"
                                            value={editTitle}
                                            onChange={(e) => setEditTitle(e.target.value)}
                                            disabled={!canEdit}
                                        />
                                    </div>

                                    <div className="mt-3">
                                        <div className="text-xs text-gray-600 mb-1">本文</div>
                                        <textarea
                                            className="w-full border rounded px-2 py-1"
                                            rows={5}
                                            value={editBody}
                                            onChange={(e) => setEditBody(e.target.value)}
                                            disabled={!canEdit}
                                        />
                                    </div>

                                    <div className="mt-3">
                                        <div className="text-xs text-gray-600 mb-1">payload（JSON）</div>
                                        <textarea
                                            className="w-full border rounded px-2 py-1 font-mono text-xs"
                                            rows={10}
                                            value={editPayloadText}
                                            onChange={(e) => setEditPayloadText(e.target.value)}
                                            disabled={!canEdit}
                                        />
                                        <div className="mt-1 text-xs text-gray-500">
                                            経費なら例：{"{ \"amount\": 1200, \"date\": \"2026-01-23\", \"memo\": \"コインパ\" }"}
                                        </div>
                                    </div>

                                    <div className="mt-4 flex gap-2">
                                        <button className="px-3 py-1 border rounded" onClick={saveDraft} disabled={!canEdit}>
                                            保存
                                        </button>
                                        <button
                                            className="px-3 py-1 border rounded"
                                            onClick={submitRequest}
                                            disabled={detail.request.status === "completed"}
                                            title="承認者を選択して提出"
                                        >
                                            提出
                                        </button>

                                        <div className="ml-auto flex gap-2">
                                            <button
                                                className="px-3 py-1 border rounded"
                                                onClick={() => approveOrReject("approve")}
                                                disabled={!isAdmin && detail.request.status !== "submitted"}
                                                title="承認（承認者のみ）"
                                            >
                                                承認
                                            </button>
                                            <button
                                                className="px-3 py-1 border rounded"
                                                onClick={() => approveOrReject("reject")}
                                                disabled={!isAdmin && detail.request.status !== "submitted"}
                                                title="差戻し（承認者のみ）"
                                            >
                                                差戻し
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* 右上：承認者選択 + 履歴 */}
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

                            {/* 添付 */}
                            <div className="mt-5 border rounded p-3">
                                <div className="flex items-center gap-3">
                                    <div className="font-semibold text-sm">添付（後からレシートOK）</div>
                                    <div className="text-xs text-gray-600">Storage bucket: {ATTACH_BUCKET}</div>
                                    <div className="ml-auto flex items-center gap-2">
                                        <select className="border rounded px-2 py-1 text-sm" value={attachKind} onChange={(e) => setAttachKind(e.target.value)}>
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
                                    {(detail.attachments ?? []).length === 0 && (
                                        <div className="p-2 text-xs text-gray-600">添付なし</div>
                                    )}
                                    {(detail.attachments ?? []).map((a) => (
                                        <div key={a.id} className="p-2 border-b last:border-b-0 text-xs">
                                            <div className="flex items-center gap-2">
                                                <div className="px-2 py-0.5 border rounded">{a.kind}</div>
                                                <div className="font-semibold">{a.file_name}</div>
                                                <div className="ml-auto text-gray-600">{fmt(a.created_at)}</div>
                                            </div>
                                            <div className="mt-1 text-gray-600 font-mono break-all">path: {a.file_path}</div>
                                        </div>
                                    ))}
                                </div>

                                <div className="mt-2 text-xs text-gray-500">
                                    ※ bucket名が違う場合は <span className="font-mono">NEXT_PUBLIC_WF_ATTACH_BUCKET</span> で上書きできます
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
