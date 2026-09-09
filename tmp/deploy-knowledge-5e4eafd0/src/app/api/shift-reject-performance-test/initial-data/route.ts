import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  determineServicesFromCertificates,
  type DocMasterRow,
  type ServiceKey,
} from "@/lib/certificateJudge";
import { getUserFromBearer } from "@/lib/auth/getUserFromBearer";
import type {
  RejectPerformanceShift,
  RejectPerformanceStaffRow,
  RejectRecordStatus,
} from "@/types/shiftRejectPerformanceTest";
import { normalizeShiftEventAlerts } from "@/lib/shiftEventAlerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const SHIFT_PAGE_SIZE = 1000;
const MAX_ASSIGNED_PAGES = 3;
const MAX_MONTH_PAGES = 10;
const IN_CHUNK_SIZE = 500;
const MEAL_EXPENSE_REQUEST_TYPE_ID = "ceb95336-89c1-4030-a46f-e7acbbc8d901";
const PRIVATE_NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
};

const SHIFT_SELECT = [
  "shift_id",
  "shift_start_date",
  "shift_start_time",
  "shift_end_time",
  "service_code",
  "kaipoke_cs_id",
  "staff_01_user_id",
  "staff_02_user_id",
  "staff_03_user_id",
  "staff_01_level_sort",
  "staff_02_level_sort",
  "staff_03_level_sort",
  "staff_02_attend_flg",
  "staff_03_attend_flg",
  "judo_ido",
  "address",
  "postal_code",
  "estimated_pay_amount",
  "name",
  "gender_request_name",
  "male_flg",
  "female_flg",
  "postal_code_3",
  "district",
  "level_sort_order",
  "require_doc_group",
  "tokutei_comment",
  "spot_offer_status",
  "applicant_name",
  "applicant_sex",
  "applicant_control_url",
].join(",");

type QueryError = { message: string };
type QueryCounter = { count: number };
type PerfTiming = {
  stage: string;
  ms: number;
  rows?: number;
  details?: Record<string, unknown>;
};

type UserRecord = {
  user_id: string | null;
  kaipoke_user_id: string | null;
  system_role: string | null;
};

type ShiftRow = {
  shift_id: string | number | null;
  shift_start_date: string | null;
  shift_start_time: string | null;
  shift_end_time: string | null;
  service_code: string | null;
  kaipoke_cs_id: string | null;
  staff_01_user_id: string | null;
  staff_02_user_id: string | null;
  staff_03_user_id: string | null;
  staff_01_level_sort: number | null;
  staff_02_level_sort: number | null;
  staff_03_level_sort: number | null;
  staff_02_attend_flg: boolean | null;
  staff_03_attend_flg: boolean | null;
  judo_ido: string | number | null;
  address: string | null;
  postal_code: string | null;
  estimated_pay_amount: number | string | null;
  name: string | null;
  gender_request_name: string | null;
  male_flg: boolean | null;
  female_flg: boolean | null;
  postal_code_3: string | null;
  district: string | null;
  commuting_flg?: boolean | null;
  level_sort_order: number | null;
  require_doc_group: string | null;
  tokutei_comment: string | null;
  spot_offer_status: string | null;
  applicant_name: string | null;
  applicant_sex: string | null;
  applicant_control_url: string | null;
};

type ClientInfoRow = {
  kaipoke_cs_id: string;
  asigned_jisseki_staff: string | null;
  address: string | null;
  postal_code: string | null;
  phone_01?: string | null;
  commuting_flg: boolean | null;
  standard_route: string | null;
  standard_trans_ways: string | null;
  standard_purpose: string | null;
  biko: string | null;
  kodoengo_plan_link: string | null;
  time_adjustability_id: string | null;
};

type ManagerContactRow = {
  user_id: string;
  org_mgr_phone: string | null;
};

type ShiftDetailRow = {
  kaipoke_cs_id: string | null;
  shift_detail_information: string | null;
};

type CsDocRow = {
  id: string;
  kaipoke_cs_id: string | null;
  summary: string | null;
  applicable_date: string | null;
  created_at: string | null;
};

type TimeAdjustabilityRow = {
  id: string;
  label: string | null;
  Advance_adjustability: number | string | null;
  Backwoard_adjustability: number | string | null;
};

type ShiftRecordRow = {
  shift_id: string | number;
  status: string;
  updated_at: string | null;
};

type RosterErrorRow = {
  shift_id: string | number;
  roster_error_visit_record: boolean | null;
  roster_error_actual_record: boolean | null;
  roster_error_actual_record_months: string[] | null;
  shift_event_alerts: unknown;
};

type MealExpenseRow = {
  payload: unknown;
};

type ParkingPresenceRow = {
  kaipoke_cs_id: string;
};

type FormEntryRow = { attachments: unknown };

type AttachmentLike = {
  id?: string;
  url?: string;
  label?: string | null;
  type?: string | null;
  mimeType?: string | null;
  uploaded_at?: string | null;
  acquired_at?: string | null;
};

function getSupabaseUrl() {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!value) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured");
  return value;
}

function getSupabaseAnonKey() {
  const value = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!value) throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is not configured");
  return value;
}

function getSupabaseServiceRoleKey() {
  const value = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!value) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  return value;
}

function createUserClient(token: string) {
  return createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

function createServiceClient() {
  return createClient(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

type UserSupabaseClient = ReturnType<typeof createUserClient>;

function elapsed(startedAt: number) {
  return Math.round((performance.now() - startedAt) * 10) / 10;
}

async function timedStage<T>(
  timings: PerfTiming[],
  stage: string,
  run: () => Promise<T>,
  details?: Record<string, unknown>,
): Promise<T> {
  const startedAt = performance.now();
  try {
    const result = await run();
    timings.push({ stage, ms: elapsed(startedAt), details });
    return result;
  } catch (error) {
    timings.push({
      stage,
      ms: elapsed(startedAt),
      details: { ...(details ?? {}), error: error instanceof Error ? error.message : String(error) },
    });
    throw error;
  }
}

async function queryRows<Row>(
  timings: PerfTiming[],
  counter: QueryCounter,
  stage: string,
  run: () => PromiseLike<{ data: unknown; error: QueryError | null }>,
  details?: Record<string, unknown>,
): Promise<Row[]> {
  counter.count += 1;
  const startedAt = performance.now();
  const response = await run();

  if (response.error) {
    timings.push({
      stage,
      ms: elapsed(startedAt),
      details: { ...(details ?? {}), error: response.error.message },
    });
    throw new Error(`${stage}: ${response.error.message}`);
  }

  const rows = Array.isArray(response.data) ? (response.data as Row[]) : [];
  timings.push({ stage, ms: elapsed(startedAt), rows: rows.length, details });
  return rows;
}

async function queryMaybeOne<Row>(
  timings: PerfTiming[],
  counter: QueryCounter,
  stage: string,
  run: () => PromiseLike<{ data: unknown; error: QueryError | null }>,
): Promise<Row | null> {
  counter.count += 1;
  const startedAt = performance.now();
  const response = await run();

  if (response.error) {
    timings.push({ stage, ms: elapsed(startedAt), details: { error: response.error.message } });
    throw new Error(`${stage}: ${response.error.message}`);
  }

  timings.push({ stage, ms: elapsed(startedAt), rows: response.data ? 1 : 0 });
  return (response.data ?? null) as Row | null;
}

function chunkValues(values: Array<string | number>, size = IN_CHUNK_SIZE) {
  const unique = Array.from(new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean)));
  const chunks: string[][] = [];
  for (let index = 0; index < unique.length; index += size) {
    chunks.push(unique.slice(index, index + size));
  }
  return chunks;
}

async function fetchRowsByColumn<Row>(
  sb: UserSupabaseClient,
  timings: PerfTiming[],
  counter: QueryCounter,
  args: {
    stage: string;
    table: string;
    select: string;
    column: string;
    values: Array<string | number>;
    eq?: Array<{ column: string; value: string | number | boolean }>;
    orders?: Array<{ column: string; ascending: boolean; nullsFirst?: boolean }>;
  },
) {
  const chunks = chunkValues(args.values);
  if (chunks.length === 0) return [];

  const rows = await Promise.all(
    chunks.map((chunk, index) =>
      queryRows<Row>(
        timings,
        counter,
        `${args.stage}_${index + 1}`,
        () => {
          let query = sb.from(args.table).select(args.select).in(args.column, chunk);
          for (const filter of args.eq ?? []) query = query.eq(filter.column, filter.value);
          for (const order of args.orders ?? []) {
            query = query.order(order.column, {
              ascending: order.ascending,
              nullsFirst: order.nullsFirst,
            });
          }
          return query;
        },
        { values: chunk.length },
      ),
    ),
  );

  return rows.flat();
}

function isValidDate(value: string | null): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function isValidMonth(value: string | null): value is string {
  return Boolean(value && /^\d{4}-\d{2}$/.test(value));
}

function monthEnd(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return `${month}-${String(lastDay).padStart(2, "0")}`;
}

function numberOrMax(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function numberOrNull(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isCurrentCandidate(shift: ShiftRow) {
  const levelSort = numberOrMax(shift.level_sort_order);
  return shift.staff_01_user_id === "-" || (levelSort < 4_500_000 && levelSort !== 1_250_000);
}

async function fetchPagedShifts(
  sb: UserSupabaseClient,
  timings: PerfTiming[],
  counter: QueryCounter,
  args: {
    dateFrom: string;
    dateTo: string;
    userId?: string;
    maxPages: number;
    stage: string;
  },
) {
  const rows: ShiftRow[] = [];

  for (let page = 0; page < args.maxPages; page += 1) {
    const from = page * SHIFT_PAGE_SIZE;
    const to = from + SHIFT_PAGE_SIZE - 1;
    const pageRows = await queryRows<ShiftRow>(
      timings,
      counter,
      `${args.stage}.page_${page + 1}`,
      () => {
        let query = sb
          .from("shift_self_coordinate_card_view2")
          .select(SHIFT_SELECT)
          .gte("shift_start_date", args.dateFrom)
          .lte("shift_start_date", args.dateTo);

        if (args.userId) {
          query = query.or(
            [
              `staff_01_user_id.eq.${args.userId}`,
              `staff_02_user_id.eq.${args.userId}`,
              `staff_03_user_id.eq.${args.userId}`,
            ].join(","),
          );
        }

        return query
          .order("shift_start_date", { ascending: true })
          .order("shift_start_time", { ascending: true })
          .order("shift_id", { ascending: true })
          .range(from, to);
      },
      { range: `${from}-${to}` },
    );

    rows.push(...pageRows);
    if (pageRows.length < SHIFT_PAGE_SIZE) break;
  }

  return rows;
}

function extractBasicInformation(summary: string) {
  const normalized = summary.replace(/\r\n/g, "\n").trim();
  const match = normalized.match(/【5】基本情報やアセスメント項目\s*([\s\S]*?)(?=\n【\d+】|$)/);
  return match?.[1]?.trim() ?? "";
}

function isCertificateAttachment(attachment: AttachmentLike | null | undefined): attachment is AttachmentLike {
  if (!attachment) return false;
  const type = (attachment.type ?? "").toLowerCase();
  const label = (attachment.label ?? "").toLowerCase();
  return ["資格", "certificate", "certification"].some(
    (keyword) => type.includes(keyword) || label.includes(keyword),
  );
}

async function fetchMyServiceKeys(
  sb: UserSupabaseClient,
  timings: PerfTiming[],
  counter: QueryCounter,
  authUserId: string,
): Promise<ServiceKey[] | null> {
  try {
    const [formEntry, masterRows] = await Promise.all([
      queryMaybeOne<FormEntryRow>(
        timings,
        counter,
        "supabase.form_entries.my_attachments",
        () => sb.from("form_entries").select("attachments").eq("auth_uid", authUserId).maybeSingle(),
      ),
      queryRows<DocMasterRow>(
        timings,
        counter,
        "supabase.user_doc_master.certificates",
        () =>
          sb
            .from("user_doc_master")
            .select("category,label,is_active,sort_order,service_key:doc_group")
            .order("sort_order", { ascending: true }),
      ),
    ]);

    const attachments = Array.isArray(formEntry?.attachments)
      ? (formEntry.attachments as AttachmentLike[])
      : [];
    const certDocs = attachments.filter(isCertificateAttachment).map((attachment) => ({
      id: attachment.id,
      url: attachment.url,
      label: attachment.label ?? null,
      type: "資格証明書",
      mimeType: attachment.mimeType ?? null,
      uploaded_at: attachment.uploaded_at ?? null,
      acquired_at: attachment.acquired_at ?? attachment.uploaded_at ?? null,
    }));

    return determineServicesFromCertificates(certDocs, masterRows) ?? [];
  } catch (error) {
    timings.push({
      stage: "derive.my_service_keys",
      ms: 0,
      details: { error: error instanceof Error ? error.message : String(error) },
    });
    return null;
  }
}

async function fetchMealExpenseRows(
  sb: UserSupabaseClient,
  timings: PerfTiming[],
  counter: QueryCounter,
  shiftIds: string[],
) {
  const chunks = chunkValues(shiftIds);
  if (!chunks.length) return [];

  const rows = await Promise.all(
    chunks.map((chunk, index) =>
      queryRows<MealExpenseRow>(
        timings,
        counter,
        `supabase.wf_request.meal_expenses_${index + 1}`,
        () =>
          sb
            .from("wf_request")
            .select("payload")
            .eq("request_type_id", MEAL_EXPENSE_REQUEST_TYPE_ID)
            .contains("payload", { kind: "meal_expense" })
            .in("payload->>shift_id", chunk),
        { values: chunk.length },
      ),
    ),
  );

  return rows.flat();
}

function payloadShiftId(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const value = (payload as Record<string, unknown>).shift_id;
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function isRecordStatus(value: string): value is RejectRecordStatus {
  return ["draft", "submitted", "approved", "archived"].includes(value);
}

async function hydrateShifts(
  sb: UserSupabaseClient,
  timings: PerfTiming[],
  counter: QueryCounter,
  rawShifts: ShiftRow[],
  authUserId: string,
  includeSmsPhone: boolean,
  includeRosterErrors: boolean,
) {
  // shift_daily_dialog_view は既存の1回だけ取得する。一般スタッフへは、このAPIで
  // 本人に割り当て済みのshift_idへ絞った結果だけを返す。
  const rosterViewClient = includeRosterErrors ? createServiceClient() : sb;
  const kaipokeCsIds = Array.from(
    new Set(rawShifts.map((shift) => String(shift.kaipoke_cs_id ?? "").trim()).filter(Boolean)),
  );
  const shiftIds = Array.from(
    new Set(rawShifts.map((shift) => String(shift.shift_id ?? "").trim()).filter(Boolean)),
  );
  const staffIds = Array.from(
    new Set(
      rawShifts
        .flatMap((shift) => [shift.staff_01_user_id, shift.staff_02_user_id, shift.staff_03_user_id])
        .map((value) => String(value ?? "").trim())
        .filter((value) => value && value !== "-"),
    ),
  );

  const [clientRows, shiftDetailRows, csDocRows, staffRows, recordRows, rosterErrorRows, mealRows, parkingRows, myServiceKeys] =
    await timedStage(timings, "initial.parallel_dependent_fetches", () =>
      Promise.all([
        fetchRowsByColumn<ClientInfoRow>(sb, timings, counter, {
          stage: "supabase.cs_kaipoke_info.full_client_data",
          table: "cs_kaipoke_info",
          select: [
            "kaipoke_cs_id",
            "asigned_jisseki_staff",
            "address",
            "postal_code",
            ...(includeSmsPhone ? ["phone_01"] : []),
            "commuting_flg",
            "standard_route",
            "standard_trans_ways",
            "standard_purpose",
            "biko",
            "kodoengo_plan_link",
            "time_adjustability_id",
          ].join(","),
          column: "kaipoke_cs_id",
          values: kaipokeCsIds,
        }),
        fetchRowsByColumn<ShiftDetailRow>(sb, timings, counter, {
          stage: "supabase.cs_kaipoke_info_shift_detail_view",
          table: "cs_kaipoke_info_shift_detail_view",
          select: "kaipoke_cs_id,shift_detail_information",
          column: "kaipoke_cs_id",
          values: kaipokeCsIds,
        }),
        fetchRowsByColumn<CsDocRow>(sb, timings, counter, {
          stage: "supabase.cs_docs.basic_information",
          table: "cs_docs",
          select: "id,kaipoke_cs_id,summary,applicable_date,created_at",
          column: "kaipoke_cs_id",
          values: kaipokeCsIds,
          orders: [
            { column: "applicable_date", ascending: false, nullsFirst: false },
            { column: "created_at", ascending: false, nullsFirst: false },
          ],
        }),
        fetchRowsByColumn<RejectPerformanceStaffRow>(sb, timings, counter, {
          stage: "supabase.user_entry_united_view_single.staff_names",
          table: "user_entry_united_view_single",
          select: "user_id,last_name_kanji,first_name_kanji,level_sort",
          column: "user_id",
          values: staffIds,
        }),
        fetchRowsByColumn<ShiftRecordRow>(sb, timings, counter, {
          stage: "supabase.shift_records.statuses",
          table: "shift_records",
          select: "shift_id,status,updated_at",
          column: "shift_id",
          values: shiftIds,
          orders: [{ column: "updated_at", ascending: false, nullsFirst: false }],
        }),
        includeRosterErrors
          ? fetchRowsByColumn<RosterErrorRow>(rosterViewClient, timings, counter, {
              stage: "supabase.shift_daily_dialog_view.roster_errors",
              table: "shift_daily_dialog_view",
              select: [
                "shift_id",
                "roster_error_visit_record",
                "roster_error_actual_record",
                "roster_error_actual_record_months",
                "shift_event_alerts",
              ].join(","),
              column: "shift_id",
              values: shiftIds,
            })
          : Promise.resolve([] as RosterErrorRow[]),
        fetchMealExpenseRows(sb, timings, counter, shiftIds),
        fetchRowsByColumn<ParkingPresenceRow>(sb, timings, counter, {
          stage: "supabase.parking_cs_places.active_presence",
          table: "parking_cs_places",
          select: "kaipoke_cs_id",
          column: "kaipoke_cs_id",
          values: kaipokeCsIds,
          eq: [{ column: "is_active", value: true }],
        }),
        fetchMyServiceKeys(sb, timings, counter, authUserId),
      ]),
    );

  const managerIds = Array.from(
    new Set(
      clientRows
        .map((row) => row.asigned_jisseki_staff?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const managerContactRows = await fetchRowsByColumn<ManagerContactRow>(sb, timings, counter, {
    stage: "supabase.user_org_exception.manager_contacts",
    table: "user_org_exception",
    select: "user_id,org_mgr_phone",
    column: "user_id",
    values: managerIds,
  });

  const adjustabilityIds = clientRows
    .map((row) => row.time_adjustability_id)
    .filter((value): value is string => Boolean(value));
  const adjustRows = await fetchRowsByColumn<TimeAdjustabilityRow>(sb, timings, counter, {
    stage: "supabase.cs_kaipoke_time_adjustability",
    table: "cs_kaipoke_time_adjustability",
    select: "id,label,Advance_adjustability,Backwoard_adjustability",
    column: "id",
    values: adjustabilityIds,
  });

  const clientMap = new Map(clientRows.map((row) => [String(row.kaipoke_cs_id), row]));
  const shiftDetailMap = new Map(
    shiftDetailRows.map((row) => [String(row.kaipoke_cs_id ?? ""), row.shift_detail_information ?? ""]),
  );
  const basicInformationMap = new Map<string, string>();
  for (const row of csDocRows) {
    const csId = String(row.kaipoke_cs_id ?? "").trim();
    if (!csId || basicInformationMap.has(csId)) continue;
    const basic = extractBasicInformation(row.summary ?? "");
    if (basic) basicInformationMap.set(csId, basic);
  }

  const staffMap = staffRows.reduce<Record<string, RejectPerformanceStaffRow>>((map, row) => {
    if (row.user_id) map[row.user_id] = row;
    return map;
  }, {});
  const recordStatusMap = new Map<string, RejectRecordStatus>();
  for (const row of recordRows) {
    const shiftId = String(row.shift_id);
    if (!recordStatusMap.has(shiftId) && isRecordStatus(row.status)) {
      recordStatusMap.set(shiftId, row.status);
    }
  }
  const rosterErrorMap = new Map(
    rosterErrorRows.map((row) => [String(row.shift_id), row]),
  );
  const mealExpenseShiftIds = new Set(mealRows.map((row) => payloadShiftId(row.payload)).filter(Boolean));
  const parkingCsIds = new Set(parkingRows.map((row) => String(row.kaipoke_cs_id)));
  const adjustMap = new Map(adjustRows.map((row) => [String(row.id), row]));
  const managerPhoneByManagerId = new Map(
    managerContactRows.map((row) => [row.user_id, row.org_mgr_phone?.trim() || ""]),
  );

  const shifts = rawShifts
    .filter(
      (shift) =>
        shift.shift_id !== null &&
        shift.shift_start_date &&
        shift.shift_start_time &&
        shift.shift_end_time &&
        shift.kaipoke_cs_id,
    )
    .map((shift): RejectPerformanceShift => {
      const shiftId = String(shift.shift_id);
      const csId = String(shift.kaipoke_cs_id);
      const client = clientMap.get(csId);
      const smsReplyPhoneNumbers = Array.from(
        new Set(
          [managerPhoneByManagerId.get(String(client?.asigned_jisseki_staff ?? "").trim()) ?? ""].filter(Boolean),
        ),
      );
      const adjust = client?.time_adjustability_id
        ? adjustMap.get(String(client.time_adjustability_id))
        : undefined;
      const rosterError = rosterErrorMap.get(shiftId);
      const advance = Number(adjust?.Advance_adjustability ?? 0);
      const backward = Number(adjust?.Backwoard_adjustability ?? 0);

      return {
        id: shiftId,
        shift_id: shiftId,
        shift_start_date: shift.shift_start_date ?? "",
        shift_start_time: shift.shift_start_time ?? "",
        shift_end_time: shift.shift_end_time ?? "",
        service_code: shift.service_code ?? "",
        kaipoke_cs_id: csId,
        staff_01_user_id: shift.staff_01_user_id ?? "",
        staff_02_user_id: shift.staff_02_user_id ?? "",
        staff_03_user_id: shift.staff_03_user_id ?? "",
        staff_01_level_sort: shift.staff_01_level_sort,
        staff_02_level_sort: shift.staff_02_level_sort,
        staff_03_level_sort: shift.staff_03_level_sort,
        staff_02_attend_flg: shift.staff_02_attend_flg,
        staff_03_attend_flg: shift.staff_03_attend_flg,
        judo_ido: shift.judo_ido,
        address: client?.address?.trim() || shift.address?.trim() || "",
        postal_code: client?.postal_code?.trim() || shift.postal_code?.trim() || "",
        sms_phone_number: includeSmsPhone ? client?.phone_01?.trim() || null : null,
        sms_reply_phone_numbers: smsReplyPhoneNumbers,
        estimated_pay_amount: numberOrNull(shift.estimated_pay_amount),
        client_name: shift.name ?? "",
        gender_request_name: shift.gender_request_name ?? "",
        male_flg: Boolean(shift.male_flg),
        female_flg: Boolean(shift.female_flg),
        postal_code_3: shift.postal_code_3 ?? "",
        district: shift.district ?? "",
        commuting_flg: client?.commuting_flg ?? Boolean(shift.commuting_flg),
        standard_route: client?.standard_route ?? "",
        standard_trans_ways: client?.standard_trans_ways ?? "",
        standard_purpose: client?.standard_purpose ?? "",
        biko: client?.biko?.trim() ?? "",
        kodoengo_plan_link: client?.kodoengo_plan_link ?? null,
        level_sort_order: shift.level_sort_order,
        require_doc_group: shift.require_doc_group,
        tokutei_comment: shift.tokutei_comment,
        spot_offer_status: shift.spot_offer_status,
        applicant_name: shift.applicant_name,
        applicant_sex: shift.applicant_sex,
        applicant_control_url: shift.applicant_control_url,
        basic_information: basicInformationMap.get(csId) ?? "",
        shift_detail_information: shiftDetailMap.get(csId) ?? "",
        time_adjustable: advance !== 0 || backward !== 0,
        time_adjust_text: adjust?.label?.trim() || "時間調整可能",
        time_adjust_advance_hours: advance,
        time_adjust_back_hours: backward,
        record_status: recordStatusMap.get(shiftId),
        meal_expense_requested: mealExpenseShiftIds.has(shiftId),
        has_active_parking: parkingCsIds.has(csId),
        roster_error_visit_record: Boolean(rosterError?.roster_error_visit_record),
        roster_error_actual_record: Boolean(rosterError?.roster_error_actual_record),
        roster_error_actual_record_months: rosterError?.roster_error_actual_record_months ?? [],
        shift_event_alerts: normalizeShiftEventAlerts(rosterError?.shift_event_alerts),
      };
    })
    .sort((left, right) => {
      const leftKey = `${left.shift_start_date}${left.shift_start_time}${left.shift_id}`;
      const rightKey = `${right.shift_start_date}${right.shift_start_time}${right.shift_id}`;
      return leftKey.localeCompare(rightKey);
    });

  return {
    shifts,
    staffMap,
    myServiceKeys,
    counts: {
      visibleShifts: shifts.length,
      uniqueKaipokeCsIds: kaipokeCsIds.length,
      staffIds: staffIds.length,
      recordStatuses: recordStatusMap.size,
      mealExpenseRequests: mealExpenseShiftIds.size,
      clientsWithParking: parkingCsIds.size,
      rosterErrors: rosterErrorMap.size,
    },
  };
}

export async function GET(req: NextRequest) {
  const routeStartedAt = performance.now();
  const timings: PerfTiming[] = [];
  const counter: QueryCounter = { count: 0 };

  try {
    const authResult = await timedStage(timings, "auth.verify_bearer", () => getUserFromBearer(req));
    const token = authResult.token;
    const authUser = authResult.user;
    if (!token || !authUser?.id) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized", perf: { totalMs: elapsed(routeStartedAt), timings } },
        { status: 401 },
      );
    }

    const url = new URL(req.url);
    const scopeParam = url.searchParams.get("scope");
    const scope = scopeParam === "candidates" || scopeParam === "month-counts" ? scopeParam : "assigned";
    const date = url.searchParams.get("date");
    const month = url.searchParams.get("month");
    if (scope === "month-counts" ? !isValidMonth(month) : !isValidDate(date)) {
      return NextResponse.json(
        { ok: false, error: scope === "month-counts" ? "month must be YYYY-MM" : "date must be YYYY-MM-DD" },
        { status: 400 },
      );
    }

    const sb = createUserClient(token);
    const userRecord = await queryMaybeOne<UserRecord>(
      timings,
      counter,
      "supabase.users.current_user",
      () =>
        sb
          .from("users")
          .select("user_id,kaipoke_user_id,system_role")
          .eq("auth_user_id", authUser.id)
          .maybeSingle(),
    );
    if (!userRecord?.user_id) throw new Error("ログインユーザーの user_id を取得できません");

    if (scope === "month-counts" && month) {
      const rawMonthShifts = await fetchPagedShifts(sb, timings, counter, {
        dateFrom: `${month}-01`,
        dateTo: monthEnd(month),
        userId: userRecord.user_id,
        maxPages: MAX_MONTH_PAGES,
        stage: "supabase.shift_self_coordinate_card_view2.month_assigned",
      });
      const counts: Record<string, number> = {};
      for (const shift of rawMonthShifts) {
        if (!shift.shift_start_date) continue;
        counts[shift.shift_start_date] = (counts[shift.shift_start_date] ?? 0) + 1;
      }
      const response = {
        ok: true,
        scope,
        month,
        counts,
        perf: {
          totalMs: elapsed(routeStartedAt),
          dbQueryCount: counter.count,
          timings,
          counts: { monthShifts: rawMonthShifts.length },
        },
      } as const;
      console.log("[shift-reject-performance-test][month-counts]", response.perf);
      return NextResponse.json(response, { headers: PRIVATE_NO_STORE_HEADERS });
    }

    const requestedDate = date as string;
    const rawRows = await fetchPagedShifts(sb, timings, counter, {
      dateFrom: requestedDate,
      dateTo: requestedDate,
      userId: scope === "assigned" ? userRecord.user_id : undefined,
      maxPages: MAX_ASSIGNED_PAGES,
      stage:
        scope === "assigned"
          ? "supabase.shift_self_coordinate_card_view2.assigned_day"
          : "supabase.shift_self_coordinate_card_view2.candidate_day",
    });
    const scopedRows =
      scope === "assigned"
        ? rawRows.filter((shift) =>
            [shift.staff_01_user_id, shift.staff_02_user_id, shift.staff_03_user_id].includes(
              userRecord.user_id,
            ),
          )
        : rawRows.filter(isCurrentCandidate);

    const hydrated = await hydrateShifts(
      sb,
      timings,
      counter,
      scopedRows,
      authUser.id,
      true,
      scope === "assigned",
    );
    const response = {
      ok: true,
      scope,
      date: requestedDate,
      shifts: hydrated.shifts,
      staffMap: hydrated.staffMap,
      user: {
        accountId: userRecord.user_id,
        kaipokeUserId: userRecord.kaipoke_user_id ?? "",
        systemRole: userRecord.system_role,
      },
      myServiceKeys: hydrated.myServiceKeys,
      perf: {
        totalMs: elapsed(routeStartedAt),
        dbQueryCount: counter.count,
        timings,
        counts: { rawShifts: rawRows.length, ...hydrated.counts },
      },
    } as const;

    console.log(`[shift-reject-performance-test][${scope}]`, response.perf);
    return NextResponse.json(response, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const perf = { totalMs: elapsed(routeStartedAt), dbQueryCount: counter.count, timings };
    console.error("[shift-reject-performance-test][initial-data] error", message, perf);
    return NextResponse.json({ ok: false, error: message, perf }, { status: 500 });
  }
}
