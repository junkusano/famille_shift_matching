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

    const authUserId = userRes.user.id;

    // 1) まず single
    const { data: me1, error: meErr1 } = await supabaseAdmin
        .from("user_entry_united_view_single")
        .select("system_role")
        .eq("auth_user_id", authUserId)
        .maybeSingle();

    let role = String(me1?.system_role ?? "").trim().toLowerCase();
    let lastErr = meErr1;

    // 2) singleで取れない/空なら fallback で united_view
    if (!lastErr && !role) {
        const { data: me2, error: meErr2 } = await supabaseAdmin
            .from("user_entry_united_view")
            .select("system_role")
            .eq("auth_user_id", authUserId)
            .maybeSingle();

        role = String(me2?.system_role ?? "").trim().toLowerCase();
        lastErr = meErr2;
    }

    if (lastErr) throw lastErr;

    // role が最後まで取れない場合は not_manager 扱い（403に落ちる）
    if (!role) role = "not_manager";

    return { role };
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
        const { role } = await readRoleFromBearer(req);
        const isAdmin = role === "admin" || role === "super_admin";

        // not_manager は明示的に除外した上で manager 系を許可
        const isManager =
            isAdmin ||
            (role !== "not_manager" && role.includes("manager"));

        if (!isManager) {
            return NextResponse.json(
                { error: "forbidden:not_manager", role }, // ←デバッグしやすいよう role も返す
                { status: 403 }
            );
        }

        const body = (await req.json()) as AssignBody;

        if (!body.kaipoke_cs_id) {
            return NextResponse.json({ error: "bad_request:kaipoke_cs_id" }, { status: 400 });
        }
        if (!body.yearMonth || !isYm(body.yearMonth)) {
            return NextResponse.json({ error: "bad_request:yearMonth" }, { status: 400 });
        }
        if (!body.kaipokeServicek) {
            return NextResponse.json({ error: "bad_request:kaipokeServicek" }, { status: 400 });
        }

        // ★追加：kaipoke_cs_id のゆらぎ吸収（全角/空白/ゼロ幅など）
        function normCsIdLoose(s: string) {
            return (s ?? "")
                .normalize("NFKC")
                .replace(/[\s\u00A0\u200B\u200C\u200D\uFEFF　]+/g, "")
                .trim();
        }

        // ★追加：数字だけ版（「7941630」だけ残す）
        function digitsOnly(s: string) {
            return normCsIdLoose(s).replace(/[^\d]/g, "");
        }

        // ★追加：候補リスト（DB上の表記揺れに当てに行く）
        function buildCsIdVariants(input: string): string[] {
            const a = (input ?? "").toString();
            const b = a.trim();
            const c = normCsIdLoose(a);
            const d = digitsOnly(a);

            const set = new Set<string>();
            [a, b, c, d].forEach((v) => {
                const vv = (v ?? "").toString();
                if (vv) set.add(vv);
            });

            return Array.from(set);
        }
        
        const variants = buildCsIdVariants(body.kaipoke_cs_id);

        // 2) 同じ「実質 cs_id」+ 月 の全サービス行を「同じ担当者」にそろえる（ゆらぎ吸収）
        const { error: updateAllErr } = await supabaseAdmin
            .from("disability_check")
            .update({ asigned_jisseki_staff: body.staffId })
            .in("kaipoke_cs_id", variants)
            .eq("year_month", body.yearMonth);

        if (updateAllErr) throw updateAllErr;

        // 3) 保存結果確認（variants でまとめて確認）
        const { data: saved, error: savedErr } = await supabaseAdmin
            .from("disability_check")
            .select("kaipoke_cs_id, kaipoke_servicek, asigned_jisseki_staff")
            .in("kaipoke_cs_id", variants)
            .eq("year_month", body.yearMonth);

        if (savedErr) throw savedErr;

        // 4) view も同月分まとめて返す（variants）
        const { data: updated, error: viewErr } = await supabaseAdmin
            .from("disability_check_view")
            .select("*")
            .in("kaipoke_cs_id", variants)
            .eq("year_month", body.yearMonth);

        if (viewErr) throw viewErr;

        return NextResponse.json({ ok: true, variants, saved, updated });

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
