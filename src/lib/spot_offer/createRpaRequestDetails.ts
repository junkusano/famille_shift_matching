type CreateRpaRequestDetailsParams = {
  selectedTemplate: Record<string, unknown>;
  form: Record<string, unknown>;
  shift: Record<string, unknown> | null;
  shiftStartDate: unknown;
  start: unknown;
  end: unknown;
  breakStart: unknown;
  breakEnd: unknown;
  userData: Record<string, unknown>;

  clientName?: unknown;

  mergedShiftIds?: unknown[];
  mergedServiceCodes?: unknown[];
};

function normalizeTextForPadJson(value: unknown): unknown {
  if (typeof value !== "string") return value ?? null;

  return value
    .replace(/"/g, "'")
    .replace(/\\/g, "/")
    .replace(/\r?\n/g, " ")
    .trim();
}

export function createRpaRequestDetails({
  selectedTemplate,
  form,
  shift,
  shiftStartDate,
  start,
  end,
  userData,
  clientName,
  mergedShiftIds,
  mergedServiceCodes,
}: CreateRpaRequestDetailsParams) {

  return {
    core_id: selectedTemplate["core_id"],
    created_from: "/portal/roster/daily",

    shift_id: form["shift_id"],
    kaipoke_cs_id: shift?.["kaipoke_cs_id"] ?? null,
    client_name: normalizeTextForPadJson(clientName),

    merged_shift_ids: mergedShiftIds ?? [form["shift_id"]],
    merged_service_codes: mergedServiceCodes ?? [shift?.["service_code"] ?? null],
    is_merged_shift:
      Array.isArray(mergedShiftIds) && mergedShiftIds.length > 1,

    shift_start_date:
      typeof shiftStartDate === "string" ? shiftStartDate.trim() : shiftStartDate,
    shift_start_time:
  typeof start === "string" ? start : "",

shift_end_time:
  typeof end === "string" ? end : "",

break_start_time: null,
break_end_time: null,

    requester_user_id: userData["user_id"],

    template_title: normalizeTextForPadJson(selectedTemplate["template_title"]),
    work_address: normalizeTextForPadJson(selectedTemplate["work_address"]),
    salary: normalizeTextForPadJson(selectedTemplate["salary"]),
    fare: normalizeTextForPadJson(selectedTemplate["fare"]),
    status: normalizeTextForPadJson(selectedTemplate["status"]),
  };
}