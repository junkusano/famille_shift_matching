"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";

type ScoreMetric = {
    key: string;
    label: string;
    score: number;
    note: string;
};

type MemberOption = {
    userId: string;
    name: string;
};

type MonthOption = {
    value: string;
    label: string;
};

type PortalScore = {
    month: string;
    monthOptions: MonthOption[];
    userId: string;
    userName: string;
    totalScore: number;
    badge: string;
    metrics: ScoreMetric[];
    members: MemberOption[];
};

export default function MyScorePreviewPage() {
    const [score, setScore] = useState<PortalScore | null>(null);
    const [selectedUserId, setSelectedUserId] = useState("");
    const [selectedMonth, setSelectedMonth] = useState("");
    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState("");

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            setErrorMessage("");

            const { data } = await supabase.auth.getSession();
            const token = data.session?.access_token;

            if (!token) {
                setErrorMessage("ログイン情報が確認できませんでした。");
                setLoading(false);
                return;
            }

            const params = new URLSearchParams();

            if (selectedUserId) {
                params.set("user_id", selectedUserId);
            }

            if (selectedMonth) {
                params.set("month", selectedMonth);
            }

            const query = params.toString() ? `?${params.toString()}` : "";

            const res = await fetch(`/api/portal/my-score${query}`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            if (!res.ok) {
                setErrorMessage("成績情報を取得できませんでした。");
                setLoading(false);
                return;
            }

            const json = (await res.json()) as PortalScore;
            setScore(json);

            if (!selectedUserId) {
                setSelectedUserId(json.userId);
            }

            if (!selectedMonth) {
                setSelectedMonth(json.month);
            }

            setLoading(false);
        };

        load();
    }, [selectedUserId, selectedMonth]);

    const badgeClass =
        score?.badge === "ゴールド"
            ? "bg-yellow-100 text-yellow-800 border-yellow-300"
            : score?.badge === "シルバー"
                ? "bg-gray-100 text-gray-800 border-gray-300"
                : score?.badge === "ブロンズ"
                    ? "bg-orange-100 text-orange-800 border-orange-300"
                    : "bg-white text-gray-700 border-gray-300";

    return (
        <main className="min-h-screen bg-gray-50 px-4 py-8 text-gray-800">
            <div className="mx-auto max-w-4xl space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold">成績プレビュー</h1>
                        <p className="text-sm text-gray-500">
                            member用の確認ページです。ポータル本体にはまだ表示していません。
                        </p>
                    </div>

                    {score && (
                        <div className="rounded-lg border bg-white p-4 shadow-sm">
                            <div className="grid gap-3 sm:grid-cols-2">
                                <div>
                                    <label className="mb-1 block text-sm font-semibold">
                                        表示する年月
                                    </label>

                                    <select
                                        className="w-full rounded border px-3 py-2 text-sm"
                                        value={selectedMonth}
                                        onChange={(e) => {
                                            setSelectedMonth(e.target.value);
                                        }}
                                    >
                                        {score.monthOptions.map((month) => (
                                            <option key={month.value} value={month.value}>
                                                {month.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="mb-1 block text-sm font-semibold">
                                        表示する従業員
                                    </label>

                                    <select
                                        className="w-full rounded border px-3 py-2 text-sm"
                                        value={selectedUserId}
                                        onChange={(e) => {
                                            setSelectedUserId(e.target.value);
                                        }}
                                    >
                                        {score.members.map((member) => (
                                            <option key={member.userId} value={member.userId}>
                                                {member.name || member.userId}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="mt-2 text-xs text-red-500">
                                ※ 今だけの確認用です。リリース時は削除してください。
                            </div>
                        </div>
                    )}

                    <Link href="/portal" className="text-sm text-blue-600 hover:underline">
                        ポータルへ戻る
                    </Link>
                </div>

                {loading && (
                    <div className="rounded-lg border bg-white p-6 shadow-sm">
                        読み込み中です。
                    </div>
                )}

                {errorMessage && (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-700">
                        {errorMessage}
                    </div>
                )}

                {score && (
                    <div className="rounded-lg border bg-white p-6 shadow-sm">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <div className="text-sm text-gray-500">{score.month}</div>
                                <div className="mt-1 text-xl font-bold">
                                    {score.userName || "ログインユーザー"} さんの成績
                                </div>
                            </div>

                            <div className="text-left sm:text-right">
                                <div className="text-4xl font-bold">{score.totalScore}点</div>
                                <div
                                    className={`mt-2 inline-block rounded-full border px-4 py-1 text-sm font-semibold ${badgeClass}`}
                                >
                                    {score.badge}
                                </div>
                            </div>
                        </div>

                        <div className="mt-6 space-y-5">
                            {score.metrics.map((m) => (
                                <div key={m.key}>
                                    <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                                        <span className="font-semibold">{m.label}</span>
                                        <span className="text-right text-gray-500">{m.note}</span>
                                    </div>

                                    <div className="h-4 overflow-hidden rounded-full bg-gray-200">
                                        <div
                                            className="h-full rounded-full bg-blue-500"
                                            style={{
                                                width: `${Math.max(0, Math.min(100, m.score))}%`,
                                            }}
                                        />
                                    </div>

                                    <div className="mt-1 text-right text-xs text-gray-500">
                                        {m.score}点
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="mt-6 rounded bg-gray-50 p-3 text-xs text-gray-500">
                            ※ バッジは保存して固定するのではなく、現在のスコアから毎回自動判定します。
                            そのためスコアが下がるとバッジも自動的に下がります。
                        </div>
                    </div>
                )}
            </div>
        </main>
    );
}