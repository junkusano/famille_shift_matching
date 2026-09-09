export type PerformanceScoreScheme = "current" | "new";

export type PerformanceBadge = {
    name: "ブロンズ" | "シルバー" | "ゴールド" | "プラチナ" | "ミスリル" | "オリハルコン" | "アダマンタイト";
    minimumScore: number;
    hourlyWageBonus: number;
    icon: string;
    pillClass: string;
    panelClass: string;
};

const CURRENT_BADGES: readonly PerformanceBadge[] = [
    { name: "プラチナ", minimumScore: 100, hourlyWageBonus: 30, icon: "🏆", pillClass: "border-purple-300 bg-purple-50 text-purple-800", panelClass: "border-purple-200 bg-purple-50" },
    { name: "ゴールド", minimumScore: 80, hourlyWageBonus: 20, icon: "🥇", pillClass: "border-amber-300 bg-amber-50 text-amber-800", panelClass: "border-amber-200 bg-amber-50" },
    { name: "シルバー", minimumScore: 60, hourlyWageBonus: 10, icon: "🥈", pillClass: "border-slate-300 bg-slate-50 text-slate-700", panelClass: "border-slate-200 bg-slate-50" },
    { name: "ブロンズ", minimumScore: Number.NEGATIVE_INFINITY, hourlyWageBonus: 0, icon: "🥉", pillClass: "border-orange-300 bg-orange-50 text-orange-800", panelClass: "border-orange-200 bg-orange-50" },
];

const NEW_BADGES: readonly PerformanceBadge[] = [
    { name: "アダマンタイト", minimumScore: 170, hourlyWageBonus: 60, icon: "💎", pillClass: "border-cyan-300 bg-gradient-to-r from-slate-950 via-indigo-950 to-cyan-950 text-cyan-100 shadow-lg shadow-cyan-200", panelClass: "border-cyan-300 bg-gradient-to-br from-slate-950 via-indigo-950 to-cyan-900 text-white" },
    { name: "オリハルコン", minimumScore: 150, hourlyWageBonus: 50, icon: "🌟", pillClass: "border-emerald-300 bg-gradient-to-r from-emerald-950 to-teal-800 text-emerald-50 shadow-md", panelClass: "border-emerald-300 bg-gradient-to-br from-emerald-950 to-teal-800 text-white" },
    { name: "ミスリル", minimumScore: 130, hourlyWageBonus: 40, icon: "✨", pillClass: "border-sky-300 bg-gradient-to-r from-sky-100 via-white to-indigo-100 text-indigo-900 shadow-sm", panelClass: "border-sky-300 bg-gradient-to-br from-sky-50 to-indigo-100" },
    { name: "プラチナ", minimumScore: 110, hourlyWageBonus: 30, icon: "🏆", pillClass: "border-purple-300 bg-purple-50 text-purple-800", panelClass: "border-purple-200 bg-purple-50" },
    { name: "ゴールド", minimumScore: 90, hourlyWageBonus: 20, icon: "🥇", pillClass: "border-amber-300 bg-amber-50 text-amber-800", panelClass: "border-amber-200 bg-amber-50" },
    { name: "シルバー", minimumScore: 70, hourlyWageBonus: 10, icon: "🥈", pillClass: "border-slate-300 bg-slate-50 text-slate-700", panelClass: "border-slate-200 bg-slate-50" },
    { name: "ブロンズ", minimumScore: Number.NEGATIVE_INFINITY, hourlyWageBonus: 0, icon: "🥉", pillClass: "border-orange-300 bg-orange-50 text-orange-800", panelClass: "border-orange-200 bg-orange-50" },
];

export function getPerformanceBadge(score: number, scheme: PerformanceScoreScheme): PerformanceBadge {
    const badges = scheme === "new" ? NEW_BADGES : CURRENT_BADGES;
    return badges.find((badge) => score >= badge.minimumScore) ?? badges[badges.length - 1];
}

export function getPerformanceBadgeDefinitions(scheme: PerformanceScoreScheme) {
    return scheme === "new" ? NEW_BADGES : CURRENT_BADGES;
}

export function isNewPerformanceSchemeOfficial(targetMonth: string) {
    return targetMonth.slice(0, 10) >= "2026-10-01";
}

export function isPerformanceBadgeSilverOrHigher(name: string) {
    return ["シルバー", "ゴールド", "プラチナ", "ミスリル", "オリハルコン", "アダマンタイト"]
        .includes(name.trim());
}
