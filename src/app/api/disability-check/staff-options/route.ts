import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";

type StaffOption = {
    id: string;
    name: string;
    roster_sort: number | null;
};

type StaffRow = {
    user_id: string | null;
    last_name_kanji: string | null;
    first_name_kanji: string | null;
    roster_sort: number | null;
};

function isStaffRow(x: unknown): x is StaffRow {
    if (typeof x !== "object" || x === null) return false;

    // Record<string, unknown> に落として安全にプロパティ参照
    const r = x as Record<string, unknown>;

    const isStrOrNull = (v: unknown) => typeof v === "string" || v === null;
    const isNumLikeOrNull = (v: unknown) =>
        typeof v === "number" || typeof v === "string" || v === null;

    return (
        isStrOrNull(r.user_id) &&
        isStrOrNull(r.last_name_kanji) &&
        isStrOrNull(r.first_name_kanji) &&
        isNumLikeOrNull(r.roster_sort)
    );
}

export async function GET(req: NextRequest) {
    try {
        // Bearer 認証
        const authHeader = req.headers.get("authorization") ?? "";
        const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
        if (!token) {
            return NextResponse.json({ error: "unauthorized:no_token" }, { status: 401 });
        }

        const { data: userRes, error: userErr } = await supabaseAdmin.auth.getUser(token);
        if (userErr || !userRes?.user) {
            return NextResponse.json({ error: "unauthorized:bad_token" }, { status: 401 });
        }

        const { data, error } = await supabaseAdmin
            .from("user_entry_united_view_single")
            .select("user_id,last_name_kanji,first_name_kanji,roster_sort")
            .order("roster_sort", { ascending: true, nullsFirst: false })
            .order("last_name_kanji", { ascending: true })
            .order("first_name_kanji", { ascending: true });

        if (error) throw error;

        const raw: unknown = data;

        const rows: StaffRow[] = Array.isArray(raw)
            ? raw.filter(isStaffRow)
            : [];

        const list: StaffOption[] = rows
            .map((r) => {
                const id = (r.user_id ?? "").trim();
                if (!id) return null;

                const last = r.last_name_kanji ?? "";
                const first = r.first_name_kanji ?? "";
                const name = `${last}${first}`.trim() || id;

                const rs =
                    typeof r.roster_sort === "number"
                        ? r.roster_sort
                        : typeof r.roster_sort === "string"
                            ? Number(r.roster_sort)
                            : null;

                return { id, name, roster_sort: Number.isFinite(rs as number) ? (rs as number) : null };
            })
            .filter((x): x is StaffOption => x !== null);

        return NextResponse.json(list);
    } catch (e: unknown) {
        console.error("[staff-options] error", e);
        return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
    }
}
