"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";

type ScoreMetric = {
    key: string;
    label: string;
    score: number;
    maxScore: number;
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

type Ranking = {
    rank: number | null;
    totalMembers: number;
};

type RankingUser = {
    rank: number;
    userId: string;
    score: number;
    name: string;
};

type ScoreHistoryPoint = {
    month: string;
    label: string;
    score: number;
    rank: number | null;
};

type PortalScore = {
    month: string;
    monthOptions: MonthOption[];
    userId: string;
    userName: string;
    totalScore: number;
    totalMaxScore: number;
    badge: string;
    metrics: ScoreMetric[];
    members: MemberOption[];
    ranking: Ranking;
    topRanking: RankingUser[];
    scoreHistory: ScoreHistoryPoint[];
};

export default function MyScorePreviewPage() {
    const router = useRouter();
    const searchParams = useSearchParams();

    const [score, setScore] = useState<PortalScore | null>(null);
    const [selectedUserId, setSelectedUserId] = useState(
        searchParams.get("user_id") ?? ""
    );

    const [selectedMonth, setSelectedMonth] = useState(
        searchParams.get("ym") ?? ""
    );
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
                params.set("ym", selectedMonth);
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

    useEffect(() => {
        const params = new URLSearchParams();

        if (selectedMonth) {
            params.set("ym", selectedMonth);
        }

        if (selectedUserId) {
            params.set("user_id", selectedUserId);
        }

        const query = params.toString();

        router.replace(query ? `/portal/my-score?${query}` : "/portal/my-score");
    }, [selectedMonth, selectedUserId, router]);

    const badgeIcon =
        score?.badge === "ゴールド"
            ? "🥇"
            : score?.badge === "シルバー"
                ? "🥈"
                : score?.badge === "ブロンズ"
                    ? "🥉"
                    : "🏅";

    const badgeClass =
        score?.badge === "ゴールド"
            ? "bg-yellow-100 text-yellow-800 border-yellow-300"
            : score?.badge === "シルバー"
                ? "bg-gray-100 text-gray-800 border-gray-300"
                : score?.badge === "ブロンズ"
                    ? "bg-orange-100 text-orange-800 border-orange-300"
                    : "bg-white text-gray-700 border-gray-300";

    const chartPoints = score?.scoreHistory ?? [];
    const chartWidth = 640;
    const chartHeight = 240;
    const paddingX = 48;
    const paddingY = 36;
    const maxScoreForChart = Math.max(100, ...chartPoints.map((p) => p.score));

    const toX = (index: number) => {
        if (chartPoints.length <= 1) return chartWidth / 2;
        return paddingX + (index * (chartWidth - paddingX * 2)) / (chartPoints.length - 1);
    };

    const toY = (scoreValue: number) => {
        return chartHeight - paddingY - (scoreValue / maxScoreForChart) * (chartHeight - paddingY * 2);
    };

    const scoreLinePoints = chartPoints
        .map((point, index) => `${toX(index)},${toY(point.score)}`)
        .join(" ");

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
                            <label className="mb-1 block text-sm font-semibold">
                                表示する年月
                            </label>

                            <select
                                className="w-full rounded border px-3 py-2 text-sm sm:max-w-xs"
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
                    )}

                    {score && (
                        <div className="rounded-lg border bg-white p-4 shadow-sm">
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

                            <div className="mt-2 text-xs text-red-500">
                                ※ 従業員切り替えは今だけの確認用です。リリース時は削除してください。
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
                                <div className="text-4xl font-bold">
                                    100点満点中 {score.totalScore}点
                                </div>

                                <div
                                    className={`mt-2 inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold ${badgeClass}`}
                                >
                                    <span className="text-xl">{badgeIcon}</span>
                                    <span>{score.badge}</span>
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
                                                width: `${Math.max(0, Math.min(100, Math.round((m.score / m.maxScore) * 100)))}%`,
                                            }}
                                        />
                                    </div>

                                    <div className="mt-1 text-right text-xs text-gray-500">
                                        {m.maxScore}点中 {m.score}点
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="mt-6">
                            <div className="mb-3 text-lg font-bold text-blue-950">
                                上位ランキング
                            </div>

                            <div className="space-y-2">
                                {score.topRanking.map((user) => {
                                    const isTop3 = user.rank <= 3;

                                    return (
                                        <div
                                            key={user.userId}
                                            className={`flex items-center justify-between rounded-xl border bg-white px-4 py-3 shadow-sm ${isTop3 ? "border-yellow-300" : "border-gray-200"
                                                }`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div
                                                    className={`flex h-10 w-10 items-center justify-center rounded-full font-bold ${user.rank === 1
                                                        ? "bg-yellow-400 text-white"
                                                        : user.rank === 2
                                                            ? "bg-gray-400 text-white"
                                                            : user.rank === 3
                                                                ? "bg-orange-400 text-white"
                                                                : "bg-blue-100 text-blue-900"
                                                        }`}
                                                >
                                                    {user.rank}
                                                </div>

                                                <div>
                                                    <div
                                                        className={`font-bold ${isTop3
                                                            ? "text-xl text-blue-950"
                                                            : "text-base text-gray-900"
                                                            }`}
                                                    >
                                                        {user.name}
                                                    </div>

                                                    <div className="text-xs text-gray-500">
                                                        {user.score}点
                                                    </div>
                                                </div>
                                            </div>

                                            {user.rank === 1 && (
                                                <div className="text-3xl">🥇</div>
                                            )}

                                            {user.rank === 2 && (
                                                <div className="text-3xl">🥈</div>
                                            )}

                                            {user.rank === 3 && (
                                                <div className="text-3xl">🥉</div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="mt-6 rounded-xl border bg-white p-4 shadow-sm">
                            <div className="mb-1 text-lg font-bold text-blue-950">
                                直近6か月の点数・順位
                            </div>

                            <div className="mb-4 text-xs text-gray-500">
                                選択中の年月を含む直近6か月分を表示します。
                            </div>

                            {chartPoints.length === 0 ? (
                                <div className="rounded bg-gray-50 p-4 text-sm text-gray-500">
                                    グラフ表示できる成績履歴がありません。
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <svg
                                        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                                        className="min-w-[640px] rounded-lg bg-gray-50"
                                    >
                                        <line
                                            x1={paddingX}
                                            y1={chartHeight - paddingY}
                                            x2={chartWidth - paddingX}
                                            y2={chartHeight - paddingY}
                                            stroke="#CBD5E1"
                                        />

                                        <line
                                            x1={paddingX}
                                            y1={paddingY}
                                            x2={paddingX}
                                            y2={chartHeight - paddingY}
                                            stroke="#CBD5E1"
                                        />

                                        <polyline
                                            fill="none"
                                            stroke="#2563EB"
                                            strokeWidth="3"
                                            points={scoreLinePoints}
                                        />

                                        {chartPoints.map((point, index) => {
                                            const x = toX(index);
                                            const y = toY(point.score);

                                            return (
                                                <g key={point.month}>
                                                    <circle cx={x} cy={y} r="5" fill="#2563EB" />

                                                    <text
                                                        x={x}
                                                        y={y - 12}
                                                        textAnchor="middle"
                                                        className="fill-gray-700 text-xs font-bold"
                                                    >
                                                        {point.score}点
                                                    </text>

                                                    <text
                                                        x={x}
                                                        y={y + 22}
                                                        textAnchor="middle"
                                                        className="fill-red-600 text-xs font-bold"
                                                    >
                                                        {point.rank ? `${point.rank}位` : "-"}
                                                    </text>

                                                    <text
                                                        x={x}
                                                        y={chartHeight - 10}
                                                        textAnchor="middle"
                                                        className="fill-gray-500 text-xs"
                                                    >
                                                        {point.label}
                                                    </text>
                                                </g>
                                            );
                                        })}
                                    </svg>
                                </div>
                            )}
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