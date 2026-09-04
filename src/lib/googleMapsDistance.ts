import "server-only";

import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/service";

type DistanceResult = { distanceMeters: number; durationSeconds: number };
type ShiftRow = {
  shift_id: number;
  shift_start_date: string | null;
  kaipoke_cs_id: string | null;
  staff_01_user_id: string | null;
  staff_02_user_id: string | null;
  staff_03_user_id: string | null;
};
type UserRow = { user_id: string; entry_id: string | null; auth_user_id: string | null; system_role: string | null };
type ClientRow = { kaipoke_cs_id: string; address: string | null };
type EntryRow = {
  id: string;
  auth_uid: string | null;
  address: string | null;
  last_name_kanji: string | null;
  first_name_kanji: string | null;
};

export type DistanceRunResult = {
  runId: string;
  targetShiftCount: number;
  targetSegmentCount: number;
  cacheHitCount: number;
  googleMapsRequestCount: number;
  successCount: number;
  failureCount: number;
  recalculatedStaffCount: number;
  skippedByLimitCount: number;
  status: "success" | "partial" | "failed";
  processingTimeMs: number;
};

const MAX_REQUESTS = Math.max(1, Number(process.env.MAX_GOOGLE_MAPS_REQUESTS_PER_RUN ?? 100));
const MAX_CONCURRENCY = Math.max(1, Math.min(8, Number(process.env.GOOGLE_MAPS_CONCURRENCY ?? 5)));
// Vercelの関数タイムアウト前に結果を保存して終了するための安全時間。
const MAX_RUNTIME_MS = Math.max(15_000, Number(process.env.GOOGLE_MAPS_MAX_RUNTIME_MS ?? 45_000));
const RETRY_MINUTES = Math.max(5, Number(process.env.GOOGLE_MAPS_RETRY_MINUTES ?? 60));
const EXCLUDED_STAFF_NAMES = new Set([
  "濵川 千咲", "サービス サポート", "益田 名実", "塩澤 里美", "高橋 りか",
  "松岡 佑太", "増田 志乃", "太田 明子", "大津 美羽", "池本 梨夏",
  "長谷川 愛", "渡久地 泰子", "白井 伶佳", "小針 京子",
]);

function addressHash(address: string) {
  return createHash("sha256").update(address.trim().replace(/\s+/g, " ")).digest("hex");
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function fetchGoogleDistance(origin: string, destination: string): Promise<DistanceResult> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) throw new Error("GOOGLE_MAPS_API_KEY is not configured");

  const response = await fetch("https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "originIndex,destinationIndex,distanceMeters,duration,status,condition",
    },
    body: JSON.stringify({
      origins: [{ waypoint: { address: origin } }],
      destinations: [{ waypoint: { address: destination } }],
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_UNAWARE",
      languageCode: "ja",
      units: "METRIC",
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const responseText = await response.text();
  let body: unknown;
  try {
    body = JSON.parse(responseText);
  } catch {
    throw new Error(responseText || `HTTP ${response.status}`);
  }
  const element = Array.isArray(body) ? body[0] : body;
  const item = element as {
    distanceMeters?: number;
    duration?: string;
    condition?: string;
    status?: { code?: number; message?: string } | string;
  };
  const statusMessage = typeof item.status === "string"
    ? item.status
    : item.status?.message;
  const durationSeconds = item.duration ? Number.parseFloat(item.duration.replace(/s$/, "")) : 0;
  if (!response.ok || item.condition !== "ROUTE_EXISTS" || !item.distanceMeters || !durationSeconds) {
    throw new Error(statusMessage || item.condition || `HTTP ${response.status}`);
  }
  return { distanceMeters: item.distanceMeters, durationSeconds };
}

export async function runGoogleMapsDistanceUpdate(triggerType: "cron" | "manual", createdBy?: string): Promise<DistanceRunResult> {
  const started = Date.now();
  const deadline = started + MAX_RUNTIME_MS;
  const { data: run, error: runError } = await supabaseAdmin
    .from("google_maps_distance_cron_runs")
    .insert({ trigger_type: triggerType, created_by: createdBy ?? null })
    .select("id")
    .single();
  if (runError || !run) throw new Error(runError?.message ?? "距離更新ログを作成できませんでした");

  let requestCount = 0;
  let cacheHitCount = 0;
  let successCount = 0;
  let failureCount = 0;
  let skippedByLimitCount = 0;
  const changedStaff = new Set<string>();
  try {
    const from = new Date();
    from.setMonth(from.getMonth() - 12);
    const fromDate = from.toISOString().slice(0, 10);
    // 将来シフトは月間実績の対象外なので、現在日までを処理する。
    const toDate = new Date().toISOString().slice(0, 10);
    const { data: shifts, error: shiftError } = await supabaseAdmin
      .from("shift")
      .select("shift_id, shift_start_date, kaipoke_cs_id, staff_01_user_id, staff_02_user_id, staff_03_user_id")
      .gte("shift_start_date", fromDate).lte("shift_start_date", toDate);
    if (shiftError) throw new Error(shiftError.message);

    const shiftRows = (shifts ?? []) as ShiftRow[];
    const staffIds = [...new Set(shiftRows.flatMap((s: ShiftRow) => [s.staff_01_user_id, s.staff_02_user_id, s.staff_03_user_id]).filter((v): v is string => Boolean(v && v !== "-")))];
    const clientIds = [...new Set(shiftRows.map((s: ShiftRow) => s.kaipoke_cs_id).filter((v): v is string => Boolean(v)))];
    const [{ data: users, error: usersError }, { data: clients, error: clientsError }] = await Promise.all([
      supabaseAdmin.from("users").select("user_id, entry_id, auth_user_id, system_role").in("user_id", staffIds),
      supabaseAdmin.from("cs_kaipoke_info").select("kaipoke_cs_id, address").in("kaipoke_cs_id", clientIds),
    ]);
    if (usersError) throw new Error(usersError.message);
    if (clientsError) throw new Error(clientsError.message);
    const userRows = (users ?? []) as UserRow[];
    const clientRows = (clients ?? []) as ClientRow[];
    const entryIds = userRows.map((u: UserRow) => u.entry_id).filter((v): v is string => Boolean(v));
    const authUserIds = userRows.map((u: UserRow) => u.auth_user_id).filter((v): v is string => Boolean(v));
    const [{ data: entriesById, error: entriesByIdError }, { data: entriesByAuth, error: entriesByAuthError }] = await Promise.all([
      supabaseAdmin.from("form_entries").select("id, auth_uid, address, last_name_kanji, first_name_kanji").in("id", entryIds.length ? entryIds : ["__no_entry__"]),
      supabaseAdmin.from("form_entries").select("id, auth_uid, address, last_name_kanji, first_name_kanji").in("auth_uid", authUserIds.length ? authUserIds : ["__no_auth_user__"]),
    ]);
    if (entriesByIdError) throw new Error(entriesByIdError.message);
    if (entriesByAuthError) throw new Error(entriesByAuthError.message);
    const entries = [...(entriesById ?? []), ...(entriesByAuth ?? [])] as EntryRow[];
    const managerStaffIds = new Set(
      userRows
        .filter((user) => ["manager", "admin", "system_admin", "super_admin"].includes(
          String(user.system_role ?? "").toLowerCase()
        ))
        .filter((user) => {
          const entry = entries.find((item) => item.id === user.entry_id || item.auth_uid === user.auth_user_id);
          const name = clean(`${entry?.last_name_kanji ?? ""} ${entry?.first_name_kanji ?? ""}`);
          return !EXCLUDED_STAFF_NAMES.has(name);
        })
        .map((user) => user.user_id)
    );
    const addressByStaff = new Map<string, string>();
    for (const user of users ?? []) {
      const address = clean(entries.find((e: EntryRow) =>
        e.id === user.entry_id || e.auth_uid === user.auth_user_id
      )?.address);
      if (address) addressByStaff.set(user.user_id, address);
    }
    const addressByClient = new Map<string, string>(clientRows.map((c: ClientRow) => [c.kaipoke_cs_id, clean(c.address)]));
    const targets = shiftRows.flatMap((shift: ShiftRow) => [shift.staff_01_user_id, shift.staff_02_user_id, shift.staff_03_user_id]
      .filter((staffId): staffId is string => Boolean(staffId && staffId !== "-"))
      .filter((staffId) => managerStaffIds.has(staffId))
      .map((staffId) => ({ shift, staffId, origin: addressByStaff.get(staffId) ?? "", destination: addressByClient.get(shift.kaipoke_cs_id) ?? "" }))
      .filter((t) => Boolean(t.shift.shift_start_date && t.origin && t.destination && t.origin !== t.destination))) as Array<{ shift: ShiftRow; staffId: string; origin: string; destination: string }>;

    // 直近の締め月（例：9月なら8月）を優先し、月次集計に必要な過去分を先に確定させる。
    const currentMonth = new Date().toISOString().slice(0, 7);
    const previousMonthDate = new Date();
    previousMonthDate.setMonth(previousMonthDate.getMonth() - 1);
    const previousMonth = previousMonthDate.toISOString().slice(0, 7);
    targets.sort((a, b) => {
      const aMonth = a.shift.shift_start_date?.slice(0, 7) ?? "";
      const bMonth = b.shift.shift_start_date?.slice(0, 7) ?? "";
      const priority = (month: string) => month === previousMonth ? 0 : month === currentMonth ? 1 : 2;
      return priority(aMonth) - priority(bMonth) || (b.shift.shift_start_date ?? "").localeCompare(a.shift.shift_start_date ?? "");
    });

    await supabaseAdmin.from("google_maps_distance_cron_runs").update({ target_shift_count: shiftRows.length, target_segment_count: targets.length }).eq("id", run.id);
    let nextTargetIndex = 0;
    const processTarget = async (target: (typeof targets)[number]) => {
      const originHash = addressHash(target.origin);
      const destinationHash = addressHash(target.destination);
      const { data: segment } = await supabaseAdmin.from("manager_distance_segments").upsert({
        shift_id: target.shift.shift_id, staff_user_id: target.staffId, segment_date: target.shift.shift_start_date as string,
        segment_kind: "home_to_client", origin_address: target.origin, destination_address: target.destination,
        origin_address_hash: originHash, destination_address_hash: destinationHash, status: "pending", last_error: null, updated_at: new Date().toISOString(),
      }, { onConflict: "shift_id,staff_user_id,segment_kind" }).select("id, distance_cache_id, status, origin_address_hash, destination_address_hash").single();
      if (!segment) return;
      const { data: cache } = await supabaseAdmin.from("google_maps_distance_cache").select("*").eq("origin_address_hash", originHash).eq("destination_address_hash", destinationHash).maybeSingle();
      if (cache?.status === "success" && cache.distance_meters != null) {
        cacheHitCount++;
        await supabaseAdmin.from("manager_distance_segments").update({ distance_cache_id: cache.id, status: "success", distance_meters: cache.distance_meters, duration_seconds: cache.duration_seconds, calculated_at: cache.calculated_at, last_error: null, updated_at: new Date().toISOString() }).eq("id", segment.id);
        return;
      }
      if (cache?.status === "error" && cache.retry_after && new Date(cache.retry_after).getTime() > Date.now()) {
        skippedByLimitCount++;
        await supabaseAdmin.from("manager_distance_segments").update({ status: "error", last_error: cache.last_error, updated_at: new Date().toISOString() }).eq("id", segment.id);
        return;
      }
      if (requestCount >= MAX_REQUESTS) { skippedByLimitCount++; return; }
      requestCount++;
      try {
        const result = await fetchGoogleDistance(target.origin, target.destination);
        const { data: savedCache } = await supabaseAdmin.from("google_maps_distance_cache").upsert({ origin_address: target.origin, destination_address: target.destination, origin_address_hash: originHash, destination_address_hash: destinationHash, distance_meters: result.distanceMeters, duration_seconds: result.durationSeconds, status: "success", last_error: null, calculated_at: new Date().toISOString(), retry_after: null, updated_at: new Date().toISOString() }, { onConflict: "origin_address_hash,destination_address_hash" }).select("id, calculated_at").single();
        await supabaseAdmin.from("manager_distance_segments").update({ distance_cache_id: savedCache?.id ?? null, status: "success", distance_meters: result.distanceMeters, duration_seconds: result.durationSeconds, calculated_at: savedCache?.calculated_at ?? new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() }).eq("id", segment.id);
        successCount++; changedStaff.add(target.staffId);
      } catch (error) {
        failureCount++;
        const message = error instanceof Error ? error.message : String(error);
        const retryAfter = new Date(Date.now() + RETRY_MINUTES * 60_000).toISOString();
        await supabaseAdmin.from("google_maps_distance_cache").upsert({ origin_address: target.origin, destination_address: target.destination, origin_address_hash: originHash, destination_address_hash: destinationHash, status: "error", last_error: message, retry_after: retryAfter, updated_at: new Date().toISOString() }, { onConflict: "origin_address_hash,destination_address_hash" });
        await supabaseAdmin.from("manager_distance_segments").update({ status: "error", last_error: message, updated_at: new Date().toISOString() }).eq("id", segment.id);
      }
    };

    // Google Maps呼び出しを直列にすると、対象が多い場合にVercelの
    // 実行時間上限へ到達するため、最大5件（設定で最大8件）ずつ処理する。
    const worker = async () => {
      while (true) {
        const index = nextTargetIndex++;
        if (index >= targets.length) return;
        if (Date.now() >= deadline) {
          skippedByLimitCount++;
          nextTargetIndex = targets.length;
          return;
        }
        await processTarget(targets[index]);
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(MAX_CONCURRENCY, targets.length) }, () => worker())
    );
    const status = failureCount || skippedByLimitCount ? "partial" : "success";
    const result = { runId: run.id, targetShiftCount: shiftRows.length, targetSegmentCount: targets.length, cacheHitCount, googleMapsRequestCount: requestCount, successCount, failureCount, recalculatedStaffCount: changedStaff.size, skippedByLimitCount, status, processingTimeMs: Date.now() - started } satisfies DistanceRunResult;
    await supabaseAdmin.from("google_maps_distance_cron_runs").update({ status, finished_at: new Date().toISOString(), cache_hit_count: cacheHitCount, google_maps_request_count: requestCount, success_count: successCount, failure_count: failureCount, recalculated_staff_count: changedStaff.size, skipped_by_limit_count: skippedByLimitCount, processing_time_ms: result.processingTimeMs }).eq("id", run.id);
    return result;
  } catch (error) {
    await supabaseAdmin.from("google_maps_distance_cron_runs").update({ status: "failed", finished_at: new Date().toISOString(), google_maps_request_count: requestCount, error_message: error instanceof Error ? error.message : String(error), processing_time_ms: Date.now() - started }).eq("id", run.id);
    throw error;
  }
}
