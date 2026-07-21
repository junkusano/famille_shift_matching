"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

type Menu = {
    id: string;
    name: string;
    description: string | null;
    image_url: string | null;
    sort_order: number;
};

type PickupLocation = {
    id: string;
    name: string;
    sort_order: number;
};

type SurveyResponse = {
    id: string;
    menu_id: string | null;
    pickup_location_id: string | null;
    option_text: string | null;
    submitted_at: string;
    updated_at: string;
    received_at: string | null;
    wants_bento: boolean;
};

type Survey = {
    id: string;
    title: string;
    description: string | null;
    event_date: string;
    response_deadline: string;
    allow_edit_after_submit: boolean;
    notes_payload: {
        noticeText: string;
        options: string[];
    };
};

type ApiData = {
    ok: boolean;
    error?: string;
    message?: string;
    role?: string;
    survey: Survey | null;
    menus?: Menu[];
    pickup_locations?: PickupLocation[];
    response?: SurveyResponse | null;
    eligibility?: {
        eligible: boolean;
        reason: string;
        isEntryMonth: boolean;
        hasShift: boolean;
        isMeetingMember: boolean;
    };
    deadline_passed?: boolean;
    can_edit?: boolean;
};

type AuthClient = {
    auth: {
        getSession: () => Promise<{
            data: {
                session: {
                    access_token: string;
                } | null;
            };
            error: Error | null;
        }>;
    };
};

async function fetchWithBearer(
    supabaseClient: AuthClient,
    input: RequestInfo,
    init?: RequestInit,
) {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;

    const token = data.session?.access_token;
    if (!token) throw new Error("ログイン情報を取得できませんでした");

    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${token}`);
    if (init?.body) headers.set("Content-Type", "application/json");

    return fetch(input, { ...init, headers });
}

function formatDate(value: string) {
    return new Intl.DateTimeFormat("ja-JP", {
        timeZone: "Asia/Tokyo",
        year: "numeric",
        month: "long",
        day: "numeric",
        weekday: "short",
    }).format(new Date(`${value}T00:00:00+09:00`));
}

function formatDateTime(value: string) {
    return new Intl.DateTimeFormat("ja-JP", {
        timeZone: "Asia/Tokyo",
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    }).format(new Date(value));
}

export default function BentoSurveyPage() {
    const supabase = useMemo(() => {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

        if (!url || !anonKey) {
            throw new Error(
                "NEXT_PUBLIC_SUPABASE_URL または NEXT_PUBLIC_SUPABASE_ANON_KEY が設定されていません。",
            );
        }

        return createClient(url, anonKey, {
            auth: {
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: true,
            },
        });
    }, []);
    const [data, setData] = useState<ApiData | null>(null);
    const [wantsBento, setWantsBento] = useState<boolean | null>(null);
    const [menuId, setMenuId] = useState("");
    const [pickupLocationId, setPickupLocationId] = useState("");
    const [optionText, setOptionText] = useState("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [receiving, setReceiving] = useState(false);
    const [message, setMessage] = useState("");
    const [errorMessage, setErrorMessage] = useState("");

    async function load() {
        setLoading(true);
        setErrorMessage("");

        try {
            const response = await fetchWithBearer(supabase, "/api/bento/member");
            const json = (await response.json()) as ApiData;

            if (!response.ok || !json.ok) {
                throw new Error(json.error ?? "アンケートの取得に失敗しました");
            }

            setData(json);
            setWantsBento(json.response?.wants_bento ?? null);
            setMenuId(json.response?.menu_id ?? "");
            setPickupLocationId(json.response?.pickup_location_id ?? "");
            setOptionText(json.response?.option_text ?? "");
        } catch (error: unknown) {
            setErrorMessage(error instanceof Error ? error.message : String(error));
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        void load();
    }, []);

    async function submit() {
        if (!data?.survey) return;

        if (wantsBento === null) {
            setErrorMessage("お弁当の必要・不要を選択してください");
            return;
        }

        if (wantsBento) {
            if (!menuId) {
                setErrorMessage("お弁当を選択してください");
                return;
            }

            if (!pickupLocationId) {
                setErrorMessage("受取場所を選択してください");
                return;
            }
        }

        setSaving(true);
        setMessage("");
        setErrorMessage("");

        try {
            const response = await fetchWithBearer(supabase, "/api/bento/member", {
                method: "POST",
                body: JSON.stringify({
                    survey_id: data.survey.id,
                    wants_bento: wantsBento,
                    menu_id: wantsBento ? menuId : null,
                    pickup_location_id: wantsBento
                        ? pickupLocationId
                        : null,
                    option_text: wantsBento
                        ? optionText || null
                        : null,
                }),
            });

            const json = (await response.json()) as { ok: boolean; error?: string };
            if (!response.ok || !json.ok) {
                throw new Error(json.error ?? "回答の保存に失敗しました");
            }

            setMessage(
                data.response ? "回答を変更しました。" : "回答を送信しました。",
            );
            await load();
        } catch (error: unknown) {
            setErrorMessage(error instanceof Error ? error.message : String(error));
        } finally {
            setSaving(false);
        }
    }

    async function markAsReceived() {
        if (!data?.survey || !data.response) {
            setErrorMessage("先にアンケートへ回答してください。");
            return;
        }

        const confirmed = window.confirm(
            "お弁当を受け取りましたか？受け取った場合のみOKを押してください。",
        );

        if (!confirmed) {
            return;
        }

        setReceiving(true);
        setMessage("");
        setErrorMessage("");

        try {
            const response = await fetchWithBearer(
                supabase,
                "/api/bento/member",
                {
                    method: "PATCH",
                    body: JSON.stringify({
                        action: "mark_received",
                        survey_id: data.survey.id,
                    }),
                },
            );

            const json = (await response.json()) as {
                ok: boolean;
                error?: string;
                message?: string;
            };

            if (!response.ok || !json.ok) {
                throw new Error(
                    json.error ?? "受取状況の保存に失敗しました",
                );
            }

            setMessage(
                json.message ?? "受取済みとして記録しました。",
            );

            await load();
        } catch (error: unknown) {
            setErrorMessage(
                error instanceof Error
                    ? error.message
                    : "受取状況の保存に失敗しました",
            );
        } finally {
            setReceiving(false);
        }
    }

    if (loading) {
        return <div className="mx-auto max-w-4xl p-6">読み込み中です...</div>;
    }

    if (errorMessage && !data) {
        return (
            <div className="mx-auto max-w-4xl p-6">
                <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-800">
                    {errorMessage}
                </div>
            </div>
        );
    }

    if (!data?.survey) {
        return (
            <div className="mx-auto max-w-4xl p-6">
                <h1 className="mb-4 text-2xl font-bold">お弁当アンケート</h1>
                <div className="rounded-lg border bg-white p-6 text-gray-700">
                    {data?.message ?? "現在回答できるアンケートはありません。"}
                </div>
            </div>
        );
    }

    const survey = data.survey;
    const canEdit = data.can_edit === true;
    const alreadySubmitted = Boolean(data.response);

    return (
        <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
            <div>
                <h1 className="text-2xl font-bold">お弁当アンケート</h1>
                <p className="mt-1 text-sm text-gray-600">対象：member・manager</p>
            </div>

            <section className="rounded-xl border bg-white p-5 shadow-sm">
                <h2 className="text-xl font-bold">{survey.title}</h2>

                <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
                    <div>
                        <dt className="font-semibold text-gray-600">配布日</dt>
                        <dd>{formatDate(survey.event_date)}</dd>
                    </div>
                    <div>
                        <dt className="font-semibold text-gray-600">回答期限</dt>
                        <dd>{formatDateTime(survey.response_deadline)}</dd>
                    </div>
                </dl>

                {survey.description && (
                    <div className="mt-5 whitespace-pre-wrap rounded-lg bg-gray-50 p-4 text-sm leading-7">
                        {survey.description}
                    </div>
                )}

                {survey.notes_payload.noticeText && (
                    <div className="mt-4 whitespace-pre-wrap rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-7">
                        {survey.notes_payload.noticeText}
                    </div>
                )}
            </section>
            <section className="rounded-xl border bg-white p-5 shadow-sm">
                <h2 className="text-lg font-bold">
                    お弁当は必要ですか？
                </h2>

                <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                    <label
                        className={`flex cursor-pointer items-center gap-3 rounded-lg border p-4 ${wantsBento === true
                            ? "border-blue-600 bg-blue-50"
                            : "border-gray-200"
                            } ${!canEdit ? "cursor-not-allowed opacity-75" : ""}`}
                    >
                        <input
                            type="radio"
                            name="wantsBento"
                            checked={wantsBento === true}
                            onChange={() => setWantsBento(true)}
                            disabled={!canEdit}
                        />

                        <span className="font-semibold">必要</span>
                    </label>

                    <label
                        className={`flex cursor-pointer items-center gap-3 rounded-lg border p-4 ${wantsBento === false
                            ? "border-gray-700 bg-gray-100"
                            : "border-gray-200"
                            } ${!canEdit ? "cursor-not-allowed opacity-75" : ""}`}
                    >
                        <input
                            type="radio"
                            name="wantsBento"
                            checked={wantsBento === false}
                            onChange={() => {
                                setWantsBento(false);
                                setMenuId("");
                                setPickupLocationId("");
                                setOptionText("");
                            }}
                            disabled={!canEdit}
                        />

                        <span className="font-semibold">不要</span>
                    </label>
                </div>
            </section>
            <section
                className={`rounded-xl border p-4 ${data.eligibility?.eligible
                    ? "border-green-300 bg-green-50"
                    : "border-red-300 bg-red-50"
                    }`}
            >
                <div className="font-semibold">
                    {data.eligibility?.eligible ? "回答対象です" : "回答対象外です"}
                </div>
                <div className="mt-1 text-sm">{data.eligibility?.reason}</div>
            </section>
            {wantsBento === true && (
                <>
                    <section className="rounded-xl border bg-white p-5 shadow-sm">
                        <h2 className="text-lg font-bold">1. お弁当を選択</h2>

                        <div className="mt-4 grid gap-4 sm:grid-cols-2">
                            {(data.menus ?? []).map((menu) => (
                                <label
                                    key={menu.id}
                                    className={`cursor-pointer overflow-hidden rounded-xl border-2 transition ${menuId === menu.id
                                        ? "border-blue-600 bg-blue-50"
                                        : "border-gray-200 bg-white"
                                        } ${!canEdit ? "cursor-not-allowed opacity-75" : ""}`}
                                >
                                    {menu.image_url && (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            src={menu.image_url}
                                            alt={menu.name}
                                            className="h-44 w-full bg-white object-contain p-2"
                                        />
                                    )}
                                    <div className="flex gap-3 p-4">
                                        <input
                                            type="radio"
                                            name="menu"
                                            value={menu.id}
                                            checked={menuId === menu.id}
                                            onChange={() => setMenuId(menu.id)}
                                            disabled={!canEdit}
                                            className="mt-1"
                                        />
                                        <div>
                                            <div className="font-semibold">{menu.name}</div>
                                            {menu.description && (
                                                <div className="mt-1 whitespace-pre-wrap text-sm text-gray-600">
                                                    {menu.description}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </label>
                            ))}
                        </div>

                        {(data.menus ?? []).length === 0 && (
                            <div className="mt-4 rounded border bg-gray-50 p-4 text-sm text-gray-600">
                                選択できるメニューが登録されていません。
                            </div>
                        )}
                    </section>

                    {survey.notes_payload.options.length > 0 && (
                        <section className="rounded-xl border bg-white p-5 shadow-sm">
                            <h2 className="text-lg font-bold">2. オプションを選択</h2>
                            <select
                                value={optionText}
                                onChange={(event) => setOptionText(event.target.value)}
                                disabled={!canEdit}
                                className="mt-4 w-full rounded-lg border px-3 py-2 disabled:bg-gray-100"
                            >
                                <option value="">オプションなし</option>
                                {survey.notes_payload.options.map((option) => (
                                    <option key={option} value={option}>
                                        {option}
                                    </option>
                                ))}
                            </select>
                        </section>
                    )}

                    <section className="rounded-xl border bg-white p-5 shadow-sm">
                        <h2 className="text-lg font-bold">
                            {survey.notes_payload.options.length > 0 ? "3" : "2"}. 受取場所を選択
                        </h2>

                        <select
                            value={pickupLocationId}
                            onChange={(event) => setPickupLocationId(event.target.value)}
                            disabled={!canEdit}
                            className="mt-4 w-full rounded-lg border px-3 py-2 disabled:bg-gray-100"
                        >
                            <option value="">受取場所を選択してください</option>
                            {(data.pickup_locations ?? []).map((location) => (
                                <option key={location.id} value={location.id}>
                                    {location.name}
                                </option>
                            ))}
                        </select>
                    </section>

                </>
            )}

            {wantsBento === false && (
                <section className="rounded-xl border bg-gray-50 p-5 text-sm text-gray-700">
                    お弁当は「不要」で回答します。
                    <br />
                    メニュー・オプション・受取場所の選択は必要ありません。
                </section>
            )}

            {alreadySubmitted && (
                <section className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm">
                    <div className="font-semibold">回答済みです</div>
                    <div className="mt-1">
                        回答日時：{formatDateTime(data.response!.submitted_at)}
                    </div>
                    {!survey.allow_edit_after_submit && (
                        <div className="mt-1">
                            このアンケートは回答後の変更ができません。
                        </div>
                    )}
                </section>
            )}

            {message && (
                <div className="rounded-lg border border-green-300 bg-green-50 p-3 text-green-800">
                    {message}
                </div>
            )}

            {errorMessage && (
                <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-red-800">
                    {errorMessage}
                </div>
            )}

            <button
                type="button"
                onClick={submit}
                disabled={
                    !canEdit ||
                    saving ||
                    wantsBento === null ||
                    (wantsBento === true &&
                        (!menuId || !pickupLocationId))
                }
                className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-400"
            >
                {saving
                    ? "保存中..."
                    : alreadySubmitted
                        ? "回答を変更する"
                        : "この内容で回答する"}
            </button>

            {alreadySubmitted &&
                data.response?.wants_bento === true && (
                    <div className="mt-4 space-y-2">
                        {data.response?.received_at ? (
                            <div className="rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-center font-semibold text-green-800">
                                お弁当は受取済みです
                                <div className="mt-1 text-xs font-normal">
                                    受取日時：{formatDateTime(data.response.received_at)}
                                </div>
                            </div>
                        ) : (
                            <button
                                type="button"
                                onClick={() => void markAsReceived()}
                                disabled={receiving}
                                className="w-full rounded-lg bg-green-600 px-4 py-3 font-semibold text-white hover:bg-green-700 disabled:bg-gray-400"
                            >
                                {receiving
                                    ? "保存中..."
                                    : "お弁当を受け取りました"}
                            </button>
                        )}

                        <p className="text-center text-xs text-gray-500">
                            実際に受け取った後に押してください。
                        </p>
                    </div>
                )}

            {!canEdit && (
                <div className="text-center text-sm text-gray-600">
                    {data.deadline_passed
                        ? "回答期限を過ぎています。"
                        : (data.eligibility?.reason ?? "現在は回答できません。")}
                </div>
            )}
        </div>
    );
}