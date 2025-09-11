// src/app/api/roster/shifts/[id]/route.ts

type PatchPayload = {
  start_at?: string;
  end_at?: string;
  staff_id?: string;
};

function isPatchPayload(x: unknown): x is PatchPayload {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  if ("start_at" in o && typeof o.start_at !== "string") return false;
  if ("end_at" in o && typeof o.end_at !== "string") return false;
  if ("staff_id" in o && typeof o.staff_id !== "string") return false;
  return true;
}

export async function PATCH(request: Request) {
  try {
    // /api/roster/shifts/[id] から id を抽出（末尾の空要素もケア）
    const url = new URL(request.url);
    const parts = url.pathname.replace(/\/+$/, "").split("/").filter(Boolean);
    const id = decodeURIComponent(parts[parts.length - 1] ?? "");
    if (!id) {
      return Response.json({ ok: false, error: "Missing id in URL" }, { status: 400 });
    }

    const raw: unknown = await request.json();
    if (!isPatchPayload(raw)) {
      return Response.json({ ok: false, error: "Invalid payload" }, { status: 400 });
    }

    const { start_at, end_at, staff_id } = raw;

    // TODO: DB更新処理
    //  - id（`${shift_id}_${staff_id}`）を分解し、shift と担当者配列を更新
    //  - start/end は日付(date) + 時刻の正規化ルールに従い保存

    return Response.json({ ok: true, id, start_at, end_at, staff_id });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
