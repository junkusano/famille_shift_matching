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

type Props = { initialAssessmentId: string | null };

type ClientOption = { client_id: string; client_name: string };

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
            const url = `/api/assessment?client_id=${encodeURIComponent(clientId)}&service_kind=${encodeURIComponent(
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
                                    disabled={saving}
                                    onClick={save}
                                >
                                    保存
                                </button>
                                <button className="border rounded px-3 py-1" onClick={del}>
                                    削除
                                </button>
                            </div>

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
                                                        {sheet.rows.map((r) => (
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
                                                                <td className="border px-2 py-1 align-top">{r.label}</td>
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
                                                        ))}
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
