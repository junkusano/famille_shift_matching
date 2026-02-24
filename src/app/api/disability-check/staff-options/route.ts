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

type AssignBody = {
    kaipoke_cs_id: string;
    yearMonth: string;        // YYYY-MM
    kaipokeServicek: string;  // "障害" | "移動支援"
    staffId: string | null;   // user_id or null
};

function isYm(v: string) {
    return /^\d{4}-\d{2}$/.test(v);
}

async function readRoleFromBearer(req: NextRequest): Promise<{ role: string }> {
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) throw new Error("unauthorized:no_token");

    const { data: userRes, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userRes?.user) throw new Error("unauthorized:bad_token");

    const { data: me, error: meErr } = await supabaseAdmin
        .from("user_entry_united_view_single")
        .select("system_role")
        .eq("auth_user_id", userRes.user.id)
        .maybeSingle();

    if (meErr) throw meErr;
    return { role: String(me?.system_role ?? "").trim().toLowerCase() };
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

export async function POST(req: NextRequest) {
    try {
        // 1) 認可（manager/adminのみ）
        const { role } = await readRoleFromBearer(req);
        const isAdmin = role === "admin" || role === "super_admin";
        const isManager = isAdmin || role.includes("manager");
        if (!isManager) {
            return NextResponse.json({ error: "forbidden:not_manager" }, { status: 403 });
        }

        // 2) 入力
        const body = (await req.json()) as AssignBody;

        const kaipoke_cs_id = (body.kaipoke_cs_id ?? "").trim();
        const yearMonth = (body.yearMonth ?? "").trim();
        const kaipokeServicek = (body.kaipokeServicek ?? "").trim();

        // staffId は "" を null に正規化（空文字が入ると「未設定解除」扱いにならないため）
        const staffIdRaw = (body.staffId ?? null);
        const staffId =
            typeof staffIdRaw === "string"
                ? (staffIdRaw.trim() ? staffIdRaw.trim() : null)
                : null;

        if (!kaipoke_cs_id) {
            return NextResponse.json({ error: "bad_request:kaipoke_cs_id" }, { status: 400 });
        }
        if (!yearMonth || !isYm(yearMonth)) {
            return NextResponse.json({ error: "bad_request:yearMonth" }, { status: 400 });
        }

        // テーブル制約に合わせて明示チェック（あなたが提示した CHECK 制約と合わせる）
        if (kaipokeServicek !== "障害" && kaipokeServicek !== "移動支援") {
            return NextResponse.json({ error: "bad_request:kaipokeServicek_invalid" }, { status: 400 });
        }

        // 3) disability_check に upsert（unique: (kaipoke_cs_id, year_month, kaipoke_servicek)）
        const { error: upsertErr } = await supabaseAdmin
            .from("disability_check")
            .upsert(
                {
                    kaipoke_cs_id,
                    year_month: yearMonth,
                    kaipoke_servicek: kaipokeServicek,
                    asigned_jisseki_staff: staffId, // null 可
                },
                { onConflict: "kaipoke_cs_id,year_month,kaipoke_servicek" }
            );

        if (upsertErr) {
            return NextResponse.json(
                { error: "db_upsert_failed", detail: upsertErr.message },
                { status: 500 }
            );
        }

        // 4) 「DBに記録が残った」証拠として disability_check を直接返す
        const { data: saved, error: savedErr } = await supabaseAdmin
            .from("disability_check")
            .select("kaipoke_cs_id,year_month,kaipoke_servicek,asigned_jisseki_staff,is_checked,application_check")
            .eq("kaipoke_cs_id", kaipoke_cs_id)
            .eq("year_month", yearMonth)
            .eq("kaipoke_servicek", kaipokeServicek)
            .maybeSingle();

        if (savedErr) {
            return NextResponse.json(
                { error: "db_readback_failed", detail: savedErr.message },
                { status: 500 }
            );
        }

        // 5) 画面差し替え用に view も返す（従来互換）
        const { data: updated, error: viewErr } = await supabaseAdmin
            .from("disability_check_view")
            .select("*")
            .eq("kaipoke_cs_id", kaipoke_cs_id)
            .eq("year_month", yearMonth)
            .eq("kaipoke_servicek", kaipokeServicek)
            .maybeSingle();

        if (viewErr) {
            return NextResponse.json(
                { error: "view_read_failed", detail: viewErr.message, saved },
                { status: 500 }
            );
        }

        return NextResponse.json({ ok: true, saved, updated });
    } catch (e: unknown) {
        console.error("[staff-options:POST] error", e);
        const msg = e instanceof Error ? e.message : String(e);

        const status =
            msg.startsWith("unauthorized:") ? 401 :
                msg.startsWith("forbidden:") ? 403 :
                    500;

        return NextResponse.json({ error: msg }, { status });
    }
}
