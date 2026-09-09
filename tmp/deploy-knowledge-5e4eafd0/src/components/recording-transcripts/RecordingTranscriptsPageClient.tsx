"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  type RecordingTranscriptDetail,
  type RecordingTranscriptFilters,
  type RecordingTranscriptListRow,
  type RecordingTranscriptParticipant,
  type RecordingTranscriptPortal,
  type RecordingTranscriptsPageData,
} from "@/lib/recording-transcripts";

type Props = {
  basePath: string;
  data: RecordingTranscriptsPageData | null;
  filters: RecordingTranscriptFilters;
  page: number;
  perPage: number;
  portal: RecordingTranscriptPortal;
};

const STATUS_LABELS: Record<string, string> = {
  not_requested: "未処理",
  processing: "文字起こし中",
  completed: "完了",
  failed: "失敗",
};

const STATUS_CLASSES: Record<string, string> = {
  not_requested: "bg-slate-100 text-slate-700",
  processing: "bg-amber-100 text-amber-800",
  completed: "bg-emerald-100 text-emerald-800",
  failed: "bg-red-100 text-red-800",
};

function formatDateTime(value: string | null): string {
  if (!value) return "－";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "－";
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function formatDuration(value: number): string {
  const totalSeconds = Math.max(0, Math.floor(Number(value) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}時間${minutes}分${seconds}秒`;
  if (minutes > 0) return `${minutes}分${seconds}秒`;
  return `${seconds}秒`;
}

function formatFileSize(value: number): string {
  const bytes = Math.max(0, Number(value));
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes.toLocaleString()} B`;
}

function participants(value: unknown): RecordingTranscriptParticipant[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is RecordingTranscriptParticipant =>
          typeof item === "object" && item !== null,
      )
    : [];
}

function participantLabel(item: RecordingTranscriptParticipant, index: number): string {
  if (typeof item.label === "string" && item.label.trim()) return item.label;
  if (typeof item.staffUserId === "string" && item.staffUserId.trim()) return item.staffUserId;
  return `参加者${index + 1}`;
}

function ParticipantsSummary({ value }: { value: unknown }) {
  const items = participants(value);
  if (items.length === 0) return <span className="text-slate-400">－</span>;
  return (
    <span title={items.map(participantLabel).join("、")}>
      {items.slice(0, 2).map(participantLabel).join("、")}
      {items.length > 2 ? ` ほか${items.length - 2}名` : ""}
    </span>
  );
}

function SecretBadge() {
  return (
    <span className="inline-flex whitespace-nowrap rounded-full bg-fuchsia-100 px-2 py-1 text-xs font-semibold text-fuchsia-800">
      シークレット
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-2 py-1 text-xs font-semibold ${
        STATUS_CLASSES[status] ?? "bg-slate-100 text-slate-700"
      }`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function buildPageHref(
  basePath: string,
  filters: RecordingTranscriptFilters,
  page: number,
  perPage: number,
): string {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("perPage", String(perPage));
  const entries: Array<[string, string | null | undefined]> = [
    ["date_from", filters.dateFrom],
    ["date_to", filters.dateTo],
    ["recorder_user_id", filters.recorderUserId],
    ["client_name", filters.clientName],
    ["client_id", filters.clientId],
    ["context_name", filters.contextName],
    ["status", filters.status],
    ["keyword", filters.keyword],
  ];
  for (const [key, value] of entries) if (value) params.set(key, value);
  return `${basePath}?${params.toString()}`;
}

type EditPayload = {
  clientId: string | null;
  clientName: string | null;
  contextId: string | null;
  contextName: string | null;
  participants: RecordingTranscriptParticipant[];
  transcriptRaw: string | null;
};

type EditDraft = {
  clientId: string;
  clientName: string;
  contextId: string;
  contextName: string;
  participants: RecordingTranscriptParticipant[];
  transcriptRaw: string;
};

const EMPTY_EDIT_DRAFT: EditDraft = {
  clientId: "",
  clientName: "",
  contextId: "",
  contextName: "",
  participants: [],
  transcriptRaw: "",
};

function DetailModal({
  actionError,
  deleting,
  detail,
  error,
  loading,
  onClose,
  onDelete,
  onSave,
  saving,
}: {
  actionError: string | null;
  deleting: boolean;
  detail: RecordingTranscriptDetail | null;
  error: string | null;
  loading: boolean;
  onClose: () => void;
  onDelete: () => Promise<void>;
  onSave: (input: EditPayload) => Promise<boolean>;
  saving: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<EditDraft>(EMPTY_EDIT_DRAFT);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving && !deleting) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleting, onClose, saving]);

  useEffect(() => {
    if (!detail) return;
    setDraft({
      clientId: detail.client_id ?? "",
      clientName: detail.client_name ?? "",
      contextId: detail.context_id ?? "",
      contextName: detail.context_name ?? "",
      participants: participants(detail.participants).map((item) => ({ ...item })),
      transcriptRaw: detail.transcript_raw ?? "",
    });
  }, [detail]);

  const participantItems = participants(detail?.participants);
  const busy = saving || deleting;

  const save = async () => {
    if (!detail) return;
    const nextParticipants = draft.participants
      .map((item) => ({ ...item, label: typeof item.label === "string" ? item.label.trim() : "" }))
      .filter((item) => item.label);
    const saved = await onSave({
      clientId: draft.clientId.trim() || null,
      clientName: draft.clientName.trim() || null,
      contextId: draft.contextId.trim() || null,
      contextName: draft.contextName.trim() || null,
      participants: nextParticipants,
      transcriptRaw: draft.transcriptRaw.trim() || null,
    });
    if (saved) setEditing(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        aria-label="文字起こし詳細"
        aria-modal="true"
        className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
        role="dialog"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">famille Voice 文字起こし詳細</h2>
            {detail && <p className="mt-1 text-xs text-slate-500">{formatDateTime(detail.recorded_at)}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {detail && !loading && !editing && (
              <button
                className="rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-50"
                disabled={busy}
                onClick={() => setEditing(true)}
                type="button"
              >
                編集
              </button>
            )}
            {detail && !loading && (
              <button
                className="rounded-md border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                disabled={busy}
                onClick={() => void onDelete()}
                type="button"
              >
                {deleting ? "削除中..." : "削除"}
              </button>
            )}
            <button
              aria-label="詳細を閉じる"
              className="rounded-md border px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
              disabled={busy}
              onClick={onClose}
              type="button"
            >
              閉じる
            </button>
          </div>
        </div>

        <div className="overflow-y-auto p-5">
          {loading && <p className="py-16 text-center text-slate-500">詳細を読み込んでいます...</p>}
          {error && <p className="rounded-lg bg-red-50 p-4 text-red-700">{error}</p>}
          {actionError && <p className="mb-4 rounded-lg bg-red-50 p-4 text-red-700">{actionError}</p>}
          {detail && !loading && (
            <div className="space-y-5">
              <dl className="grid gap-3 rounded-lg border bg-slate-50 p-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
                <div><dt className="text-xs text-slate-500">録音日時</dt><dd className="mt-1 font-medium">{formatDateTime(detail.recorded_at)}</dd></div>
                <div><dt className="text-xs text-slate-500">録音者</dt><dd className="mt-1 font-medium">{detail.recorder_name}</dd><dd className="break-all text-xs text-slate-500">{detail.recorder_email ?? "－"}</dd></div>
                <div><dt className="text-xs text-slate-500">録音時間</dt><dd className="mt-1 font-medium">{formatDuration(detail.duration_millis)}</dd></div>
                <div><dt className="text-xs text-slate-500">ファイル名</dt><dd className="mt-1 break-all font-medium">{detail.file_name}</dd></div>
                <div><dt className="text-xs text-slate-500">ファイルサイズ</dt><dd className="mt-1 font-medium">{formatFileSize(detail.file_size_bytes)}</dd></div>
                <div><dt className="text-xs text-slate-500">文字起こし状態</dt><dd className="mt-1"><StatusBadge status={detail.transcript_status} /></dd></div>
                {detail.is_secret && <div><dt className="text-xs text-slate-500">公開範囲</dt><dd className="mt-1"><SecretBadge /></dd></div>}
              </dl>

              {editing ? (
                <div className="space-y-4 rounded-lg border border-sky-200 bg-sky-50/40 p-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-sm"><span className="mb-1 block text-xs font-medium text-slate-600">利用者名</span><input className="w-full rounded-md border bg-white px-3 py-2" maxLength={200} onChange={(event) => setDraft((value) => ({ ...value, clientName: event.target.value }))} value={draft.clientName} /></label>
                    <label className="text-sm"><span className="mb-1 block text-xs font-medium text-slate-600">利用者ID</span><input className="w-full rounded-md border bg-white px-3 py-2" maxLength={200} onChange={(event) => setDraft((value) => ({ ...value, clientId: event.target.value }))} value={draft.clientId} /></label>
                    <label className="text-sm"><span className="mb-1 block text-xs font-medium text-slate-600">コンテキスト名</span><input className="w-full rounded-md border bg-white px-3 py-2" maxLength={300} onChange={(event) => setDraft((value) => ({ ...value, contextName: event.target.value }))} value={draft.contextName} /></label>
                    <label className="text-sm"><span className="mb-1 block text-xs font-medium text-slate-600">コンテキストID</span><input className="w-full rounded-md border bg-white px-3 py-2" maxLength={200} onChange={(event) => setDraft((value) => ({ ...value, contextId: event.target.value }))} value={draft.contextId} /></label>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-medium text-slate-600">参加者（最大20名）</span>
                      <button
                        className="rounded-md border bg-white px-3 py-1.5 text-xs hover:bg-slate-50 disabled:opacity-50"
                        disabled={draft.participants.length >= 20}
                        onClick={() =>
                          setDraft((value) => ({
                            ...value,
                            participants: [
                              ...value.participants,
                              { id: "manual-" + Date.now(), kind: "other", label: "", staffUserId: null },
                            ],
                          }))
                        }
                        type="button"
                      >
                        参加者を追加
                      </button>
                    </div>
                    {draft.participants.length === 0 && <p className="rounded-md border border-dashed bg-white p-3 text-xs text-slate-500">参加者は登録されていません。</p>}
                    {draft.participants.map((item, index) => (
                      <div className="flex items-center gap-2" key={item.id ?? "participant-" + index}>
                        <input
                          className="min-w-0 flex-1 rounded-md border bg-white px-3 py-2 text-sm"
                          maxLength={200}
                          onChange={(event) =>
                            setDraft((value) => ({
                              ...value,
                              participants: value.participants.map((participant, participantIndex) =>
                                participantIndex === index
                                  ? { ...participant, label: event.target.value }
                                  : participant,
                              ),
                            }))
                          }
                          placeholder="参加者名"
                          value={typeof item.label === "string" ? item.label : ""}
                        />
                        <span className="w-14 text-center text-xs text-slate-500">{item.kind === "staff" ? "職員" : "その他"}</span>
                        <button
                          className="rounded-md border border-red-200 bg-white px-3 py-2 text-xs text-red-700 hover:bg-red-50"
                          onClick={() =>
                            setDraft((value) => ({
                              ...value,
                              participants: value.participants.filter((_, participantIndex) => participantIndex !== index),
                            }))
                          }
                          type="button"
                        >
                          削除
                        </button>
                      </div>
                    ))}
                  </div>
                  <label className="block text-sm">
                    <span className="mb-1 block text-xs font-medium text-slate-600">文字起こし本文</span>
                    <textarea className="min-h-[38vh] w-full whitespace-pre-wrap rounded-md border bg-white px-3 py-3 font-sans leading-7" maxLength={2000000} onChange={(event) => setDraft((value) => ({ ...value, transcriptRaw: event.target.value }))} value={draft.transcriptRaw} />
                  </label>
                  {detail.transcript_status === "processing" && (
                    <p className="rounded-md bg-amber-50 p-3 text-xs text-amber-800">文字起こし処理中のため、処理完了時に本文が更新される可能性があります。</p>
                  )}
                  <div className="flex flex-wrap justify-end gap-2">
                    <button className="rounded-md border bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-50" disabled={busy} onClick={() => setEditing(false)} type="button">キャンセル</button>
                    <button className="rounded-md bg-sky-700 px-5 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-50" disabled={busy} onClick={() => void save()} type="button">{saving ? "保存中..." : "保存"}</button>
                  </div>
                </div>
              ) : (
                <>
                  <dl className="grid gap-3 rounded-lg border bg-white p-4 text-sm sm:grid-cols-2">
                    <div><dt className="text-xs text-slate-500">利用者</dt><dd className="mt-1 font-medium">{detail.client_name ?? "－"}</dd><dd className="text-xs text-slate-500">ID: {detail.client_id ?? "－"}</dd></div>
                    <div><dt className="text-xs text-slate-500">コンテキスト</dt><dd className="mt-1 font-medium">{detail.context_name ?? "－"}</dd><dd className="text-xs text-slate-500">ID: {detail.context_id ?? "－"}</dd></div>
                    <div className="sm:col-span-2">
                      <dt className="text-xs text-slate-500">参加者</dt>
                      <dd className="mt-2 flex flex-wrap gap-2">
                        {participantItems.length === 0 && <span>－</span>}
                        {participantItems.map((item, index) => (
                          <span className="rounded-full bg-white px-3 py-1 text-xs ring-1 ring-slate-200" key={item.id ?? participantLabel(item, index) + "-" + index}>
                            {participantLabel(item, index)}
                            {item.kind === "staff" ? "（職員）" : item.kind === "other" ? "（その他）" : ""}
                          </span>
                        ))}
                      </dd>
                    </div>
                  </dl>
                  <section>
                    <h3 className="mb-2 font-bold text-slate-900">文字起こし本文</h3>
                    <div className="max-h-[52vh] overflow-y-auto whitespace-pre-wrap break-words rounded-lg border bg-white p-4 text-sm leading-7 text-slate-800">
                      {detail.transcript_raw?.trim() || "文字起こし本文はまだありません。"}
                    </div>
                  </section>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function RecordingTranscriptsPageClient({ basePath, data, filters, page, perPage, portal }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<RecordingTranscriptDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [loadedData, setLoadedData] = useState<RecordingTranscriptsPageData | null>(data);
  const [listLoading, setListLoading] = useState(data === null);
  const [listError, setListError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (data) {
      setLoadedData(data);
      setListError(null);
      setListLoading(false);
      return;
    }

    let active = true;
    const load = async () => {
      setListLoading(true);
      setListError(null);
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) {
          window.location.assign("/login");
          return;
        }

        const url = new URL("/api/recording-transcripts", window.location.origin);
        url.searchParams.set("portal", portal);
        url.searchParams.set("page", String(page));
        url.searchParams.set("perPage", String(perPage));
        const filterEntries: Array<[string, string | null | undefined]> = [
          ["date_from", filters.dateFrom],
          ["date_to", filters.dateTo],
          ["recorder_user_id", filters.recorderUserId],
          ["client_name", filters.clientName],
          ["client_id", filters.clientId],
          ["context_name", filters.contextName],
          ["status", filters.status],
          ["keyword", filters.keyword],
        ];
        for (const [key, value] of filterEntries) if (value) url.searchParams.set(key, value);

        const response = await fetch(url, {
          cache: "no-store",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (response.status === 401) {
          window.location.assign("/login");
          return;
        }
        if (response.status === 403) {
          window.location.assign("/unauthorized");
          return;
        }
        const payload = (await response.json().catch(() => null)) as
          | { ok: true; data: RecordingTranscriptsPageData }
          | { ok: false; error: string }
          | null;
        if (!response.ok || !payload || payload.ok !== true) {
          throw new Error(payload && "error" in payload ? payload.error : "一覧を取得できませんでした");
        }
        if (active) setLoadedData(payload.data);
      } catch (error) {
        if (active) setListError(error instanceof Error ? error.message : "一覧を取得できませんでした");
      } finally {
        if (active) setListLoading(false);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [
    data,
    filters.clientId,
    filters.clientName,
    filters.contextName,
    filters.dateFrom,
    filters.dateTo,
    filters.keyword,
    filters.recorderUserId,
    filters.status,
    page,
    perPage,
    portal,
  ]);

  const viewData: RecordingTranscriptsPageData = loadedData ?? {
    rows: [],
    recorderOptions: [],
    totalCount: 0,
    page,
    perPage,
  };

  const totalPages = Math.max(1, Math.ceil(viewData.totalCount / viewData.perPage));
  const rangeStart = viewData.totalCount === 0 ? 0 : (viewData.page - 1) * viewData.perPage + 1;
  const rangeEnd = Math.min(viewData.page * viewData.perPage, viewData.totalCount);
  const pageLabel = `全 ${viewData.totalCount.toLocaleString()} 件中 ${rangeStart.toLocaleString()}-${rangeEnd.toLocaleString()} 件`;
  const title = portal === "caremanager" ? "famille Voice 文字起こし管理" : "famille Voice 文字起こし";

  const recorderOptions = useMemo(
    () =>
      viewData.recorderOptions.map((option) => ({
        ...option,
        display: option.email ? `${option.label}（${option.email}）` : option.label,
      })),
    [viewData.recorderOptions],
  );

  const openDetail = async (row: RecordingTranscriptListRow) => {
    setSelectedId(row.id);
    setDetail(null);
    setDetailError(null);
    setActionError(null);
    setDetailLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        window.location.assign("/login");
        return;
      }
      const response = await fetch(
        `/api/recording-transcripts/${encodeURIComponent(row.id)}?portal=${portal}`,
        {
          cache: "no-store",
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (response.status === 401) {
        window.location.assign("/login");
        return;
      }
      if (response.status === 403) {
        window.location.assign("/unauthorized");
        return;
      }
      const payload = (await response.json().catch(() => null)) as
        | { ok: true; detail: RecordingTranscriptDetail }
        | { ok: false; error: string }
        | null;
      if (!response.ok || !payload || payload.ok !== true) {
        throw new Error(payload && "error" in payload ? payload.error : "詳細を取得できませんでした");
      }
      setDetail(payload.detail);
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : "詳細を取得できませんでした");
    } finally {
      setDetailLoading(false);
    }
  };

  const saveDetail = async (input: EditPayload): Promise<boolean> => {
    if (!selectedId) return false;
    setSaving(true);
    setActionError(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        window.location.assign("/login");
        return false;
      }
      const response = await fetch(
        "/api/recording-transcripts/" + encodeURIComponent(selectedId) + "/edit?portal=" + portal,
        {
          method: "PATCH",
          cache: "no-store",
          headers: {
            Authorization: "Bearer " + token,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(input),
        },
      );
      if (response.status === 401) {
        window.location.assign("/login");
        return false;
      }
      if (response.status === 403) {
        window.location.assign("/unauthorized");
        return false;
      }
      const payload = (await response.json().catch(() => null)) as
        | { ok: true; detail: RecordingTranscriptDetail }
        | { ok: false; error: string }
        | null;
      if (!response.ok || !payload || payload.ok !== true) {
        throw new Error(payload && "error" in payload ? payload.error : "保存できませんでした");
      }
      setDetail(payload.detail);
      setLoadedData((current) =>
        current
          ? {
              ...current,
              rows: current.rows.map((row) =>
                row.id === payload.detail.id
                  ? {
                      ...row,
                      client_id: payload.detail.client_id,
                      client_name: payload.detail.client_name,
                      context_id: payload.detail.context_id,
                      context_name: payload.detail.context_name,
                      participants: payload.detail.participants,
                    }
                  : row,
              ),
            }
          : current,
      );
      return true;
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "保存できませんでした");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const deleteDetail = async (): Promise<void> => {
    if (!selectedId) return;
    if (!window.confirm("この文字起こしデータを削除しますか？\nこの操作は元に戻せません。")) return;

    setDeleting(true);
    setActionError(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        window.location.assign("/login");
        return;
      }
      const response = await fetch(
        "/api/recording-transcripts/" + encodeURIComponent(selectedId) + "/delete?portal=" + portal,
        {
          method: "DELETE",
          cache: "no-store",
          headers: { Authorization: "Bearer " + token },
        },
      );
      if (response.status === 401) {
        window.location.assign("/login");
        return;
      }
      if (response.status === 403) {
        window.location.assign("/unauthorized");
        return;
      }
      const payload = (await response.json().catch(() => null)) as
        | { ok: true }
        | { ok: false; error: string }
        | null;
      if (!response.ok || !payload || payload.ok !== true) {
        throw new Error(payload && "error" in payload ? payload.error : "削除できませんでした");
      }
      setLoadedData((current) =>
        current
          ? {
              ...current,
              rows: current.rows.filter((row) => row.id !== selectedId),
              totalCount: Math.max(0, current.totalCount - 1),
            }
          : current,
      );
      setSelectedId(null);
      setDetail(null);
      setDetailError(null);
      setActionError(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "削除できませんでした");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4 p-1 sm:p-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">{title}</h1>
        <p className="mt-1 text-sm text-slate-600">所属サービスの職員が録音した文字起こしを確認できます。</p>
      </div>

      {listError && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{listError}</p>}
      {listLoading && !loadedData && <p className="rounded-lg border bg-white p-6 text-center text-sm text-slate-500">文字起こし一覧を読み込んでいます...</p>}

      <form action={basePath} className="space-y-3 rounded-xl border bg-white p-4 shadow-sm" method="get">
        <input name="page" type="hidden" value="1" />
        <input name="perPage" type="hidden" value={viewData.perPage} />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="text-sm"><span className="mb-1 block text-xs font-medium text-slate-600">フリーワード</span><input className="w-full rounded-md border px-3 py-2" defaultValue={filters.keyword ?? ""} name="keyword" placeholder="利用者・コンテキスト・本文など" /></label>
          <label className="text-sm"><span className="mb-1 block text-xs font-medium text-slate-600">録音者</span><select className="w-full rounded-md border bg-white px-3 py-2" defaultValue={filters.recorderUserId ?? ""} name="recorder_user_id"><option value="">すべて</option>{recorderOptions.map((option) => <option key={option.value} value={option.value}>{option.display}</option>)}</select></label>
          <label className="text-sm"><span className="mb-1 block text-xs font-medium text-slate-600">利用者名</span><input className="w-full rounded-md border px-3 py-2" defaultValue={filters.clientName ?? ""} name="client_name" /></label>
          <label className="text-sm"><span className="mb-1 block text-xs font-medium text-slate-600">利用者ID</span><input className="w-full rounded-md border px-3 py-2" defaultValue={filters.clientId ?? ""} name="client_id" /></label>
          <label className="text-sm"><span className="mb-1 block text-xs font-medium text-slate-600">コンテキスト名</span><input className="w-full rounded-md border px-3 py-2" defaultValue={filters.contextName ?? ""} name="context_name" /></label>
          <label className="text-sm"><span className="mb-1 block text-xs font-medium text-slate-600">文字起こし状態</span><select className="w-full rounded-md border bg-white px-3 py-2" defaultValue={filters.status ?? ""} name="status"><option value="">すべて</option>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="text-sm"><span className="mb-1 block text-xs font-medium text-slate-600">録音日（開始）</span><input className="w-full rounded-md border px-3 py-2" defaultValue={filters.dateFrom ?? ""} name="date_from" type="date" /></label>
          <label className="text-sm"><span className="mb-1 block text-xs font-medium text-slate-600">録音日（終了）</span><input className="w-full rounded-md border px-3 py-2" defaultValue={filters.dateTo ?? ""} name="date_to" type="date" /></label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800" type="submit">検索</button>
          <Link className="rounded-md border px-4 py-2 text-sm hover:bg-slate-50" href={basePath}>条件をクリア</Link>
        </div>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <span className="text-slate-600">{pageLabel} / {viewData.page}ページ（全{totalPages}ページ）</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">表示件数</span>
          {[20, 50, 100].map((size) => <Link className={`rounded border px-2 py-1 text-xs ${viewData.perPage === size ? "bg-slate-800 text-white" : "bg-white hover:bg-slate-50"}`} href={buildPageHref(basePath, filters, 1, size)} key={size}>{size}</Link>)}
          <Link aria-disabled={viewData.page <= 1} className={`rounded border px-3 py-1.5 ${viewData.page <= 1 ? "pointer-events-none opacity-40" : "bg-white hover:bg-slate-50"}`} href={buildPageHref(basePath, filters, viewData.page - 1, viewData.perPage)}>前へ</Link>
          <Link aria-disabled={viewData.page >= totalPages} className={`rounded border px-3 py-1.5 ${viewData.page >= totalPages ? "pointer-events-none opacity-40" : "bg-white hover:bg-slate-50"}`} href={buildPageHref(basePath, filters, viewData.page + 1, viewData.perPage)}>次へ</Link>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
        <table className="min-w-[1830px] w-full text-left text-xs">
          <thead className="bg-slate-100 text-slate-700"><tr><th className="px-3 py-3">録音日時</th><th className="px-3 py-3">録音者</th><th className="px-3 py-3">メール</th><th className="px-3 py-3">公開範囲</th><th className="px-3 py-3">利用者</th><th className="px-3 py-3">利用者ID</th><th className="px-3 py-3">コンテキスト</th><th className="px-3 py-3">録音時間</th><th className="px-3 py-3">ファイル名</th><th className="px-3 py-3">サイズ</th><th className="px-3 py-3">状態</th><th className="px-3 py-3">参加者</th><th className="px-3 py-3">完了日時</th><th className="px-3 py-3">作成日時</th><th className="px-3 py-3">操作</th></tr></thead>
          <tbody className="divide-y">
            {viewData.rows.map((row) => (
              <tr className="cursor-pointer hover:bg-sky-50" key={row.id} onClick={() => openDetail(row)}>
                <td className="whitespace-nowrap px-3 py-3 font-medium">{formatDateTime(row.recorded_at)}</td><td className="whitespace-nowrap px-3 py-3">{row.recorder_name}</td><td className="max-w-64 break-all px-3 py-3">{row.recorder_email ?? "－"}</td><td className="px-3 py-3">{row.is_secret ? <SecretBadge /> : "通常"}</td><td className="px-3 py-3">{row.client_name ?? "－"}</td><td className="px-3 py-3">{row.client_id ?? "－"}</td><td className="px-3 py-3">{row.context_name ?? "－"}</td><td className="whitespace-nowrap px-3 py-3">{formatDuration(row.duration_millis)}</td><td className="max-w-64 break-all px-3 py-3">{row.file_name}</td><td className="whitespace-nowrap px-3 py-3">{formatFileSize(row.file_size_bytes)}</td><td className="px-3 py-3"><StatusBadge status={row.transcript_status} /></td><td className="max-w-64 px-3 py-3"><ParticipantsSummary value={row.participants} /></td><td className="whitespace-nowrap px-3 py-3">{formatDateTime(row.transcribed_at)}</td><td className="whitespace-nowrap px-3 py-3">{formatDateTime(row.created_at)}</td><td className="px-3 py-3"><button className="rounded border bg-white px-3 py-1.5 font-medium text-sky-700 hover:bg-sky-50" onClick={(event) => { event.stopPropagation(); openDetail(row); }} type="button">確認・編集</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!listLoading && viewData.rows.length === 0 && <div className="p-12 text-center text-sm text-slate-500">条件に一致する文字起こしはありません。</div>}
      </div>

      {selectedId && (
        <DetailModal
          actionError={actionError}
          deleting={deleting}
          detail={detail}
          error={detailError}
          loading={detailLoading}
          onClose={() => {
            setSelectedId(null);
            setDetail(null);
            setDetailError(null);
            setActionError(null);
          }}
          onDelete={deleteDetail}
          onSave={saveDetail}
          saving={saving}
        />
      )}
    </div>
  );
}
