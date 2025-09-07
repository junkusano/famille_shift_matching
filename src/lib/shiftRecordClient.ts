// =============================================
// A) src/lib/shiftRecordClient.ts（フロント用ヘルパ）
//    - レコード取得、items 取得、items 保存、ステータス更新
// =============================================
export type ApiStatus = "入力中" | "完了";
export type ShiftRecord = { id: string; status: ApiStatus; updated_at: string | null };
export type ItemRow = { item_def_id: string; value_text: string | null; note?: string | null; updated_at?: string | null };

/*
function toNumber(v: number | string): number {
  return typeof v === "number" ? Math.trunc(v) : Math.trunc(Number(v));
}
  */

export async function fetchShiftRecord(shiftId: number | string): Promise<ShiftRecord> {
  const res = await fetch(`/api/shift-records?shift_id=${encodeURIComponent(String(shiftId))}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`GET /api/shift-records failed: ${res.status}`);
  return (await res.json()) as ShiftRecord; // { id, status, updated_at }
}

export type ItemsResponse = { record_id: string; items: ItemRow[]; by_item_def_id: Record<string, { value_text: string | null; note?: string | null; updated_at?: string | null }>; };

export async function fetchRecordItemsByRecordId(recordId: string): Promise<ItemsResponse> {
  const res = await fetch(`/api/shift-record-items?record_id=${encodeURIComponent(recordId)}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`GET /api/shift-record-items?record_id failed: ${res.status}`);
  return (await res.json()) as ItemsResponse;
}

export async function fetchRecordItemsByShiftId(shiftId: number | string): Promise<ItemsResponse> {
  const res = await fetch(`/api/shift-record-items?shift_id=${encodeURIComponent(String(shiftId))}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`GET /api/shift-record-items?shift_id failed: ${res.status}`);
  return (await res.json()) as ItemsResponse;
}

export async function upsertRecordItems(recordId: string, changes: Record<string, unknown>, noteByItem?: Record<string, string | undefined>): Promise<void> {
  const rows = Object.entries(changes).map(([item_def_id, value]) => ({
    record_id: recordId,
    item_def_id,
    value,
    note: noteByItem?.[item_def_id],
  }));
  if (rows.length === 0) return;
  const res = await fetch(`/api/shift-record-items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`POST /api/shift-record-items failed: ${res.status}`);
}

export async function patchShiftRecordStatus(recordId: string, status: ApiStatus): Promise<void> {
  const res = await fetch(`/api/shift-records/${encodeURIComponent(recordId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error(`PATCH /api/shift-records/:id failed: ${res.status}`);
}