"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useUserRole } from "@/context/RoleContext";

type CatalogRow = {
    id: string;
    training_type: string;
    training_code: string;
    training_key: string;
    target_role: "manager" | "member" | "both" | null;
    target_group: string | null;
    training_title: string;
    training_goal: string | null;
    training_month: number | null;
    video_url: string | null;
    sort_order: number;
    is_active: boolean;
};

type FormState = {
    training_type: string;
    training_code: string;
    training_key: string;
    target_role: "manager" | "member" | "both";
    target_group: string;
    training_title: string;
    training_goal: string;
    training_month: string;
    video_url: string;
    sort_order: string;
    is_active: boolean;
};

const TRAINING_TYPE_OPTIONS = [
    "育成とマネジメント",
    "従業員用",
    "コミュニケーション技術",
    "介護基礎知識介護過程",
];

const TRAINING_CODE_OPTIONS = [
    ...Array.from({ length: 26 }, (_, i) =>
        String.fromCharCode(65 + i)
    ),
    ...Array.from({ length: 20 }, (_, i) =>
        String(i + 1)
    ),
];

const initialForm: FormState = {
    training_type: "",
    training_code: "",
    training_key: "",
    target_role: "both",
    target_group: "",
    training_title: "",
    training_goal: "",
    training_month: "",
    video_url: "",
    sort_order: "10",
    is_active: true,
};

async function fetchWithBearer(input: RequestInfo, init?: RequestInit) {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;

    const token = data.session?.access_token;
    if (!token) throw new Error("unauthorized");

    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${token}`);

    if (init?.body && !headers.has("content-type")) {
        headers.set("content-type", "application/json");
    }

    return fetch(input, { ...init, headers });
}

export default function TrainingGoalsManagePage() {
    const role = useUserRole();

    const [rows, setRows] = useState<CatalogRow[]>([]);
    const [form, setForm] = useState<FormState>(initialForm);
    const [editId, setEditId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<FormState>(initialForm);
    const [videoInputs, setVideoInputs] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState("");

    const normalizedRole = String(role ?? "").toLowerCase();
    const canManage = ["admin", "manager", "full"].includes(normalizedRole);

    async function load() {
        setLoading(true);
        setMsg("");

        try {
            const res = await fetchWithBearer("/api/training-goals/catalog");
            const json = await res.json();

            if (!res.ok || !json.ok) {
                throw new Error(json.error ?? "load failed");
            }

            const loadedRows = json.rows ?? [];
            setRows(loadedRows);

            setVideoInputs(
                Object.fromEntries(
                    loadedRows.map((row: CatalogRow) => [row.id, row.video_url ?? ""])
                )
            );
        } catch (e) {
            setMsg(e instanceof Error ? e.message : "load failed");
        } finally {
            setLoading(false);
        }
    }

    async function createGoal() {
        setLoading(true);
        setMsg("");

        try {
            const res = await fetchWithBearer("/api/training-goals/catalog", {
                method: "POST",
                body: JSON.stringify(form),
            });

            const json = await res.json();

            if (!res.ok || !json.ok) {
                throw new Error(json.error ?? "save failed");
            }

            setForm(initialForm);
            setMsg("追加しました");
            await load();
        } catch (e) {
            setMsg(e instanceof Error ? e.message : "save failed");
        } finally {
            setLoading(false);
        }
    }

    async function updateGoal(
        id: string,
        patch: Partial<CatalogRow>
    ) {
        setLoading(true);
        setMsg("");

        try {
            const res = await fetchWithBearer("/api/training-goals/catalog", {
                method: "PATCH",
                body: JSON.stringify({ id, ...patch }),
            });

            const json = await res.json();

            if (!res.ok || !json.ok) {
                throw new Error(json.error ?? "update failed");
            }

            setMsg("更新しました");
            await load();
        } catch (e) {
            setMsg(e instanceof Error ? e.message : "update failed");
        } finally {
            setLoading(false);
        }
    }

    async function toggleGoal(row: CatalogRow) {
        const next = !row.is_active;

        const ok = window.confirm(
            next
                ? `「${row.training_title}」を再表示しますか？`
                : `「${row.training_title}」を非表示にしますか？`
        );

        if (!ok) return;

        await updateGoal(row.id, {
            is_active: next,
        });
    }

    async function saveVideo(row: CatalogRow) {
        await updateGoal(row.id, { video_url: videoInputs[row.id] ?? "" });
    }

    function startEdit(row: CatalogRow) {
        setEditId(row.id);
        setEditForm({
            training_type: row.training_type,
            training_code: row.training_code,
            training_key: row.training_key,
            target_role: row.target_role ?? "both",
            target_group: row.target_group ?? "",
            training_title: row.training_title,
            training_goal: row.training_goal ?? "",
            training_month: row.training_month ? String(row.training_month) : "",
            video_url: row.video_url ?? "",
            sort_order: String(row.sort_order ?? 10),
            is_active: row.is_active,
        });

        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    async function saveEdit() {
        if (!editId) return;

        await updateGoal(editId, {
            training_type: editForm.training_type,
            training_code: editForm.training_code,
            training_title: editForm.training_title,
            training_goal: editForm.training_goal,
            video_url: editForm.video_url,
            sort_order: Number(editForm.sort_order || 9999),
            is_active: editForm.is_active,
        } as Partial<CatalogRow>);

        setEditId(null);
        setEditForm(initialForm);
    }

    useEffect(() => {
        if (!role) return;
        if (!canManage) return;
        void load();
    }, [role, canManage]);

    if (!role) {
        return <div className="p-6">読み込み中...</div>;
    }

    if (!canManage) {
        return <div className="p-6">このページは利用できません。</div>;
    }

    return (
        <div className="p-6 space-y-6">
            <div>
                <h1 className="text-2xl font-bold">目標・研修管理</h1>
                <p className="text-sm text-gray-600 mt-1">
                    新しい目標・研修の追加と、既存データの確認を行います。
                </p>
            </div>

            {msg && (
                <div className="rounded border bg-gray-50 px-3 py-2 text-sm">
                    {msg}
                </div>
            )}

            <section className="rounded border bg-white p-4 space-y-4">
                <h2 className="font-bold">新しい目標・研修を追加</h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <label className="text-sm">
                        種別
                        <select
                            className="mt-1 w-full border rounded px-3 py-2"
                            value={form.training_type}
                            onChange={(e) =>
                                setForm({
                                    ...form,
                                    training_type: e.target.value,
                                })
                            }
                        >
                            <option value="">選択してください</option>
                            {TRAINING_TYPE_OPTIONS.map((option) => (
                                <option key={option} value={option}>
                                    {option}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label className="text-sm">
                        区分コード
                        <select
                            className="mt-1 w-full border rounded px-3 py-2"
                            value={form.training_code}
                            onChange={(e) =>
                                setForm({
                                    ...form,
                                    training_code: e.target.value,
                                })
                            }
                        >
                            <option value="">選択してください</option>

                            {TRAINING_CODE_OPTIONS.map((code) => (
                                <option key={code} value={code}>
                                    {code}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label className="text-sm md:col-span-2">
                        タイトル
                        <input
                            className="mt-1 w-full border rounded px-3 py-2"
                            value={form.training_title}
                            onChange={(e) => setForm({ ...form, training_title: e.target.value })}
                            placeholder="表示される目標・研修名"
                        />
                    </label>

                    <label className="text-sm md:col-span-2">
                        目標内容
                        <textarea
                            className="mt-1 w-full border rounded px-3 py-2"
                            rows={3}
                            value={form.training_goal}
                            onChange={(e) => setForm({ ...form, training_goal: e.target.value })}
                        />
                    </label>

                    <label className="text-sm">
                        動画URL
                        <input
                            className="mt-1 w-full border rounded px-3 py-2"
                            value={form.video_url}
                            onChange={(e) => setForm({ ...form, video_url: e.target.value })}
                            placeholder="https://..."
                        />
                    </label>
                </div>

                <button
                    type="button"
                    disabled={loading}
                    onClick={createGoal}
                    className="rounded bg-blue-600 px-4 py-2 text-white disabled:bg-gray-400"
                >
                    追加する
                </button>
            </section>

            {editId && (
                <section className="rounded border bg-yellow-50 p-4 space-y-4">
                    <h2 className="font-bold">目標・研修を編集</h2>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <label className="text-sm">
                            種別
                            <select
                                className="mt-1 w-full border rounded px-3 py-2"
                                value={editForm.training_type}
                                onChange={(e) =>
                                    setEditForm({
                                        ...editForm,
                                        training_type: e.target.value,
                                    })
                                }
                            >
                                <option value="">選択してください</option>
                                {TRAINING_TYPE_OPTIONS.map((option) => (
                                    <option key={option} value={option}>
                                        {option}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <label className="text-sm">
                            区分コード
                            <select
                                className="mt-1 w-full border rounded px-3 py-2"
                                value={editForm.training_code}
                                onChange={(e) =>
                                    setEditForm({
                                        ...editForm,
                                        training_code: e.target.value,
                                    })
                                }
                            >
                                <option value="">選択してください</option>
                                {TRAINING_CODE_OPTIONS.map((code) => (
                                    <option key={code} value={code}>
                                        {code}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <label className="text-sm">
                            タイトル
                            <input
                                className="mt-1 w-full border rounded px-3 py-2"
                                value={editForm.training_title}
                                onChange={(e) =>
                                    setEditForm({
                                        ...editForm,
                                        training_title: e.target.value,
                                    })
                                }
                            />
                        </label>

                        <label className="text-sm md:col-span-2">
                            目標内容
                            <textarea
                                className="mt-1 w-full border rounded px-3 py-2"
                                rows={3}
                                value={editForm.training_goal}
                                onChange={(e) =>
                                    setEditForm({
                                        ...editForm,
                                        training_goal: e.target.value,
                                    })
                                }
                            />
                        </label>

                        <label className="text-sm">
                            動画URL
                            <input
                                className="mt-1 w-full border rounded px-3 py-2"
                                value={editForm.video_url}
                                onChange={(e) =>
                                    setEditForm({
                                        ...editForm,
                                        video_url: e.target.value,
                                    })
                                }
                                placeholder="https://..."
                            />
                        </label>

                        <label className="flex items-center gap-2 text-sm">
                            <input
                                type="checkbox"
                                checked={editForm.is_active}
                                onChange={(e) =>
                                    setEditForm({
                                        ...editForm,
                                        is_active: e.target.checked,
                                    })
                                }
                            />
                            表示する
                        </label>
                    </div>

                    <div className="flex gap-2">
                        <button
                            type="button"
                            disabled={loading}
                            onClick={saveEdit}
                            className="rounded bg-blue-600 px-4 py-2 text-white disabled:bg-gray-400"
                        >
                            保存
                        </button>

                        <button
                            type="button"
                            disabled={loading}
                            onClick={() => {
                                setEditId(null);
                                setEditForm(initialForm);
                            }}
                            className="rounded border px-4 py-2 disabled:bg-gray-100"
                        >
                            キャンセル
                        </button>
                    </div>
                </section>
            )}

            <section className="rounded border bg-white p-4">
                <h2 className="font-bold mb-3">既存の目標・研修一覧</h2>

                {loading ? (
                    <p>読み込み中...</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full border-collapse border text-sm">
                            <thead className="bg-gray-100">
                                <tr>
                                    <th className="border px-2 py-2 text-left">表示順</th>
                                    <th className="border px-2 py-2 text-left">種別</th>
                                    <th className="border px-2 py-2 text-left">コード</th>
                                    <th className="border px-2 py-2 text-left">タイトル</th>
                                    <th className="border px-2 py-2 text-left">目標</th>
                                    <th className="border px-2 py-2 text-left">動画</th>
                                    <th className="border px-2 py-2 text-left">状態</th>
                                    <th className="border px-2 py-2 text-left">操作</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((row) => (
                                    <tr key={row.id}>
                                        <td className="border px-2 py-2">{row.sort_order}</td>
                                        <td className="border px-2 py-2">{row.training_type}</td>
                                        <td className="border px-2 py-2">{row.training_code}</td>
                                        <td className="border px-2 py-2">{row.training_title}</td>
                                        <td className="border px-2 py-2 whitespace-pre-wrap">
                                            {row.training_goal ?? ""}
                                        </td>
                                        <td className="border px-2 py-2 min-w-[260px]">
                                            <div className="flex items-center gap-2">
                                                <input
                                                    className="w-48 border rounded px-2 py-1"
                                                    value={videoInputs[row.id] ?? ""}
                                                    onChange={(e) =>
                                                        setVideoInputs({
                                                            ...videoInputs,
                                                            [row.id]: e.target.value,
                                                        })
                                                    }
                                                    placeholder="https://..."
                                                />

                                                <button
                                                    type="button"
                                                    disabled={loading}
                                                    onClick={() => saveVideo(row)}
                                                    className="whitespace-nowrap rounded border px-2 py-1 disabled:bg-gray-100"
                                                >
                                                    保存
                                                </button>

                                                {row.video_url ? (
                                                    <a
                                                        href={row.video_url}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="whitespace-nowrap text-blue-600 underline"
                                                    >
                                                        開く
                                                    </a>
                                                ) : null}
                                            </div>
                                        </td>
                                        <td className="border px-2 py-2">
                                            {row.is_active ? "有効" : "無効"}
                                        </td>

                                        <td className="border px-2 py-2">
                                            <button
                                                type="button"
                                                disabled={loading}
                                                onClick={() => startEdit(row)}
                                                className="mr-2 rounded bg-blue-600 px-3 py-1 text-white disabled:bg-gray-300"
                                            >
                                                編集
                                            </button>
                                            <button
                                                type="button"
                                                disabled={loading}
                                                onClick={() => toggleGoal(row)}
                                                className={`rounded px-3 py-1 text-white ${row.is_active
                                                    ? "bg-red-600"
                                                    : "bg-green-600"
                                                    }`}
                                            >
                                                {row.is_active ? "非表示" : "再表示"}
                                            </button>
                                        </td>
                                    </tr>
                                ))}

                                {rows.length === 0 && (
                                    <tr>
                                        <td className="border px-3 py-3 text-gray-600" colSpan={8}>
                                            目標・研修がありません。
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </div>
    );
}