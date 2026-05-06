//components/assessment/AssessmentScreen.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type {
    AssessmentRecord,
    AssessmentServiceKind,
    AssessmentCheck,
} from "@/types/assessment";
import { getDefaultAssessmentContent } from "@/lib/assessment/template";
import { supabase } from "@/lib/supabaseClient";
import PlanEditor, { type PlanDetailForEditor } from "@/components/assessment/PlanEditor";

type Props = { initialAssessmentId: string | null };

type ClientOption = { client_id: string; client_name: string };

type PlanSummary = {
    plan_id: string;
    assessment_id: string;
    client_info_id: string | null;
    kaipoke_cs_id: string;
    plan_document_kind: string;
    title: string;
    version_no: number;
    status: string;
    issued_on: string | null;
    plan_start_date: string | null;
    plan_end_date: string | null;
    author_user_id: string | null;
    author_name: string | null;
    person_family_hope: string | null;
    assistance_goal: string | null;
    remarks: string | null;
    weekly_plan_comment: string | null;
    monthly_summary: unknown;
    pdf_file_url: string | null;
    pdf_generated_at: string | null;
    digisign_status: string | null;
    digisign_sent_at: string | null;
    digisign_completed_at: string | null;
    lineworks_sent_at: string | null;
    is_deleted: boolean;
    created_at: string;
    updated_at: string;
};

type PlanDetail = PlanDetailForEditor;

async function getBearer() {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? `Bearer ${token}` : "";
}

function normalizeServiceKind(v: string | null): AssessmentServiceKind {
    if (v === "障害" || v === "移動支援" || v === "要支援" || v === "要介護") return v;
    return "障害";
}

export default function AssessmentScreen({ initialAssessmentId }: Props) {
    const router = useRouter();
    const sp = useSearchParams();

    const clientIdQ = sp.get("client_id") ?? "";
    const serviceKindQ = normalizeServiceKind(sp.get("service_kind"));

    const [clientId, setClientId] = useState(clientIdQ);
    const [serviceKind, setServiceKind] = useState<AssessmentServiceKind>(serviceKindQ);

    const [clients, setClients] = useState<ClientOption[]>([]);
    const [clientSearch, setClientSearch] = useState("");

    const [list, setList] = useState<AssessmentRecord[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(initialAssessmentId);

    const [detail, setDetail] = useState<AssessmentRecord | null>(null);
    const [saving, setSaving] = useState(false);
    const [generating, setGenerating] = useState(false);

    const [planGenerating, setPlanGenerating] = useState(false);

    const [plans, setPlans] = useState<PlanSummary[]>([]);
    const [plansLoading, setPlansLoading] = useState(false);
    const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
    const [planDetail, setPlanDetail] = useState<PlanDetail | null>(null);
    const [planDetailLoading, setPlanDetailLoading] = useState(false);

    const selectedFromList = useMemo(
        () => list.find((r) => r.assessment_id === selectedId) ?? null,
        [list, selectedId]
    );

    function syncQuery(nextClientId: string, nextServiceKind: AssessmentServiceKind, nextId?: string | null) {
        const q = new URLSearchParams();
        if (nextClientId) q.set("client_id", nextClientId);
        if (nextServiceKind) q.set("service_kind", nextServiceKind);
        const qs = q.toString();

        if (nextId) router.push(`/portal/assessment/${nextId}?${qs}`);
        else router.push(`/portal/assessment?${qs}`);
    }

    // client list
    useEffect(() => {
        (async () => {
            const bearer = await getBearer();
            const res = await fetch(`/api/assessment/clients?q=${encodeURIComponent(clientSearch)}`, {
                headers: bearer ? { Authorization: bearer } : {},
            });
            const j = await res.json();
            if (j?.ok) setClients(j.data ?? []);
        })();
    }, [clientSearch]);

    // list fetch
    useEffect(() => {
        (async () => {
            if (!clientId) {
                setList([]);
                setDetail(null);
                return;
            }
            const bearer = await getBearer();
            const url = `/api/assessment?client_info_id=${encodeURIComponent(clientId)}&service_kind=${encodeURIComponent(
                serviceKind
            )}`;
            const res = await fetch(url, { headers: bearer ? { Authorization: bearer } : {} });
            const j = await res.json();
            if (j?.ok) setList(j.data ?? []);
        })();
    }, [clientId, serviceKind]);

    // detail fetch
    useEffect(() => {
        (async () => {
            if (!selectedId) {
                setDetail(null);
                return;
            }
            const bearer = await getBearer();
            const res = await fetch(`/api/assessment/${selectedId}`, {
                headers: bearer ? { Authorization: bearer } : {},
            });
            const j = await res.json();
            if (j?.ok) setDetail(j.data);
        })();
    }, [selectedId]);

    useEffect(() => {
        if (!detail?.assessment_id) {
            setPlans([]);
            setSelectedPlanId(null);
            setPlanDetail(null);
            return;
        }

        fetchPlans(detail.assessment_id);
    }, [detail?.assessment_id]);

    // URL→state同期
    useEffect(() => {
        setClientId(clientIdQ);
        setServiceKind(serviceKindQ);
    }, [clientIdQ, serviceKindQ]);

    async function createNew() {
        if (!clientId) return;
        const bearer = await getBearer();
        const res = await fetch(`/api/assessment`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(bearer ? { Authorization: bearer } : {}),
            },
            body: JSON.stringify({
                client_id: clientId,
                service_kind: serviceKind,
                content: getDefaultAssessmentContent(serviceKind),
            }),
        });
        const j = await res.json();
        if (j?.ok && j?.data) {
            const rec: AssessmentRecord = j.data;
            setList((prev) => [rec, ...prev]);
            setSelectedId(rec.assessment_id);
            syncQuery(clientId, serviceKind, rec.assessment_id);
        }
    }

    async function autoGenerate() {
        if (!clientId) return;

        setGenerating(true);
        try {
            const bearer = await getBearer();

            // 既存アセスメントを開いている場合は、従来どおり「その1件」を再生成する。
            // by-client API は「利用者単位で未作成の種類を作る」ため、既存1件の再生成には使わない。
            if (detail?.assessment_id) {
                const res = await fetch(`/api/assessment/${detail.assessment_id}/auto-generate`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        ...(bearer ? { Authorization: bearer } : {}),
                    },
                    body: JSON.stringify({
                        service_kind: serviceKind,
                    }),
                });

                const j = await res.json();
                if (!j?.ok) {
                    console.log("assessment [id] auto-generate error body:", j);
                    window.alert(`自動生成に失敗: ${j?.error ?? "unknown error"}`);
                    return;
                }

                if (j?.data) {
                    setDetail(j.data);
                    setList((prev) => prev.map((r) => (r.assessment_id === j.data.assessment_id ? j.data : r)));
                }

                window.alert("アセスメント自動生成完了（現在開いている1件を更新しました）");
                return;
            }

            // 詳細を開いていない場合は、利用者単位で週間シフトを判定し、必要な種類を作成する。
            // service_kind は「現在画面で選択中の種別を最低限作るためのフォールバック」。
            // API側では、週間シフトで検出できた種別 + この service_kind を対象にする。
            const res = await fetch(`/api/assessment/by-client/${encodeURIComponent(clientId)}/auto-generate`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...(bearer ? { Authorization: bearer } : {}),
                },
                body: JSON.stringify({
                    service_kind: serviceKind,
                    overwrite: false,
                }),
            });

            const j = await res.json();

            if (!j?.ok) {
                console.log("by-client auto-generate error body:", j);
                window.alert(`自動生成に失敗: ${j?.error ?? "unknown error"}`);
                return;
            }

            const created = Array.isArray(j.created) ? j.created : [];
            const updated = Array.isArray(j.updated) ? j.updated : [];
            const skipped = Array.isArray(j.skipped) ? j.skipped : [];
            const detectedKinds = Array.isArray(j.detected_kinds) ? j.detected_kinds : [];
            const targetKinds = Array.isArray(j.target_kinds) ? j.target_kinds : [];
            const affected = created[0] ?? updated[0] ?? skipped[0] ?? null;

            if (!affected) {
                window.alert(
                    [
                        `生成対象のアセスメントはありませんでした。`,
                        `判定: ${detectedKinds.join(" / ") || "なし"}`,
                        `対象: ${targetKinds.join(" / ") || "なし"}`,
                    ].join("\n")
                );
                return;
            }

            const nextKind = normalizeServiceKind(String(affected.service_kind ?? serviceKind));
            const nextId = String(affected.assessment_id ?? "") || null;

            setServiceKind(nextKind);
            syncQuery(clientId, nextKind, nextId);

            const listRes = await fetch(
                `/api/assessment?client_info_id=${encodeURIComponent(clientId)}&service_kind=${encodeURIComponent(nextKind)}`,
                { headers: bearer ? { Authorization: bearer } : {} }
            );
            const listJson = await listRes.json();
            if (listJson?.ok) setList(listJson.data ?? []);

            if (nextId) {
                setSelectedId(nextId);

                const found = [...created, ...updated].find((r) => r?.assessment_id === nextId);
                if (found) {
                    setDetail(found as AssessmentRecord);
                } else {
                    const detailRes = await fetch(`/api/assessment/${nextId}`, {
                        headers: bearer ? { Authorization: bearer } : {},
                    });
                    const detailJson = await detailRes.json();
                    if (detailJson?.ok) setDetail(detailJson.data);
                }
            }

            window.alert(
                [
                    `アセスメント自動生成完了`,
                    `判定: ${detectedKinds.join(" / ") || "なし"}`,
                    `対象: ${targetKinds.join(" / ") || "なし"}`,
                    `新規作成: ${created.length}件`,
                    `更新: ${updated.length}件`,
                    `既存ありスキップ: ${skipped.length}件`,
                    skipped.length ? `※既存を作り直す場合は、対象のアセスメントを開いてから再度「アセスメント自動生成」を押してください。` : "",
                ]
                    .filter(Boolean)
                    .join("\n")
            );
        } finally {
            setGenerating(false);
        }
    }


    async function save() {
        if (!detail) return;
        setSaving(true);
        try {
            const bearer = await getBearer();
            const res = await fetch(`/api/assessment/${detail.assessment_id}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    ...(bearer ? { Authorization: bearer } : {}),
                },
                body: JSON.stringify({
                    assessed_on: detail.assessed_on,
                    author_name: detail.author_name,
                    content: detail.content,
                    meeting_minutes: detail.meeting_minutes ?? "",
                }),
            });
            const j = await res.json();
            if (j?.ok) {
                setDetail(j.data);
                setList((prev) => prev.map((r) => (r.assessment_id === j.data.assessment_id ? j.data : r)));
            }
        } finally {
            setSaving(false);
        }
    }

    async function del() {
        if (!detail) return;
        const ok = window.confirm("このアセスメントを削除しますか？");
        if (!ok) return;

        const bearer = await getBearer();
        const res = await fetch(`/api/assessment/${detail.assessment_id}`, {
            method: "DELETE",
            headers: bearer ? { Authorization: bearer } : {},
        });
        const j = await res.json();
        if (j?.ok) {
            setList((prev) => prev.filter((r) => r.assessment_id !== detail.assessment_id));
            setDetail(null);
            setSelectedId(null);
            syncQuery(clientId, serviceKind, null);
        }
    }

    async function generatePlans() {
        if (!detail?.assessment_id) return;

        setPlanGenerating(true);
        try {
            const bearer = await getBearer();

            // 1) まず最新内容を保存
            const saveRes = await fetch(`/api/assessment/${detail.assessment_id}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    ...(bearer ? { Authorization: bearer } : {}),
                },
                body: JSON.stringify({
                    assessed_on: detail.assessed_on,
                    author_name: detail.author_name,
                    content: detail.content,
                    meeting_minutes: detail.meeting_minutes ?? "",
                }),
            });

            const saveJson = await saveRes.json();

            if (!saveJson?.ok || !saveJson?.data?.assessment_id) {
                window.alert(`保存に失敗したため、プラン生成を中止しました: ${saveJson?.error ?? "unknown error"}`);
                return;
            }

            setDetail(saveJson.data);
            setList((prev) =>
                prev.map((r) => (r.assessment_id === saveJson.data.assessment_id ? saveJson.data : r))
            );

            const latestAssessmentId = saveJson.data.assessment_id as string;

            // 2) プラン生成
            const res = await fetch(`/api/plans/generate`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...(bearer ? { Authorization: bearer } : {}),
                },
                body: JSON.stringify({
                    assessment_id: latestAssessmentId,
                    replace_existing: false,
                }),
            });

            const j = await res.json();

            if (!j?.ok) {
                window.alert(`プラン生成に失敗: ${j?.error ?? "unknown error"}`);
                return;
            }

            // 3) 生成後に一覧を再取得して、画面に反映
            await fetchPlans(latestAssessmentId);

            const msg = [
                `プラン生成完了: ${j?.plans?.length ?? 0}件`,
                ...(Array.isArray(j?.plans)
                    ? j.plans.map((p: { title?: string; skipped?: boolean }) =>
                        `- ${p.title ?? "無題"}${p.skipped ? "（既存あり）" : ""}`
                    )
                    : []),
                ...(Array.isArray(j?.warnings) && j.warnings.length
                    ? ["", "警告:", ...j.warnings.map((w: string) => `- ${w}`)]
                    : []),
            ].join("\n");

            window.alert(msg);
        } finally {
            setPlanGenerating(false);
        }
    }

    async function fetchPlans(assessmentId: string) {
        setPlansLoading(true);
        try {
            const bearer = await getBearer();
            const res = await fetch(`/api/plans?assessment_id=${encodeURIComponent(assessmentId)}`, {
                headers: bearer ? { Authorization: bearer } : {},
            });

            const j = await res.json();

            if (!j?.ok) {
                console.log("fetchPlans error:", j);
                setPlans([]);
                return;
            }

            setPlans(j.data ?? []);
        } finally {
            setPlansLoading(false);
        }
    }

    async function fetchPlanDetail(planId: string) {
        setSelectedPlanId(planId);
        setPlanDetailLoading(true);
        try {
            const bearer = await getBearer();
            const res = await fetch(`/api/plans/${planId}`, {
                headers: bearer ? { Authorization: bearer } : {},
            });

            const j = await res.json();

            if (!j?.ok) {
                window.alert(`プラン詳細の取得に失敗: ${j?.error ?? "unknown error"}`);
                setPlanDetail(null);
                return;
            }

            setPlanDetail(j.data);
        } finally {
            setPlanDetailLoading(false);
        }
    }

    function setCheck(sheetKey: string, rowKey: string, check: AssessmentCheck) {
        if (!detail) return;
        setDetail({
            ...detail,
            content: {
                ...detail.content,
                sheets: detail.content.sheets.map((s) =>
                    s.key !== sheetKey
                        ? s
                        : { ...s, rows: s.rows.map((r) => (r.key !== rowKey ? r : { ...r, check })) }
                ),
            },
        });
    }

    function setText(sheetKey: string, rowKey: string, field: "remark" | "hope", value: string) {
        if (!detail) return;
        setDetail({
            ...detail,
            content: {
                ...detail.content,
                sheets: detail.content.sheets.map((s) =>
                    s.key !== sheetKey
                        ? s
                        : { ...s, rows: s.rows.map((r) => (r.key !== rowKey ? r : { ...r, [field]: value })) }
                ),
            },
        });
    }

    function setRowValue(sheetKey: string, rowKey: string, value: string) {
        if (!detail) return;
        setDetail({
            ...detail,
            content: {
                ...detail.content,
                sheets: detail.content.sheets.map((s) =>
                    s.key !== sheetKey
                        ? s
                        : { ...s, rows: s.rows.map((r) => (r.key !== rowKey ? r : { ...r, value })) }
                ),
            },
        });
    }


    function setPrintTarget(sheetKey: string, v: boolean) {
        if (!detail) return;
        setDetail({
            ...detail,
            content: {
                ...detail.content,
                sheets: detail.content.sheets.map((s) => (s.key !== sheetKey ? s : { ...s, printTarget: v })),
            },
        });
    }

    return (
        <div className="p-4 space-y-3">
            <div className="flex flex-wrap gap-3 items-end">
                <div>
                    <div className="text-sm mb-1">利用者検索</div>
                    <input
                        className="border rounded px-2 py-1 w-64"
                        value={clientSearch}
                        onChange={(e) => setClientSearch(e.target.value)}
                        placeholder="名前で絞り込み"
                    />
                </div>

                <div>
                    <div className="text-sm mb-1">利用者（URLクエリ連動）</div>
                    <select
                        className="border rounded px-2 py-1 w-64"
                        value={clientId}
                        onChange={(e) => {
                            const v = e.target.value;
                            setClientId(v);
                            setSelectedId(null);
                            setDetail(null);
                            syncQuery(v, serviceKind, null);
                        }}
                    >
                        <option value="">（選択してください）</option>
                        {clients.map((c) => (
                            <option key={c.client_id} value={c.client_id}>
                                {c.client_name}（{c.client_id}）
                            </option>
                        ))}
                    </select>
                </div>

                <div>
                    <div className="text-sm mb-1">サービス種別</div>
                    <select
                        className="border rounded px-2 py-1"
                        value={serviceKind}
                        onChange={(e) => {
                            const v = e.target.value as AssessmentServiceKind;
                            setServiceKind(v);
                            setSelectedId(null);
                            setDetail(null);
                            syncQuery(clientId, v, null);
                        }}
                    >
                        <option value="障害">障害</option>
                        <option value="移動支援">移動支援</option>
                        <option value="要支援">要支援</option>
                        <option value="要介護">要介護</option>
                    </select>
                </div>

                <button
                    className="border rounded px-3 py-1 bg-black text-white disabled:opacity-40"
                    disabled={!clientId}
                    onClick={createNew}
                >
                    新規作成
                </button>

                <button
                    className="border rounded px-3 py-1 bg-blue-600 text-white disabled:opacity-40"
                    disabled={!clientId || generating}
                    onClick={autoGenerate}
                    title="週間シフトから必要なアセスメント種別を判定し、障害・移動支援・要介護・要支援を必要分だけ自動作成します"
                >
                    {generating ? "自動生成中..." : "アセスメント自動生成（週間シフト判定）"}
                </button>

                {detail?.kaipoke_cs_id ? (
                    <Link
                        className="text-blue-600 underline"
                        href={`/portal/cs_docs?kaipoke_cs_id=${encodeURIComponent(String(detail.kaipoke_cs_id))}`}
                        target="_blank"
                        rel="noreferrer"
                    >
                        元資料(cs_docs)を開く
                    </Link>
                ) : null}


                {detail?.assessment_id ? (
                    <Link
                        className="text-blue-600 underline"
                        href={`/portal/assessment?client_id=${encodeURIComponent(clientId)}&service_kind=${encodeURIComponent(
                            serviceKind
                        )}`}
                    >
                        一覧に戻る
                    </Link>
                ) : null}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* 左：一覧 */}
                <div className="border rounded p-3">
                    <div className="font-semibold mb-2">アセスメント履歴</div>
                    {!clientId ? (
                        <div className="text-sm text-gray-600">上で利用者を選択してください</div>
                    ) : list.length === 0 ? (
                        <div className="text-sm text-gray-600">履歴がありません</div>
                    ) : (
                        <ul className="space-y-2">
                            {list.map((r) => {
                                const active = r.assessment_id === selectedId;
                                return (
                                    <li key={r.assessment_id}>
                                        <button
                                            className={`w-full text-left border rounded px-2 py-2 ${active ? "bg-gray-100" : ""}`}
                                            onClick={() => {
                                                setSelectedId(r.assessment_id);
                                                syncQuery(clientId, serviceKind, r.assessment_id);
                                            }}
                                        >
                                            <div className="text-sm">{r.assessed_on}</div>
                                            <div className="text-xs text-gray-600">作成者: {r.author_name}</div>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>

                {/* 右：詳細 */}
                <div className="border rounded p-3">
                    <div className="font-semibold mb-2">詳細</div>

                    {!detail ? (
                        <div className="text-sm text-gray-600">左の履歴から選択するか「新規作成」を押してください</div>
                    ) : (
                        <div className="space-y-3">
                            <div className="flex flex-wrap gap-3">
                                <div>
                                    <div className="text-sm mb-1">作成年月日</div>
                                    <input
                                        type="date"
                                        className="border rounded px-2 py-1"
                                        value={detail.assessed_on}
                                        onChange={(e) => setDetail({ ...detail, assessed_on: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <div className="text-sm mb-1">担当者会議議事録</div>
                                    <textarea
                                        className="border rounded px-2 py-2 w-full min-h-[160px]"
                                        value={detail.meeting_minutes ?? ""}
                                        onChange={(e) =>
                                            setDetail({
                                                ...detail,
                                                meeting_minutes: e.target.value,
                                            })
                                        }
                                        placeholder="担当者会議の内容を入力"
                                    />
                                </div>
                                <div className="flex-1 min-w-[240px]">
                                    <div className="text-sm mb-1">アセスメント作成者氏名（初期値：ログインユーザー）</div>
                                    <input
                                        className="border rounded px-2 py-1 w-full"
                                        value={detail.author_name}
                                        onChange={(e) => setDetail({ ...detail, author_name: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="flex gap-2">
                                <button
                                    className="border rounded px-3 py-1 bg-black text-white disabled:opacity-40"
                                    disabled={saving || planGenerating}
                                    onClick={save}
                                >
                                    保存
                                </button>

                                <button
                                    className="border rounded px-3 py-1 bg-green-600 text-white disabled:opacity-40"
                                    disabled={planGenerating || saving || !detail}
                                    onClick={generatePlans}
                                >
                                    {planGenerating ? "プラン生成中..." : "プラン生成"}
                                </button>

                                <button
                                    className="border rounded px-3 py-1"
                                    disabled={saving || planGenerating}
                                    onClick={del}
                                >
                                    削除
                                </button>
                            </div>

                            {detail && (
                                <div className="border rounded p-3 bg-white space-y-3">
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="font-bold">生成済みプラン</div>
                                        <button
                                            className="border rounded px-3 py-1 text-sm disabled:opacity-40"
                                            disabled={plansLoading}
                                            onClick={() => fetchPlans(detail.assessment_id)}
                                        >
                                            {plansLoading ? "更新中..." : "一覧更新"}
                                        </button>
                                    </div>

                                    {plansLoading ? (
                                        <div className="text-sm text-gray-500">プラン一覧を取得中...</div>
                                    ) : plans.length === 0 ? (
                                        <div className="text-sm text-gray-500">
                                            まだプランは作成されていません。「プラン生成」を押すとここに表示されます。
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            {plans.map((p) => (
                                                <button
                                                    key={p.plan_id}
                                                    type="button"
                                                    className={[
                                                        "w-full text-left border rounded p-3 hover:bg-gray-50",
                                                        selectedPlanId === p.plan_id ? "bg-green-50 border-green-400" : "",
                                                    ].join(" ")}
                                                    onClick={() => fetchPlanDetail(p.plan_id)}
                                                >
                                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                                        <div>
                                                            <div className="font-semibold">{p.title}</div>
                                                            <div className="text-xs text-gray-500">
                                                                {p.plan_document_kind} / status: {p.status} / version: {p.version_no}
                                                            </div>
                                                        </div>
                                                        <div className="text-xs text-gray-500">
                                                            {p.created_at ? new Date(p.created_at).toLocaleString("ja-JP") : ""}
                                                        </div>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                    {planDetailLoading && (
                                        <div className="text-sm text-gray-500">プラン詳細を取得中...</div>
                                    )}

                                    {planDetail && (
                                        <PlanEditor
                                            detail={planDetail}
                                            onReload={async (planId) => {
                                                await fetchPlanDetail(planId);
                                                if (detail?.assessment_id) {
                                                    await fetchPlans(detail.assessment_id);
                                                }
                                            }}
                                        />
                                    )}

                                </div>
                            )}

                            <div className="space-y-4">
                                {detail.content?.sheets?.map((sheet) => (
                                    <div key={sheet.key} className="border rounded p-2">
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="font-semibold">{sheet.title}</div>
                                            <div className="text-sm">
                                                印刷対象：
                                                <label className="ml-2">
                                                    <input
                                                        type="radio"
                                                        name={`print_${sheet.key}`}
                                                        checked={sheet.printTarget === true}
                                                        onChange={() => setPrintTarget(sheet.key, true)}
                                                    />{" "}
                                                    対象
                                                </label>
                                                <label className="ml-2">
                                                    <input
                                                        type="radio"
                                                        name={`print_${sheet.key}`}
                                                        checked={sheet.printTarget === false}
                                                        onChange={() => setPrintTarget(sheet.key, false)}
                                                    />{" "}
                                                    対象外
                                                </label>
                                            </div>
                                        </div>

                                        {sheet.rows.length === 0 ? (
                                            <div className="text-sm text-gray-600 mt-2">
                                                （このシートの項目は未投入です。template.ts にカイポケ項目を追記してください）
                                            </div>
                                        ) : (
                                            <div className="overflow-auto mt-2">
                                                <table className="min-w-full border-collapse">
                                                    <thead>
                                                        <tr className="text-left">
                                                            <th className="border px-2 py-1 w-[110px]">チェック欄</th>
                                                            <th className="border px-2 py-1">詳細項目</th>
                                                            <th className="border px-2 py-1">備考</th>
                                                            <th className="border px-2 py-1">本人・家族の希望・要望</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {sheet.rows.map((r) => {
                                                            const rowAny = r as typeof r & {
                                                                inputType?: string;
                                                                value?: string;
                                                                defaultValue?: string;
                                                                options?: { value: string; label: string }[];
                                                            };
                                                            const isRadio = rowAny.inputType === "radio" && Array.isArray(rowAny.options);
                                                            const currentValue = String(rowAny.value ?? rowAny.defaultValue ?? "01");

                                                            return (
                                                                <tr key={r.key}>
                                                                    <td className="border px-2 py-1 align-top">
                                                                        <select
                                                                            className="border rounded px-2 py-1 w-full"
                                                                            value={r.check}
                                                                            onChange={(e) => setCheck(sheet.key, r.key, e.target.value as AssessmentCheck)}
                                                                        >
                                                                            <option value="NONE">－</option>
                                                                            <option value="CIRCLE">○</option>
                                                                        </select>
                                                                    </td>
                                                                    <td className="border px-2 py-1 align-top">
                                                                        <div className="font-medium">{r.label}</div>
                                                                        {isRadio ? (
                                                                            <div className="mt-2 space-y-1 text-sm">
                                                                                {rowAny.options!.map((opt) => (
                                                                                    <label key={opt.value} className="block">
                                                                                        <input
                                                                                            type="radio"
                                                                                            name={`${sheet.key}_${r.key}`}
                                                                                            value={opt.value}
                                                                                            checked={currentValue === opt.value}
                                                                                            onChange={(e) => setRowValue(sheet.key, r.key, e.target.value)}
                                                                                        />{" "}
                                                                                        {opt.label}
                                                                                    </label>
                                                                                ))}
                                                                            </div>
                                                                        ) : null}
                                                                    </td>
                                                                    <td className="border px-2 py-1 align-top">
                                                                        <textarea
                                                                            className="border rounded px-2 py-1 w-full min-h-[70px]"
                                                                            value={r.remark}
                                                                            onChange={(e) => setText(sheet.key, r.key, "remark", e.target.value)}
                                                                        />
                                                                    </td>
                                                                    <td className="border px-2 py-1 align-top">
                                                                        <textarea
                                                                            className="border rounded px-2 py-1 w-full min-h-[70px]"
                                                                            value={r.hope}
                                                                            onChange={(e) => setText(sheet.key, r.key, "hope", e.target.value)}
                                                                        />
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {selectedFromList?.assessment_id ? (
                <div className="text-xs text-gray-600">現在表示中ID: {selectedFromList.assessment_id}</div>
            ) : null}
        </div>
    );
}
