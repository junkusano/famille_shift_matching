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
};

export function createRpaRequestDetails({
  selectedTemplate,
  form,
  shift,
  shiftStartDate,
  start,
  end,
  breakStart,
  breakEnd,
  userData,
}: CreateRpaRequestDetailsParams) {
  return {
    core_id: selectedTemplate["core_id"],
    created_from: "/portal/roster/daily",

    shift_id: form["shift_id"],
    kaipoke_cs_id: shift?.["kaipoke_cs_id"] ?? null,

    shift_start_date:
      typeof shiftStartDate === "string" ? shiftStartDate.trim() : shiftStartDate,
    shift_start_time:
  typeof start === "string" ? start : "",

shift_end_time:
  typeof end === "string" ? end : "",

break_start_time:
  typeof breakStart === "string" ? breakStart : null,

break_end_time:
  typeof breakEnd === "string" ? breakEnd : null,

    requester_user_id: userData["user_id"],

    template_title: selectedTemplate["template_title"] ?? null,
    work_address: selectedTemplate["work_address"] ?? null,
    salary: selectedTemplate["salary"] ?? null,
    fare: selectedTemplate["fare"] ?? null,
    status: selectedTemplate["status"] ?? null,
  };
}