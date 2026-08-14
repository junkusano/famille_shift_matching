import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { determineServicesFromCertificates, type DocMasterRow, type ServiceKey } from "@/lib/certificateJudge";
import { getUserFromBearer } from "@/lib/auth/getUserFromBearer";
import { extractFilterOptions } from "@/lib/supabase/shiftFilterOptions";
import type { ShiftData, SupabaseShiftRaw } from "@/types/shift";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const SHIFT_PAGE_SIZE = 1000;
const MAX_SHIFT_PAGES = 10;
const IN_CHUNK_SIZE = 500;

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
  "document_summary",
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

type PostalDistrict = {
  postal_code_3: string;
  district: string;
};

type ConfirmedShiftRecord = {
  shift_id: string | number | null;
};

type CsInfoRow = {
  kaipoke_cs_id: string;
  name: string | null;
  phone_01: string | null;
  commuting_flg: boolean | null;
  standard_route: string | null;
  standard_trans_ways: string | null;
  standard_purpose: string | null;
  biko: string | null;
};

type ShiftDetailRow = {
  kaipoke_cs_id: string;
  shift_detail_information: string | null;
};

type CsDocRow = {
  id: string;
  kaipoke_cs_id: string | null;
  summary: string | null;
  applicable_date: string | null;
  created_at: string | null;
};

type StaffRow = {
  user_id: string;
  last_name_kanji: string | null;
  first_name_kanji: string | null;
  level_sort: number | null;
};

type ManagerContactRow = {
  user_id: string;
  org_mgr_phone: string | null;
};

type FormEntryRow = {
  attachments: unknown;
};

type AttachmentLike = {
  id?: string;
  url?: string;
  label?: string | null;
  type?: string | null;
  mimeType?: string | null;
  uploaded_at?: string | null;
  acquired_at?: string | null;
};

type PerformanceShiftData = ShiftData & {
  basic_information?: string;
  shift_detail_information?: string;
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

function createUserClient(token: string) {
  return createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
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

function isMissingColumnError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("does not exist") || message.includes("column ") || message.includes("42703");
}

async function queryShiftRowsWithFallback(
  sb: UserSupabaseClient,
  timings: PerfTiming[],
  counter: QueryCounter,
  stage: string,
  jstToday: string,
  from: number,
  to: number,
  details?: Record<string, unknown>,
) {
  try {
    return await queryRows<SupabaseShiftRaw>(
      timings,
      counter,
      stage,
      () =>
        sb
          .from("shift_self_coordinate_card_view")
          .select(SHIFT_SELECT)
          .gte("shift_start_date", jstToday)
          .range(from, to),
      details,
    );
  } catch (error) {
    if (!isMissingColumnError(error)) {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);
    timings.push({
      stage: `${stage}.fallback_to_select_all`,
      ms: 0,
      details: { reason: message },
    });

    return await queryRows<SupabaseShiftRaw>(
      timings,
      counter,
      `${stage}.select_all_retry`,
      () =>
        sb
          .from("shift_self_coordinate_card_view")
          .select("*")
          .gte("shift_start_date", jstToday)
          .range(from, to),
      details,
    );
  }
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
    timings.push({
      stage,
      ms: elapsed(startedAt),
      details: { error: response.error.message },
    });
    throw new Error(`${stage}: ${response.error.message}`);
  }

  timings.push({ stage, ms: elapsed(startedAt), rows: response.data ? 1 : 0 });
  return (response.data ?? null) as Row | null;
}

function chunkValues(values: string[], size = IN_CHUNK_SIZE) {
  const unique = Array.from(new Set(values.map((v) => String(v ?? "").trim()).filter(Boolean)));
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += size) {
    chunks.push(unique.slice(i, i + size));
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
    values: string[];
    eq?: Array<{ column: string; value: string | number | boolean }>;
    orders?: Array<{ column: string; ascending: boolean; nullsFirst?: boolean }>;
  },
) {
  const chunks = chunkValues(args.values);
  if (chunks.length === 0) return [];

  const rowsByChunk = await Promise.all(
    chunks.map((chunk, index) =>
      queryRows<Row>(
        timings,
        counter,
        `${args.stage}_${index + 1}`,
        () => {
          let query = sb.from(args.table).select(args.select).in(args.column, chunk);
          for (const filter of args.eq ?? []) {
            query = query.eq(filter.column, filter.value);
          }
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

  return rowsByChunk.flat();
}

function getJstToday() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split("T")[0];
}

async function fetchShiftRows(
  sb: UserSupabaseClient,
  timings: PerfTiming[],
  counter: QueryCounter,
  jstToday: string,
) {
  const firstPage = await queryShiftRowsWithFallback(
    sb,
    timings,
    counter,
    "supabase.shift_self_coordinate_card_view.page_1",
    jstToday,
    0,
    SHIFT_PAGE_SIZE - 1,
  );

  if (firstPage.length < SHIFT_PAGE_SIZE) {
    return firstPage;
  }

  const remainingPages = await Promise.all(
    Array.from({ length: MAX_SHIFT_PAGES - 1 }, (_, index) => {
      const pageIndex = index + 1;
      const from = pageIndex * SHIFT_PAGE_SIZE;
      const to = from + SHIFT_PAGE_SIZE - 1;

      return queryShiftRowsWithFallback(
        sb,
        timings,
        counter,
        `supabase.shift_self_coordinate_card_view.page_${pageIndex + 1}`,
        jstToday,
        from,
        to,
        { range: `${from}-${to}` },
      );
    }),
  );

  return [firstPage, ...remainingPages].flat();
}

function numberOrMax(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return Number.MAX_SAFE_INTEGER;
}

function buildBaseShiftRows(
  rows: SupabaseShiftRaw[],
  confirmedShiftIds: Set<string>,
): PerformanceShiftData[] {
  return rows
    .filter((shift) => !confirmedShiftIds.has(String(shift.shift_id)))
    .filter(
      (shift) =>
        shift.staff_01_user_id === "-" ||
        numberOrMax(shift.level_sort_order) < 4_000_000 ||
        (numberOrMax(shift.staff_02_level_sort) < 4_000_000 && shift.staff_02_attend_flg === false) ||
        (numberOrMax(shift.staff_03_level_sort) < 4_000_000 && shift.staff_03_attend_flg === false),
    )
    .map((shift): PerformanceShiftData => ({
      id: String(shift.id ?? shift.shift_id),
      shift_id: shift.shift_id,
      shift_start_date: shift.shift_start_date,
      shift_start_time: shift.shift_start_time,
      shift_end_time: shift.shift_end_time,
      service_code: shift.service_code,
      kaipoke_cs_id: shift.kaipoke_cs_id,
      staff_01_user_id: shift.staff_01_user_id,
      staff_02_user_id: shift.staff_02_user_id,
      staff_03_user_id: shift.staff_03_user_id,
      staff_01_level_sort: shift.staff_01_level_sort,
      staff_02_level_sort: shift.staff_01_level_sort,
      staff_03_level_sort: shift.staff_01_level_sort,
      staff_02_attend_flg: shift.staff_02_attend_flg,
      staff_03_attend_flg: shift.staff_03_attend_flg,
      address: shift.address || "",
      postal_code: shift.postal_code || "",
      estimated_pay_amount:
        typeof shift.estimated_pay_amount === "number" ? shift.estimated_pay_amount : null,
      client_name: shift.name || "",
      gender_request_name: shift.gender_request_name || "",
      male_flg: shift.male_flg || false,
      female_flg: shift.female_flg || false,
      postal_code_3: shift.postal_code_3 || "",
      district: shift.district || "",
      level_sort_order: typeof shift.level_sort_order === "number" ? shift.level_sort_order : null,
      require_doc_group:
        typeof shift.require_doc_group === "string" && shift.require_doc_group.trim() !== ""
          ? shift.require_doc_group
          : null,
      document_summary:
        typeof shift.document_summary === "string" ? shift.document_summary.trim() : "",
    }))
    .sort((a, b) => {
      const d1 = a.shift_start_date + a.shift_start_time;
      const d2 = b.shift_start_date + b.shift_start_time;
      if (d1 !== d2) return d1.localeCompare(d2);
      if (a.postal_code_3 !== b.postal_code_3) return a.postal_code_3.localeCompare(b.postal_code_3);
      return a.client_name.localeCompare(b.client_name);
    });
}

function extractBasicInformation(summary: string): string {
  const normalized = summary.replace(/\r\n/g, "\n").trim();
  const match = normalized.match(/【5】基本情報やアセスメント項目\s*([\s\S]*?)(?=\n【\d+】|$)/);
  return match?.[1]?.trim() ?? "";
}

function isCertificateAttachment(attachment: AttachmentLike | null | undefined): attachment is AttachmentLike {
  if (!attachment) return false;
  const type = (attachment.type ?? "").toLowerCase();
  const label = (attachment.label ?? "").toLowerCase();
  return ["資格", "certificate", "certification"].some((keyword) => type.includes(keyword) || label.includes(keyword));
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

function buildStaffMap(rows: StaffRow[]) {
  return rows.reduce<Record<string, StaffRow>>((acc, row) => {
    if (row.user_id) acc[row.user_id] = row;
    return acc;
  }, {});
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

    const sb = createUserClient(token);
    const jstToday = getJstToday();

    const [userRecord, rawShifts, postalDistricts, myServiceKeys] = await timedStage(
      timings,
      "initial.parallel_independent_fetches",
      () =>
        Promise.all([
          queryMaybeOne<UserRecord>(
            timings,
            counter,
            "supabase.users.current_user",
            () =>
              sb
                .from("users")
                .select("user_id, kaipoke_user_id, system_role")
                .eq("auth_user_id", authUser.id)
                .maybeSingle(),
          ),
          fetchShiftRows(sb, timings, counter, jstToday),
          queryRows<PostalDistrict>(
            timings,
            counter,
            "supabase.postal_district",
            () => sb.from("postal_district").select("postal_code_3, district").order("postal_code_3"),
          ),
          fetchMyServiceKeys(sb, timings, counter, authUser.id),
        ]),
    );

    const rawShiftIds = rawShifts.map((shift) => String(shift.shift_id));
    const confirmedRecords = await fetchRowsByColumn<ConfirmedShiftRecord>(sb, timings, counter, {
      stage: "supabase.shift_shift_record_view2.confirmed_for_visible_shifts",
      table: "shift_shift_record_view2",
      select: "shift_id",
      column: "shift_id",
      values: rawShiftIds,
      eq: [{ column: "status", value: "確定" }],
    }).then((rows) => rows.filter((row) => row.shift_id !== null));

    const confirmedShiftIds = new Set(confirmedRecords.map((record) => String(record.shift_id)));

    const baseShifts = await timedStage(timings, "transform.filter_and_sort_shifts", async () =>
      buildBaseShiftRows(rawShifts, confirmedShiftIds),
    );

    const kaipokeCsIds = Array.from(
      new Set(baseShifts.map((shift) => String(shift.kaipoke_cs_id ?? "").trim()).filter(Boolean)),
    );

    const staffIds = Array.from(
      new Set(
        baseShifts
          .flatMap((shift) => [shift.staff_01_user_id, shift.staff_02_user_id, shift.staff_03_user_id])
          .map((id) => String(id ?? "").trim())
          .filter((id) => id && id !== "-"),
      ),
    );

    const [csInfoRows, shiftDetailRows, csDocRows, staffRows, managerContactRows] = await timedStage(
      timings,
      "initial.parallel_dependent_fetches",
      () =>
        Promise.all([
          fetchRowsByColumn<CsInfoRow>(sb, timings, counter, {
            stage: "supabase.cs_kaipoke_info",
            table: "cs_kaipoke_info",
            select:
              "kaipoke_cs_id, name, phone_01, commuting_flg, standard_route, standard_trans_ways, standard_purpose, biko",
            column: "kaipoke_cs_id",
            values: kaipokeCsIds,
          }),
          fetchRowsByColumn<ShiftDetailRow>(sb, timings, counter, {
            stage: "supabase.cs_kaipoke_info_shift_detail_view",
            table: "cs_kaipoke_info_shift_detail_view",
            select: "kaipoke_cs_id, shift_detail_information",
            column: "kaipoke_cs_id",
            values: kaipokeCsIds,
          }),
          fetchRowsByColumn<CsDocRow>(sb, timings, counter, {
            stage: "supabase.cs_docs",
            table: "cs_docs",
            select: "id, kaipoke_cs_id, summary, applicable_date, created_at",
            column: "kaipoke_cs_id",
            values: kaipokeCsIds,
            orders: [
              { column: "applicable_date", ascending: false, nullsFirst: false },
              { column: "created_at", ascending: false, nullsFirst: false },
            ],
          }),
          fetchRowsByColumn<StaffRow>(sb, timings, counter, {
            stage: "supabase.user_entry_united_view_single.staff_names",
            table: "user_entry_united_view_single",
            select: "user_id,last_name_kanji,first_name_kanji,level_sort",
            column: "user_id",
            values: staffIds,
          }),
          fetchRowsByColumn<ManagerContactRow>(sb, timings, counter, {
            stage: "supabase.user_org_exception.manager_contacts",
            table: "user_org_exception",
            select: "user_id,org_mgr_phone",
            column: "user_id",
            values: userRecord?.user_id ? [userRecord.user_id] : [],
          }),
        ]),
    );

    const mergedShifts = await timedStage(timings, "transform.merge_client_information", async () => {
      const csInfoMap = new Map(csInfoRows.map((info) => [String(info.kaipoke_cs_id), info]));
      const shiftDetailMap = new Map(
        shiftDetailRows.map((info) => [String(info.kaipoke_cs_id), info.shift_detail_information ?? ""]),
      );
      const csDocsMap = new Map<string, string>();

      for (const row of csDocRows) {
        const kaipokeCsId = String(row.kaipoke_cs_id ?? "").trim();
        if (!kaipokeCsId || csDocsMap.has(kaipokeCsId)) continue;

        const summary = typeof row.summary === "string" ? row.summary.trim() : "";
        const basicInformation = extractBasicInformation(summary);
        if (basicInformation) {
          csDocsMap.set(kaipokeCsId, basicInformation);
        }
      }

      return baseShifts.map((shift): PerformanceShiftData => {
        const kaipokeCsId = String(shift.kaipoke_cs_id ?? "").trim();
        const csInfo = csInfoMap.get(kaipokeCsId);
        const smsReplyPhoneNumbers = Array.from(
          new Set(
            managerContactRows
              .map((row) => row.org_mgr_phone?.trim())
              .filter((value): value is string => Boolean(value)),
          ),
        );

        return {
          ...shift,
          sms_phone_number: csInfo?.phone_01?.trim() || null,
          sms_reply_phone_numbers: smsReplyPhoneNumbers,
          cs_name: csInfo?.name ?? "",
          commuting_flg: csInfo?.commuting_flg ?? false,
          standard_route: csInfo?.standard_route ?? "",
          standard_trans_ways: csInfo?.standard_trans_ways ?? "",
          standard_purpose: csInfo?.standard_purpose ?? "",
          biko: typeof csInfo?.biko === "string" ? csInfo.biko.trim() : "",
          basic_information: csDocsMap.get(kaipokeCsId) ?? "",
          shift_detail_information: shiftDetailMap.get(kaipokeCsId) ?? "",
          document_summary:
            typeof shift.document_summary === "string" ? shift.document_summary.trim() : "",
        };
      });
    });

    const filterOptions = await timedStage(timings, "transform.extract_filter_options", async () =>
      extractFilterOptions(mergedShifts, postalDistricts),
    );

    const totalMs = elapsed(routeStartedAt);
    const response = {
      ok: true,
      shifts: mergedShifts,
      filterOptions,
      staffMap: buildStaffMap(staffRows),
      user: {
        accountId: userRecord?.user_id ?? "",
        kaipokeUserId: userRecord?.kaipoke_user_id ?? "",
        systemRole: userRecord?.system_role ?? null,
      },
      myServiceKeys,
      perf: {
        totalMs,
        dbQueryCount: counter.count,
        timings,
        counts: {
          rawShifts: rawShifts.length,
          confirmedRecords: confirmedRecords.length,
          visibleShifts: mergedShifts.length,
          uniqueKaipokeCsIds: kaipokeCsIds.length,
          staffIds: staffIds.length,
        },
      },
    };

    console.log("[shift-coordinate-performance-test][initial-data]", response.perf);
    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const perf = {
      totalMs: elapsed(routeStartedAt),
      dbQueryCount: counter.count,
      timings,
    };
    console.error("[shift-coordinate-performance-test][initial-data] error", message, perf);
    return NextResponse.json({ ok: false, error: message, perf }, { status: 500 });
  }
}
