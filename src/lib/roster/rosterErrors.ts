import type { RosterShiftDialogData } from "@/types/roster";

export const formatRosterErrorYearMonth = (value: string) => {
  const match = value.match(/^(\d{4})-(\d{2})$/);
  if (!match) return value;

  return `${match[1]}年${Number(match[2])}月`;
};

export const hasRosterIssues = (shift: RosterShiftDialogData) =>
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

  return `/portal/disability-check?${params.toString()}`;
};
