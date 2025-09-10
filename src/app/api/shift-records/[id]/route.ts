// src/app/api/shift-records/[id]/route.ts
import { supabaseAdmin } from "@/lib/supabase/service";

type ShiftRecordPatch = {
    status?: string;     // 'draft' | 'done' など（text列）
    shift_id?: number;   // int8
    created_by?: string; // uuid
};
type PickResult =
    | { ok: true; value: ShiftRecordPatch }
    | { ok: false; msg: string };

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}
function pickPatch(input: unknown): PickResult {
    if (!isRecord(input)) return { ok: false, msg: "body must be an object" };
    const out: ShiftRecordPatch = {};
    if ("status" in input) {
        const s = (input as Record<string, unknown>).status;
        if (typeof s !== "string") return { ok: false, msg: "status must be string" };
        out.status = s;
    }
    if ("shift_id" in input) {
        const n = (input as Record<string, unknown>).shift_id;
        if (typeof n !== "number" || !Number.isFinite(n)) {
            return { ok: false, msg: "shift_id must be number" };
        }
        out.shift_id = n;
    }
    if ("created_by" in input) {
        const u = (input as Record<string, unknown>).created_by;
        if (typeof u !== "string") {
            return { ok: false, msg: "created_by must be uuid string" };
        }
        out.created_by = u;
    }
    if (Object.keys(out).length === 0) {
        return { ok: false, msg: "no updatable fields in body" };
    }
    return { ok: true, value: out };
}

export async function PATCH(req: Request): Promise<Response> {
    // /api/shift-records/[id]
    const url = new URL(req.url);
    const parts = url.pathname.split("/");
    const id = parts[parts.length - 1] || parts[parts.length - 2];
    if (!id) return new Response("missing id", { status: 400 });

    let raw: unknown;
    try {
        raw = await req.json();
    } catch {
        return new Response("invalid json body", { status: 400 });
    }

    const picked = pickPatch(raw);
    if ("msg" in picked) {
        return new Response(`bad request: ${picked.msg}`, { status: 400 });
    }

    try {
        const { data, error } = await supabaseAdmin
            .from("shift_records")
            .update(picked.value)
            .eq("id", id)
            .select("id,status,updated_at")
            .single();

        if (error) {
            // ここでエラーの中身をそのまま返す
            const msg =
                `update failed: ${error.message}` +
                (error.details ? ` | details: ${error.details}` : "") +
                (error.hint ? ` | hint: ${error.hint}` : "");
            console.error("[shift_records PATCH] id=%s error=%o", id, error); // ログにも
            return new Response(msg, { status: 400 });
        }

        return new Response(JSON.stringify(data), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    } catch (e: unknown) {
        // e は unknown なので安全に取り扱う
        const message =
            e instanceof Error
                ? e.message
                : typeof e === "string"
                    ? e
                    : JSON.stringify(e);

        console.error("[shift_records PATCH] id=%s thrown=%o", id, e);
        return new Response(`unexpected error: ${message}`, { status: 500 });
    }

}
