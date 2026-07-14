"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

type SurveyStatus = "draft" | "published" | "closed";

type BentoSurvey = {
    id: string;
    title: string;
    description: string | null;
    notes: string | null;
    event_date: string;
    response_deadline: string;
    status: SurveyStatus;
    allow_edit_after_submit: boolean;
    created_at: string;
    updated_at: string;
    is_active: boolean;
    published_at: string | null;
};

type BentoMenu = {
    id: string;
    survey_id: string;
    name: string;
    description: string | null;
    image_url: string | null;
    sort_order: number;
    is_active: boolean;
    created_at: string;
};

type PickupLocation = {
    id: string;
    name: string;
    sort_order: number;
    is_active: boolean;
    created_at: string;
};

type SurveyResponse = {
    id: string;
    survey_id: string;
    user_id: string;
    menu_id: string;
    pickup_location_id: string;
    option_text: string | null;
    submitted_at: string;
    updated_at: string;
};

type SurveyNotesPayload = {
    noticeText: string;
    options: string[];
};

type SurveyForm = {
    title: string;
    description: string;
    noticeText: string;
    eventDate: string;
    responseDeadline: string;
    allowEditAfterSubmit: boolean;
    options: string[];
};

type MenuDraft = {
    name: string;
    description: string;
    imageUrl: string;
    sortOrder: number;
    isActive: boolean;
};

const STORAGE_BUCKET = "bento-menu-images";

const initialSurveyForm: SurveyForm = {
    title: "",
    description: "",
    noticeText: "",
    eventDate: "",
    responseDeadline: "",
    allowEditAfterSubmit: false,
    options: ["普通盛り", "大盛り"],
};

const initialMenuDraft: MenuDraft = {
    name: "",
    description: "",
    imageUrl: "",
    sortOrder: 0,
    isActive: true,
};

let supabaseSingleton: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient {
    if (supabaseSingleton) return supabaseSingleton;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !anonKey) {
        throw new Error(
            "NEXT_PUBLIC_SUPABASE_URL または NEXT_PUBLIC_SUPABASE_ANON_KEY が設定されていません。"
        );
    }

    supabaseSingleton = createClient(url, anonKey, {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
        },
    });

    return supabaseSingleton;
}

function parseSurveyNotes(notes: string | null): SurveyNotesPayload {
    if (!notes) {
        return { noticeText: "", options: [] };
    }

    try {
        const parsed = JSON.parse(notes) as Partial<SurveyNotesPayload>;
        return {
            noticeText: typeof parsed.noticeText === "string" ? parsed.noticeText : "",
            options: Array.isArray(parsed.options)
                ? parsed.options.filter((value): value is string => typeof value === "string")
                : [],
        };
    } catch {
        return {
            noticeText: notes,
            options: [],
        };
    }
}

function toLocalDateTimeInput(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 16);
}

function formatDateTime(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("ja-JP", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    }).format(date);
}

function statusLabel(status: SurveyStatus): string {
    if (status === "published") return "公開中";
    if (status === "closed") return "終了";
    return "下書き";
}

export default function BentoAdminPage() {
    const supabase = useMemo(() => getSupabaseClient(), []);

    const [surveys, setSurveys] = useState<BentoSurvey[]>([]);
    const [menus, setMenus] = useState<BentoMenu[]>([]);
    const [locations, setLocations] = useState<PickupLocation[]>([]);
    const [responses, setResponses] = useState<SurveyResponse[]>([]);
    const [selectedSurveyId, setSelectedSurveyId] = useState<string>("");
    const [surveyForm, setSurveyForm] = useState<SurveyForm>(initialSurveyForm);
    const [menuDraft, setMenuDraft] = useState<MenuDraft>(initialMenuDraft);
    const [editingMenuId, setEditingMenuId] = useState<string | null>(null);
    const [newLocationName, setNewLocationName] = useState("");
    const [newLocationSortOrder, setNewLocationSortOrder] = useState(0);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");

    const selectedSurvey = useMemo(
        () => surveys.find((survey) => survey.id === selectedSurveyId) ?? null,
        [surveys, selectedSurveyId]
    );

    const selectedMenus = useMemo(
        () =>
            menus
                .filter((menu) => menu.survey_id === selectedSurveyId)
                .sort((a, b) => a.sort_order - b.sort_order),
        [menus, selectedSurveyId]
    );

    const selectedResponses = useMemo(
        () => responses.filter((response) => response.survey_id === selectedSurveyId),
        [responses, selectedSurveyId]
    );

    const loadData = useCallback(async () => {
        setLoading(true);
        setError("");

        const [surveyResult, menuResult, locationResult, responseResult] = await Promise.all([
            supabase
                .from("bento_surveys")
                .select("*")
                .order("event_date", { ascending: false }),
            supabase
                .from("bento_survey_menus")
                .select("*")
                .order("sort_order", { ascending: true }),
            supabase
                .from("bento_pickup_locations")
                .select("*")
                .order("sort_order", { ascending: true }),
            supabase
                .from("bento_survey_responses")
                .select("*")
                .order("submitted_at", { ascending: false }),
        ]);

        const firstError =
            surveyResult.error || menuResult.error || locationResult.error || responseResult.error;

        if (firstError) {
            setError(firstError.message);
            setLoading(false);
            return;
        }

        const surveyRows = (surveyResult.data ?? []) as BentoSurvey[];
        setSurveys(surveyRows);
        setMenus((menuResult.data ?? []) as BentoMenu[]);
        setLocations((locationResult.data ?? []) as PickupLocation[]);
        setResponses((responseResult.data ?? []) as SurveyResponse[]);

        setSelectedSurveyId((current) => current || surveyRows[0]?.id || "");
        setLoading(false);
    }, [supabase]);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    useEffect(() => {
        if (!selectedSurvey) {
            setSurveyForm(initialSurveyForm);
            return;
        }

        const notes = parseSurveyNotes(selectedSurvey.notes);
        setSurveyForm({
            title: selectedSurvey.title,
            description: selectedSurvey.description ?? "",
            noticeText: notes.noticeText,
            eventDate: selectedSurvey.event_date,
            responseDeadline: toLocalDateTimeInput(selectedSurvey.response_deadline),
            allowEditAfterSubmit: selectedSurvey.allow_edit_after_submit,
            options: notes.options.length > 0 ? notes.options : ["普通盛り", "大盛り"],
        });
    }, [selectedSurvey]);

    function clearMessages() {
        setMessage("");
        setError("");
    }

    function startNewSurvey() {
        clearMessages();
        setSelectedSurveyId("");
        setSurveyForm(initialSurveyForm);
        setMenuDraft(initialMenuDraft);
        setEditingMenuId(null);
    }

    async function saveSurvey(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        clearMessages();

        if (!surveyForm.title.trim()) {
            setError("アンケートタイトルを入力してください。");
            return;
        }
        if (!surveyForm.eventDate || !surveyForm.responseDeadline) {
            setError("配布日と回答締切を入力してください。");
            return;
        }

        const options = surveyForm.options.map((option) => option.trim()).filter(Boolean);
        const payload = {
            title: surveyForm.title.trim(),
            description: surveyForm.description.trim() || null,
            notes: JSON.stringify({
                noticeText: surveyForm.noticeText.trim(),
                options,
            } satisfies SurveyNotesPayload),
            event_date: surveyForm.eventDate,
            response_deadline: new Date(surveyForm.responseDeadline).toISOString(),
            allow_edit_after_submit: surveyForm.allowEditAfterSubmit,
            updated_at: new Date().toISOString(),
            is_active: true,
        };

        setSaving(true);

        if (selectedSurveyId) {
            const { error: updateError } = await supabase
                .from("bento_surveys")
                .update(payload)
                .eq("id", selectedSurveyId);

            if (updateError) {
                setError(updateError.message);
                setSaving(false);
                return;
            }
            setMessage("アンケートを更新しました。");
        } else {
            const { data, error: insertError } = await supabase
                .from("bento_surveys")
                .insert({
                    ...payload,
                    status: "draft",
                    published_at: null,
                })
                .select("id")
                .single();

            if (insertError) {
                setError(insertError.message);
                setSaving(false);
                return;
            }

            setSelectedSurveyId(data.id as string);
            setMessage("アンケートを作成しました。");
        }

        await loadData();
        setSaving(false);
    }

    async function changeSurveyStatus(status: SurveyStatus) {
        if (!selectedSurveyId) return;
        clearMessages();

        const payload: Partial<BentoSurvey> = {
            status,
            updated_at: new Date().toISOString(),
        };

        if (status === "published") {
            payload.published_at = new Date().toISOString();
        }

        const { error: updateError } = await supabase
            .from("bento_surveys")
            .update(payload)
            .eq("id", selectedSurveyId);

        if (updateError) {
            setError(updateError.message);
            return;
        }

        setMessage(`ステータスを「${statusLabel(status)}」に変更しました。`);
        await loadData();
    }

    async function deleteSurvey() {
        if (!selectedSurveyId) return;
        if (!window.confirm("このアンケートを削除します。メニューと回答も削除されます。よろしいですか？")) {
            return;
        }

        clearMessages();
        const { error: deleteError } = await supabase
            .from("bento_surveys")
            .delete()
            .eq("id", selectedSurveyId);

        if (deleteError) {
            setError(deleteError.message);
            return;
        }

        setMessage("アンケートを削除しました。");
        setSelectedSurveyId("");
        await loadData();
    }

    function addOption() {
        setSurveyForm((current) => ({ ...current, options: [...current.options, ""] }));
    }

    function updateOption(index: number, value: string) {
        setSurveyForm((current) => ({
            ...current,
            options: current.options.map((option, currentIndex) =>
                currentIndex === index ? value : option
            ),
        }));
    }

    function removeOption(index: number) {
        setSurveyForm((current) => ({
            ...current,
            options: current.options.filter((_, currentIndex) => currentIndex !== index),
        }));
    }

    async function uploadMenuImage(event: ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith("image/")) {
            setError("画像ファイルを選択してください。");
            return;
        }

        clearMessages();
        setUploading(true);

        const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
        const surveyFolder = selectedSurveyId || "draft";
        const filePath = `${surveyFolder}/${crypto.randomUUID()}.${extension}`;

        const { error: uploadError } = await supabase.storage
            .from(STORAGE_BUCKET)
            .upload(filePath, file, { upsert: false });

        if (uploadError) {
            setError(
                `${uploadError.message}。Supabase Storageに「${STORAGE_BUCKET}」バケットがあるか確認してください。`
            );
            setUploading(false);
            return;
        }

        const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);
        setMenuDraft((current) => ({ ...current, imageUrl: data.publicUrl }));
        setUploading(false);
        setMessage("画像をアップロードしました。");
    }

    async function saveMenu(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        clearMessages();

        if (!selectedSurveyId) {
            setError("先にアンケートを保存してください。");
            return;
        }
        if (!menuDraft.name.trim()) {
            setError("メニュー名を入力してください。");
            return;
        }

        const payload = {
            survey_id: selectedSurveyId,
            name: menuDraft.name.trim(),
            description: menuDraft.description.trim() || null,
            image_url: menuDraft.imageUrl.trim() || null,
            sort_order: Number(menuDraft.sortOrder) || 0,
            is_active: menuDraft.isActive,
        };

        if (editingMenuId) {
            const { error: updateError } = await supabase
                .from("bento_survey_menus")
                .update(payload)
                .eq("id", editingMenuId);

            if (updateError) {
                setError(updateError.message);
                return;
            }
            setMessage("メニューを更新しました。");
        } else {
            const { error: insertError } = await supabase.from("bento_survey_menus").insert(payload);
            if (insertError) {
                setError(insertError.message);
                return;
            }
            setMessage("メニューを追加しました。");
        }

        setMenuDraft(initialMenuDraft);
        setEditingMenuId(null);
        await loadData();
    }

    function editMenu(menu: BentoMenu) {
        clearMessages();
        setEditingMenuId(menu.id);
        setMenuDraft({
            name: menu.name,
            description: menu.description ?? "",
            imageUrl: menu.image_url ?? "",
            sortOrder: menu.sort_order,
            isActive: menu.is_active,
        });
    }

    async function deleteMenu(menuId: string) {
        if (!window.confirm("このメニューを削除しますか？")) return;
        clearMessages();

        const { error: deleteError } = await supabase
            .from("bento_survey_menus")
            .delete()
            .eq("id", menuId);

        if (deleteError) {
            setError(
                `${deleteError.message}。すでに回答で使用されているメニューは削除できないため、非表示にしてください。`
            );
            return;
        }

        setMessage("メニューを削除しました。");
        await loadData();
    }

    async function addLocation(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        clearMessages();

        if (!newLocationName.trim()) {
            setError("受取場所名を入力してください。");
            return;
        }

        const { error: insertError } = await supabase.from("bento_pickup_locations").insert({
            name: newLocationName.trim(),
            sort_order: Number(newLocationSortOrder) || 0,
            is_active: true,
        });

        if (insertError) {
            setError(insertError.message);
            return;
        }

        setNewLocationName("");
        setNewLocationSortOrder(0);
        setMessage("受取場所を追加しました。");
        await loadData();
    }

    async function updateLocation(location: PickupLocation, changes: Partial<PickupLocation>) {
        clearMessages();
        const { error: updateError } = await supabase
            .from("bento_pickup_locations")
            .update(changes)
            .eq("id", location.id);

        if (updateError) {
            setError(updateError.message);
            return;
        }

        setMessage("受取場所を更新しました。");
        await loadData();
    }

    if (loading) {
        return <main className="p-6">読み込み中です...</main>;
    }

    return (
        <main className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-2xl font-bold">お弁当アンケート管理</h1>
                    <p className="mt-1 text-sm text-gray-600">
                        アンケート、メニュー、写真、オプション、受取場所を管理します。
                    </p>
                </div>
                <button
                    type="button"
                    onClick={startNewSurvey}
                    className="rounded bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700"
                >
                    新しいアンケートを作成
                </button>
            </div>

            {message && <div className="rounded border border-green-300 bg-green-50 p-3 text-green-800">{message}</div>}
            {error && <div className="rounded border border-red-300 bg-red-50 p-3 text-red-800">{error}</div>}

            <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
                <aside className="rounded border bg-white p-4 shadow-sm">
                    <h2 className="mb-3 font-semibold">アンケート一覧</h2>
                    <div className="space-y-2">
                        {surveys.length === 0 && <p className="text-sm text-gray-500">まだありません。</p>}
                        {surveys.map((survey) => (
                            <button
                                key={survey.id}
                                type="button"
                                onClick={() => {
                                    clearMessages();
                                    setSelectedSurveyId(survey.id);
                                    setEditingMenuId(null);
                                    setMenuDraft(initialMenuDraft);
                                }}
                                className={`w-full rounded border p-3 text-left ${selectedSurveyId === survey.id
                                        ? "border-blue-500 bg-blue-50"
                                        : "border-gray-200 hover:bg-gray-50"
                                    }`}
                            >
                                <div className="font-medium">{survey.title}</div>
                                <div className="mt-1 text-xs text-gray-600">配布日: {survey.event_date}</div>
                                <div className="mt-1 text-xs font-medium">{statusLabel(survey.status)}</div>
                            </button>
                        ))}
                    </div>
                </aside>

                <section className="space-y-6">
                    <form onSubmit={saveSurvey} className="rounded border bg-white p-4 shadow-sm md:p-6">
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <h2 className="text-lg font-semibold">
                                {selectedSurveyId ? "アンケート編集" : "アンケート新規作成"}
                            </h2>
                            {selectedSurvey && (
                                <span className="rounded bg-gray-100 px-3 py-1 text-sm">
                                    {statusLabel(selectedSurvey.status)}
                                </span>
                            )}
                        </div>

                        <div className="mt-5 grid gap-4 md:grid-cols-2">
                            <label className="md:col-span-2">
                                <span className="mb-1 block text-sm font-medium">タイトル</span>
                                <input
                                    value={surveyForm.title}
                                    onChange={(event) =>
                                        setSurveyForm((current) => ({ ...current, title: event.target.value }))
                                    }
                                    className="w-full rounded border px-3 py-2"
                                    placeholder="例：6月 福利厚生弁当アンケート"
                                />
                            </label>

                            <label className="md:col-span-2">
                                <span className="mb-1 block text-sm font-medium">説明</span>
                                <textarea
                                    value={surveyForm.description}
                                    onChange={(event) =>
                                        setSurveyForm((current) => ({ ...current, description: event.target.value }))
                                    }
                                    className="min-h-28 w-full rounded border px-3 py-2"
                                    placeholder="今月のお弁当、回答対象者などを入力"
                                />
                            </label>

                            <label className="md:col-span-2">
                                <span className="mb-1 block text-sm font-medium">案内・注意事項</span>
                                <textarea
                                    value={surveyForm.noticeText}
                                    onChange={(event) =>
                                        setSurveyForm((current) => ({ ...current, noticeText: event.target.value }))
                                    }
                                    className="min-h-48 w-full rounded border px-3 py-2"
                                    placeholder="LINE WORKSで案内している注意事項を入力"
                                />
                            </label>

                            <label>
                                <span className="mb-1 block text-sm font-medium">お弁当配布日</span>
                                <input
                                    type="date"
                                    value={surveyForm.eventDate}
                                    onChange={(event) =>
                                        setSurveyForm((current) => ({ ...current, eventDate: event.target.value }))
                                    }
                                    className="w-full rounded border px-3 py-2"
                                />
                            </label>

                            <label>
                                <span className="mb-1 block text-sm font-medium">回答締切</span>
                                <input
                                    type="datetime-local"
                                    value={surveyForm.responseDeadline}
                                    onChange={(event) =>
                                        setSurveyForm((current) => ({
                                            ...current,
                                            responseDeadline: event.target.value,
                                        }))
                                    }
                                    className="w-full rounded border px-3 py-2"
                                />
                            </label>
                        </div>

                        <div className="mt-5 rounded border bg-gray-50 p-4">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <h3 className="font-semibold">オプション選択肢</h3>
                                    <p className="text-xs text-gray-600">
                                        追加テーブルは使わず、アンケートのnotesに保存します。
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={addOption}
                                    className="rounded border bg-white px-3 py-1.5 text-sm hover:bg-gray-100"
                                >
                                    選択肢を追加
                                </button>
                            </div>

                            <div className="mt-3 space-y-2">
                                {surveyForm.options.map((option, index) => (
                                    <div key={`${index}-${option}`} className="flex gap-2">
                                        <input
                                            value={option}
                                            onChange={(event) => updateOption(index, event.target.value)}
                                            className="flex-1 rounded border px-3 py-2"
                                            placeholder="例：大盛り"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => removeOption(index)}
                                            className="rounded border border-red-300 px-3 py-2 text-red-700 hover:bg-red-50"
                                        >
                                            削除
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <label className="mt-4 flex items-center gap-2">
                            <input
                                type="checkbox"
                                checked={surveyForm.allowEditAfterSubmit}
                                onChange={(event) =>
                                    setSurveyForm((current) => ({
                                        ...current,
                                        allowEditAfterSubmit: event.target.checked,
                                    }))
                                }
                            />
                            <span className="text-sm">回答後の変更を許可する</span>
                        </label>

                        <div className="mt-5 flex flex-wrap gap-2">
                            <button
                                type="submit"
                                disabled={saving}
                                className="rounded bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                            >
                                {saving ? "保存中..." : "保存"}
                            </button>

                            {selectedSurveyId && (
                                <>
                                    <button
                                        type="button"
                                        onClick={() => void changeSurveyStatus("published")}
                                        className="rounded bg-green-600 px-4 py-2 font-medium text-white hover:bg-green-700"
                                    >
                                        公開する
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => void changeSurveyStatus("closed")}
                                        className="rounded bg-gray-700 px-4 py-2 font-medium text-white hover:bg-gray-800"
                                    >
                                        終了する
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => void changeSurveyStatus("draft")}
                                        className="rounded border px-4 py-2 hover:bg-gray-50"
                                    >
                                        下書きに戻す
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => void deleteSurvey()}
                                        className="rounded border border-red-300 px-4 py-2 text-red-700 hover:bg-red-50"
                                    >
                                        削除
                                    </button>
                                </>
                            )}
                        </div>
                    </form>

                    <div className="grid gap-6 xl:grid-cols-2">
                        <form onSubmit={saveMenu} className="rounded border bg-white p-4 shadow-sm md:p-6">
                            <h2 className="text-lg font-semibold">
                                {editingMenuId ? "メニュー編集" : "メニュー追加"}
                            </h2>

                            {!selectedSurveyId && (
                                <p className="mt-2 rounded bg-yellow-50 p-3 text-sm text-yellow-800">
                                    先にアンケートを保存してください。
                                </p>
                            )}

                            <div className="mt-4 space-y-4">
                                <label>
                                    <span className="mb-1 block text-sm font-medium">メニュー名</span>
                                    <input
                                        value={menuDraft.name}
                                        onChange={(event) =>
                                            setMenuDraft((current) => ({ ...current, name: event.target.value }))
                                        }
                                        className="w-full rounded border px-3 py-2"
                                        placeholder="例：ガスト チーズINハンバーグ弁当"
                                    />
                                </label>

                                <label>
                                    <span className="mb-1 block text-sm font-medium">説明</span>
                                    <textarea
                                        value={menuDraft.description}
                                        onChange={(event) =>
                                            setMenuDraft((current) => ({
                                                ...current,
                                                description: event.target.value,
                                            }))
                                        }
                                        className="min-h-24 w-full rounded border px-3 py-2"
                                    />
                                </label>

                                <label>
                                    <span className="mb-1 block text-sm font-medium">写真</span>
                                    <input type="file" accept="image/*" onChange={uploadMenuImage} />
                                    {uploading && <p className="mt-1 text-sm text-gray-600">アップロード中...</p>}
                                    {menuDraft.imageUrl && (
                                        <img
                                            src={menuDraft.imageUrl}
                                            alt="メニュー画像"
                                            className="mt-3 h-40 w-full rounded border object-cover"
                                        />
                                    )}
                                </label>

                                <label>
                                    <span className="mb-1 block text-sm font-medium">表示順</span>
                                    <input
                                        type="number"
                                        value={menuDraft.sortOrder}
                                        onChange={(event) =>
                                            setMenuDraft((current) => ({
                                                ...current,
                                                sortOrder: Number(event.target.value),
                                            }))
                                        }
                                        className="w-full rounded border px-3 py-2"
                                    />
                                </label>

                                <label className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={menuDraft.isActive}
                                        onChange={(event) =>
                                            setMenuDraft((current) => ({
                                                ...current,
                                                isActive: event.target.checked,
                                            }))
                                        }
                                    />
                                    <span className="text-sm">回答画面に表示する</span>
                                </label>
                            </div>

                            <div className="mt-4 flex gap-2">
                                <button
                                    type="submit"
                                    disabled={!selectedSurveyId || uploading}
                                    className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
                                >
                                    {editingMenuId ? "更新" : "追加"}
                                </button>
                                {editingMenuId && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setEditingMenuId(null);
                                            setMenuDraft(initialMenuDraft);
                                        }}
                                        className="rounded border px-4 py-2 hover:bg-gray-50"
                                    >
                                        キャンセル
                                    </button>
                                )}
                            </div>
                        </form>

                        <div className="rounded border bg-white p-4 shadow-sm md:p-6">
                            <h2 className="text-lg font-semibold">登録済みメニュー</h2>
                            <div className="mt-4 space-y-3">
                                {!selectedSurveyId && <p className="text-sm text-gray-500">アンケートを選択してください。</p>}
                                {selectedSurveyId && selectedMenus.length === 0 && (
                                    <p className="text-sm text-gray-500">メニューはまだありません。</p>
                                )}
                                {selectedMenus.map((menu) => (
                                    <div key={menu.id} className="rounded border p-3">
                                        <div className="flex gap-3">
                                            {menu.image_url && (
                                                <img
                                                    src={menu.image_url}
                                                    alt={menu.name}
                                                    className="h-20 w-24 rounded object-cover"
                                                />
                                            )}
                                            <div className="min-w-0 flex-1">
                                                <div className="font-medium">{menu.name}</div>
                                                <div className="mt-1 text-sm text-gray-600">{menu.description}</div>
                                                <div className="mt-1 text-xs text-gray-500">
                                                    表示順: {menu.sort_order} / {menu.is_active ? "表示" : "非表示"}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="mt-3 flex gap-2">
                                            <button
                                                type="button"
                                                onClick={() => editMenu(menu)}
                                                className="rounded border px-3 py-1.5 text-sm hover:bg-gray-50"
                                            >
                                                編集
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => void deleteMenu(menu.id)}
                                                className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
                                            >
                                                削除
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="grid gap-6 xl:grid-cols-2">
                        <div className="rounded border bg-white p-4 shadow-sm md:p-6">
                            <h2 className="text-lg font-semibold">受取場所マスタ</h2>
                            <form onSubmit={addLocation} className="mt-4 flex flex-col gap-2 sm:flex-row">
                                <input
                                    value={newLocationName}
                                    onChange={(event) => setNewLocationName(event.target.value)}
                                    className="flex-1 rounded border px-3 py-2"
                                    placeholder="例：本社"
                                />
                                <input
                                    type="number"
                                    value={newLocationSortOrder}
                                    onChange={(event) => setNewLocationSortOrder(Number(event.target.value))}
                                    className="w-28 rounded border px-3 py-2"
                                    placeholder="表示順"
                                />
                                <button className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">
                                    追加
                                </button>
                            </form>

                            <div className="mt-4 space-y-2">
                                {locations.map((location) => (
                                    <div key={location.id} className="flex items-center gap-2 rounded border p-3">
                                        <div className="flex-1">
                                            <div className="font-medium">{location.name}</div>
                                            <div className="text-xs text-gray-500">表示順: {location.sort_order}</div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                void updateLocation(location, { is_active: !location.is_active })
                                            }
                                            className={`rounded px-3 py-1.5 text-sm ${location.is_active
                                                    ? "border border-green-300 text-green-700"
                                                    : "border border-gray-300 text-gray-600"
                                                }`}
                                        >
                                            {location.is_active ? "使用中" : "停止中"}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="rounded border bg-white p-4 shadow-sm md:p-6">
                            <h2 className="text-lg font-semibold">回答状況</h2>
                            {selectedSurvey && (
                                <div className="mt-2 text-sm text-gray-600">
                                    締切: {formatDateTime(selectedSurvey.response_deadline)}
                                </div>
                            )}
                            <div className="mt-4 rounded bg-blue-50 p-4">
                                <div className="text-sm text-gray-600">回答件数</div>
                                <div className="text-3xl font-bold text-blue-700">{selectedResponses.length}</div>
                            </div>

                            <div className="mt-4 max-h-72 overflow-auto rounded border">
                                <table className="w-full text-sm">
                                    <thead className="sticky top-0 bg-gray-100">
                                        <tr>
                                            <th className="px-3 py-2 text-left">ユーザーID</th>
                                            <th className="px-3 py-2 text-left">オプション</th>
                                            <th className="px-3 py-2 text-left">回答日時</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {selectedResponses.map((response) => (
                                            <tr key={response.id} className="border-t">
                                                <td className="px-3 py-2">{response.user_id}</td>
                                                <td className="px-3 py-2">{response.option_text || "-"}</td>
                                                <td className="px-3 py-2">{formatDateTime(response.submitted_at)}</td>
                                            </tr>
                                        ))}
                                        {selectedResponses.length === 0 && (
                                            <tr>
                                                <td colSpan={3} className="px-3 py-6 text-center text-gray-500">
                                                    回答はまだありません。
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        </main>
    );
}