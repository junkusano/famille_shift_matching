//"C:\Users\サービスサポート\famille_shift_matching\src\components\portal\PerformanceScoreCard.tsx"
"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";

type ScoreMetric = {
    key: string;
    label: string;
    score: number;
    maxScore: number;
    note: string;
    linkUrl?: string;
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
    badge: string;
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

type Props = {
    syncUrl?: boolean;
    showBackLink?: boolean;
    fullPage?: boolean;
};

function PerformanceScorePanelContent({
    syncUrl = false,
    showBackLink = false,
}: Props) {
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

            if (selectedUserId) params.set("user_id", selectedUserId);
            if (selectedMonth) params.set("ym", selectedMonth);

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

            if (!selectedUserId) setSelectedUserId(json.userId);
            if (!selectedMonth) setSelectedMonth(json.month);

            setLoading(false);
        };

        void load();
    }, [selectedUserId, selectedMonth]);

    useEffect(() => {
        if (!syncUrl) return;

        const params = new URLSearchParams();

        if (selectedMonth) params.set("ym", selectedMonth);
        if (selectedUserId) params.set("user_id", selectedUserId);

        const query = params.toString();

        router.replace(
            query
                ? `/portal?${query}`
                : "/portal"
        );
    }, [selectedMonth, selectedUserId, router, syncUrl]);

    const badgeIcon =
        score?.badge === "プラチナ"
            ? "🏆"
            : score?.badge === "ゴールド"
                ? "🥇"
                : score?.badge === "シルバー"
                    ? "🥈"
                    : score?.badge === "ブロンズ"
                        ? "🥉"
                        : "🏅";

    const badgeClass =
        score?.badge === "プラチナ"
            ? "border-purple-300 bg-purple-50 text-purple-700"
            : score?.badge === "ゴールド"
                ? "border-yellow-300 bg-yellow-50 text-yellow-700"
                : score?.badge === "シルバー"
                    ? "border-slate-300 bg-slate-50 text-slate-700"
                    : score?.badge === "ブロンズ"
                        ? "border-orange-300 bg-orange-50 text-orange-700"
                        : "border-gray-300 bg-gray-50 text-gray-700";

    const chartPoints = score?.scoreHistory ?? [];

    const getProgressPercent = (m: ScoreMetric) => {
        if (m.maxScore <= 0) return 0;
        return Math.max(
            0,
            Math.min(100, Math.round((m.score / m.maxScore) * 100))
        );
    };

    const getServiceHoursFromNote = (note: string) => {
        const match = note.match(/([\d.]+)時間/);
        return match ? Number(match[1]) : 0;
    };

    const getServiceNextMessage = (note: string) => {
        const currentHours = getServiceHoursFromNote(note);

        if (currentHours >= 160) {
            return "160時間達成！サービス時間は満点です！";
        }

        const nextHours = Math.floor(currentHours / 20) * 20 + 20;
        const remain = nextHours - currentHours;

        return `あと${remain.toFixed(1).replace(/\.0$/, "")}時間で10ポイント追加`;
    };

    const chartWidth = 640;
    const chartHeight = 240;
    const paddingX = 48;
    const paddingY = 36;
    const maxScoreForChart = Math.max(
        100,
        ...chartPoints.map((p) => p.score)
    );

    const getMetricDescription = (key: string) => {
        switch (key) {
            case "service_hours":
                return "20時間ごとに10点加算（160時間で80点満点）";
            case "shift_decline_penalty":
                return "シフト開始6時間以内は1件10点減点、3日以内は1件5点減点（勘案すべき事情がある場合はマネージャーに相談してください）";
            case "visit_record":
                return "30点 − 過去未完了1件につき5点";
            case "meeting":
                return "前月会議参加、または翌月10日までの追加開催で10点";
            case "jisseki":
                return "実績記録完了点20点 − 過去未完了1件につき5点";
            case "training_goal":
                return "当月選択した目標・研修を視聴完了すると1件5点（最大20点）";
            default:
                return "";
        }
    };

    const toX = (index: number) => {
        if (chartPoints.length <= 1) return chartWidth / 2;
        return (
            paddingX +
            (index * (chartWidth - paddingX * 2)) /
            (chartPoints.length - 1)
        );
    };

    const toY = (scoreValue: number) => {
        return (
            chartHeight -
            paddingY -
            (scoreValue / maxScoreForChart) * (chartHeight - paddingY * 2)
        );
    };

    const scoreLinePoints = chartPoints
        .map((point, index) => `${toX(index)},${toY(point.score)}`)
        .join(" ");

    return (
        <div className="mx-auto max-w-4xl space-y-6">
            <div className="flex items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold">
                        パフォーマンススコア
                    </h1>

                    <div className="mt-4 rounded-2xl border-2 border-yellow-300 bg-yellow-50 p-4 shadow-sm">
                        <div className="mb-2 text-lg font-bold text-yellow-800">
                            メダルランク制度
                        </div>

                        <div className="space-y-1 text-sm font-medium text-yellow-900">
                            <div>🏆 プラチナ（100点以上） → 時給30円UP</div>
                            <div>🥇 ゴールド（80点以上） → 時給20円UP</div>
                            <div>🥈 シルバー（60点以上） → 時給10円UP</div>
                            <div>🥉 ブロンズ（60点未満） → 時給UPなし</div>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col gap-3">
                    {score && (
                        <div className="rounded-lg border bg-white p-4 shadow-sm">
                            <label className="mb-1 block text-sm font-semibold">
                                表示する年月
                            </label>

                            <select
                                className="w-full rounded border px-3 py-2 text-sm"
                                value={selectedMonth}
                                onChange={(e) =>
                                    setSelectedMonth(e.target.value)
                                }
                            >
                                {score.monthOptions.map((month) => (
                                    <option
                                        key={month.value}
                                        value={month.value}
                                    >
                                        {month.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    {score && score.members.length > 1 && (
                        <div className="rounded-lg border bg-white p-4 shadow-sm">
                            <label className="mb-1 block text-sm font-semibold">
                                表示する従業員
                            </label>

                            <select
                                className="w-full rounded border px-3 py-2 text-sm"
                                value={selectedUserId}
                                onChange={(e) =>
                                    setSelectedUserId(e.target.value)
                                }
                            >
                                {score.members.map((member) => (
                                    <option
                                        key={member.userId}
                                        value={member.userId}
                                    >
                                        {member.name || member.userId}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    {showBackLink && (
                        <Link
                            href="/portal"
                            className="text-sm text-blue-600 hover:underline"
                        >
                            ポータルへ戻る
                        </Link>
                    )}
                </div>
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
                            <div className="text-sm text-gray-500">
                                {score.month}
                            </div>

                            <div className="mt-1 text-xl font-bold">
                                {score.userName || "ログインユーザー"} さんの成績
                            </div>

                            <div className="mt-1 text-xs text-slate-500">
                                ※ スコア・ランキングは2時間毎に自動更新されます
                            </div>
                        </div>

                        <div className="text-left sm:text-right">
                            <div className="text-right">
                                <div className="text-sm font-bold text-slate-500">
                                    合計
                                </div>
                                <div>
                                    <span className="text-5xl font-black text-blue-700">
                                        {score.totalScore}
                                    </span>
                                    <span className="ml-2 text-2xl font-bold text-slate-700">
                                        点
                                    </span>
                                </div>
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
                        {score.metrics
                            .filter((m) => m.key !== "jisseki_team_bonus")
                            .map((m) => {
                                const percent = getProgressPercent(m);

                                return (
                                    <div
                                        key={m.key}
                                        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                                    >
                                        <div className="mb-3 flex items-start justify-between gap-3">
                                            <div>
                                                {m.linkUrl ? (
                                                    <Link
                                                        href={m.linkUrl}
                                                        className="text-base font-bold text-blue-600 hover:underline"
                                                    >
                                                        {m.label}
                                                    </Link>
                                                ) : (
                                                    <div className="text-base font-bold text-slate-900">
                                                        {m.label}
                                                    </div>
                                                )}

                                                <div className="mt-1 text-xs text-slate-500">
                                                    {m.note}
                                                </div>

                                                <div className="mt-1 text-xs font-medium text-blue-600">
                                                    {getMetricDescription(m.key)}
                                                </div>

                                                {m.key === "jisseki" && (
                                                    <div className="mt-2 text-[11px] leading-5 text-slate-600">
                                                        実績記録の担当者は、直近のシフト実績をもとに自動で割り当てられています。
                                                        回収が難しい場合は、一人で抱え込まず、早めにマネジャーへ担当変更をご相談ください。
                                                        <br />
                                                        📖
                                                        <a
                                                            href="https://board.worksmobile.com/main/article/4090000000171483974?searchKind=basic&keyword=%E5%AE%9F%E7%B8%BE%E8%A8%98%E9%8C%B2&boardNo=0&t=28160&isSearch=true"
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="ml-1 font-semibold text-blue-600 underline hover:text-blue-800"
                                                        >
                                                            実績記録印刷マニュアルはこちら
                                                        </a>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="shrink-0 text-right">
                                                <span className="text-3xl font-black text-blue-700">
                                                    {m.score}
                                                </span>
                                                <span className="ml-1 text-sm font-bold text-slate-600">
                                                    点
                                                </span>
                                            </div>
                                        </div>

                                        <div className="h-4 overflow-hidden rounded-full bg-slate-200">
                                            <div
                                                className="h-full rounded-full bg-gradient-to-r from-gray-300 via-blue-300 to-blue-700 transition-all"
                                                style={{ width: `${percent}%` }}
                                            />
                                        </div>

                                        {m.key === "service_hours" && (
                                            <div className="mt-4">
                                                <div className="relative h-8">
                                                    {[
                                                        20, 40, 60, 80, 100, 120,
                                                        140, 160,
                                                    ].map((hour) => (
                                                        <div
                                                            key={hour}
                                                            className="absolute top-0 -translate-x-1/2 text-center text-[10px] text-slate-500"
                                                            style={{
                                                                left: `${(hour / 160) * 100}%`,
                                                            }}
                                                        >
                                                            <div className="mx-auto mb-1 h-2 w-px bg-slate-300" />
                                                            {hour}h
                                                        </div>
                                                    ))}
                                                </div>

                                                <div className="mt-2 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700">
                                                    {getServiceNextMessage(m.note)}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                    </div>

                    <div className="mt-6">
                        <div className="mb-3 text-lg font-bold text-blue-950">
                            ランキング TOP100
                        </div>

                        <div className="space-y-2">
                            {score.topRanking.slice(0, 100).map((user) => {
                                const isTop3 = user.rank <= 3;

                                return (
                                    <div
                                        key={user.userId}
                                        className={`flex items-center justify-between rounded-xl border bg-white px-4 py-3 shadow-sm ${isTop3
                                            ? "border-yellow-300"
                                            : "border-gray-200"
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

                                        <div
                                            className={`rounded-full px-3 py-1 text-xs font-bold ${user.badge === "プラチナ"
                                                ? "bg-slate-900 text-white"
                                                : user.badge === "ゴールド"
                                                    ? "bg-yellow-100 text-yellow-800"
                                                    : user.badge === "シルバー"
                                                        ? "bg-gray-100 text-gray-700"
                                                        : user.badge ===
                                                            "ブロンズ"
                                                            ? "bg-orange-100 text-orange-800"
                                                            : "bg-gray-100 text-gray-700"
                                                }`}
                                        >
                                            {user.badge === "プラチナ"
                                                ? "🏆 プラチナ"
                                                : user.badge === "ゴールド"
                                                    ? "🥇 ゴールド"
                                                    : user.badge === "シルバー"
                                                        ? "🥈 シルバー"
                                                        : user.badge === "ブロンズ"
                                                            ? "🥉 ブロンズ"
                                                            : user.badge}
                                        </div>
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
                                                <circle
                                                    cx={x}
                                                    cy={y}
                                                    r="5"
                                                    fill="#2563EB"
                                                />

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
                                                    {point.rank
                                                        ? `${point.rank}位`
                                                        : "-"}
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
    );
}

export default function PerformanceScorePanel(props: Props) {
    const content = (
        <Suspense
            fallback={
                <div className="mx-auto max-w-4xl rounded-lg border bg-white p-6 shadow-sm">
                    読み込み中です。
                </div>
            }
        >
            <PerformanceScorePanelContent {...props} />
        </Suspense>
    );

    if (props.fullPage) {
        return (
            <main className="min-h-screen bg-gray-50 px-4 py-8 text-gray-800">
                {content}
            </main>
        );
    }

    return <div className="text-gray-800">{content}</div>;
}