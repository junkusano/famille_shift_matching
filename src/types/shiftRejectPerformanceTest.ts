import type { ServiceKey } from "@/lib/certificateJudge";
import type { ShiftData } from "@/types/shift";

export type RejectRecordStatus = "draft" | "submitted" | "approved" | "archived";

export type RejectPerformanceStaffRow = {
  user_id: string;
  last_name_kanji: string | null;
  first_name_kanji: string | null;
  level_sort: number | null;
};

export type RejectPerformanceShift = ShiftData & {
  basic_information?: string;
  shift_detail_information?: string;
  sms_phone_number?: string | null;
  sms_reply_phone_numbers?: string[];
  time_adjustable?: boolean;
  time_adjust_text?: string;
  time_adjust_advance_hours?: number;
  time_adjust_back_hours?: number;
  record_status?: RejectRecordStatus;
  meal_expense_requested?: boolean;
  has_active_parking?: boolean;
};

export type RejectInitialLoadPerf = {
  totalMs: number;
  dbQueryCount: number;
  timings: Array<{
    stage: string;
    ms: number;
    rows?: number;
    details?: Record<string, unknown>;
  }>;
  counts?: Record<string, number>;
};

export type RejectInitialDataSuccess = {
  ok: true;
  scope: "assigned" | "candidates";
  date: string;
  shifts: RejectPerformanceShift[];
  staffMap: Record<string, RejectPerformanceStaffRow>;
  user: {
    accountId: string;
    kaipokeUserId: string;
    systemRole: string | null;
  };
  myServiceKeys: ServiceKey[] | null;
  perf: RejectInitialLoadPerf;
};

export type RejectMonthCountsSuccess = {
  ok: true;
  scope: "month-counts";
  month: string;
  counts: Record<string, number>;
  perf: RejectInitialLoadPerf;
};

export type RejectInitialDataError = {
  ok: false;
  error: string;
  perf?: Partial<RejectInitialLoadPerf>;
};

export type RejectInitialDataResponse =
  | RejectInitialDataSuccess
  | RejectMonthCountsSuccess
  | RejectInitialDataError;
