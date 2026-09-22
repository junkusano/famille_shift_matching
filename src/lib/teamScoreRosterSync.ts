export function resolveLatestTeamOrgunitId(
    latestTeamByUserId: ReadonlyMap<string, string | null>,
    userId: string,
    savedTeamOrgunitId: string | null | undefined,
) {
    if (latestTeamByUserId.has(userId)) {
        return latestTeamByUserId.get(userId) ?? null;
    }

    return savedTeamOrgunitId ?? null;
}

export function findStaleTeamSummaryIds(
    existingTeamIds: Iterable<string>,
    currentTeamIds: Iterable<string>,
) {
    const currentTeamIdSet = new Set(currentTeamIds);

    return Array.from(new Set(existingTeamIds)).filter(
        (teamId) => !currentTeamIdSet.has(teamId),
    );
}
