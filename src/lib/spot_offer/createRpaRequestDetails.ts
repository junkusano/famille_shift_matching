type CreateRpaRequestDetailsParams = {
  selectedTemplate: Record<string, unknown>;
  form: Record<string, unknown>;
  shift: Record<string, unknown> | null;
  shiftStartDate: string;
  start: string;
  end: string;
  breakStart: string | null;
  breakEnd: string | null;
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
    shift_start_time: start,
    shift_end_time: end,
    break_start_time: breakStart,
    break_end_time: breakEnd,

    requester_user_id: userData["user_id"],

    template_title: selectedTemplate["template_title"] ?? null,
    work_address: selectedTemplate["work_address"] ?? null,
    salary: selectedTemplate["salary"] ?? null,
    fare: selectedTemplate["fare"] ?? null,
    status: selectedTemplate["status"] ?? null,
  };
}