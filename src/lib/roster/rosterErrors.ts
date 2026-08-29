export type RosterIssueFlags = {
  has_roster_error?: boolean | null;
  roster_error_visit_record?: boolean | null;
  roster_error_actual_record?: boolean | null;
  roster_error_actual_record_months?: string[] | null;
  roster_error_care_consultant?: boolean | null;
  roster_error_transport_info?: boolean | null;
  roster_error_kodoengo_plan?: boolean | null;
};

export const formatRosterErrorYearMonth = (value: string) => {
  const match = value.match(/^(\d{4})-(\d{2})$/);
  if (!match) return value;

  return `${match[1]}年${Number(match[2])}月`;
};

export const hasRosterIssues = (shift: RosterIssueFlags) =>
  Boolean(
    shift.has_roster_error ||
      shift.roster_error_visit_record ||
      shift.roster_error_actual_record ||
      shift.roster_error_care_consultant ||
      shift.roster_error_transport_info ||
      shift.roster_error_kodoengo_plan,
  );

export const buildDisabilityCheckHref = (
  yearMonth: string,
  kaipokeCsId: string | number | undefined,
) => {
  const params = new URLSearchParams({
    ym: yearMonth,
    kaipoke_cs_id: String(kaipokeCsId ?? ""),
    check: "unsubmitted",
  });

  return `/portal/disability-check-beta?${params.toString()}`;
};

export const buildVisitRecordHref = (
  date: string,
  kaipokeCsId: string | number | undefined,
  userId?: string | null,
) => {
  const params = new URLSearchParams();
  if (userId) params.set("user_id", userId);
  params.set("client", String(kaipokeCsId ?? ""));
  params.set("date", date);
  params.set("per", "50");
  params.set("page", "1");

  return `/portal/shift-view-beta?${params.toString()}`;
};
