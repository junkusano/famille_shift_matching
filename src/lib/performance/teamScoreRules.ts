export const TEAM_SERVICE_HOURS_UNIT = 10;
export const TEAM_SERVICE_HOURS_POINTS_PER_UNIT = 1;
export const TEAM_SERVICE_HOURS_MAX_SCORE = 20;
export const TEAM_VISIT_CURRENT_PENALTY_PER_ITEM = 1;
export const TEAM_VISIT_PAST_PENALTY_PER_ITEM = 5;
export const TEAM_RENEWAL_PENALTY_PER_ITEM = 5;

export function calculateTeamServiceHoursScore(growthHours: number) {
    const score = Math.trunc(growthHours / TEAM_SERVICE_HOURS_UNIT)
        * TEAM_SERVICE_HOURS_POINTS_PER_UNIT;
    return Math.min(TEAM_SERVICE_HOURS_MAX_SCORE, score);
}

export function calculateTeamVisitRecordScore(
    currentMonthIncompleteCount: number,
    pastIncompleteCount: number,
) {
    return -(currentMonthIncompleteCount * TEAM_VISIT_CURRENT_PENALTY_PER_ITEM)
        - (pastIncompleteCount * TEAM_VISIT_PAST_PENALTY_PER_ITEM);
}

export function calculateTeamRenewalScore(incompleteCount: number) {
    return -(incompleteCount * TEAM_RENEWAL_PENALTY_PER_ITEM);
}
