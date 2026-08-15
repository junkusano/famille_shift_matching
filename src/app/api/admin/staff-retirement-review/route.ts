import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import { fetchAllLineworksUsers } from "@/lib/lineworks/fetchAllUsers";
import { deleteLineWorksUser } from "@/lib/lineworks/delete-user";

type ReviewRow = { user_id: string; staff_name: string; status: string | null; lw_userid: string | null; last_shift_date: string | null; hired_at: string | null };

async function requireAdmin(req: NextRequest) {
  const token = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new Error("UNAUTHORIZED");
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) throw new Error("UNAUTHORIZED");
  const { data: me } = await supabaseAdmin.from("users").select("system_role").eq("auth_user_id", data.user.id).maybeSingle();
  if (me?.system_role !== "admin") throw new Error("FORBIDDEN");
}

async function markRemoved(userId: string) {
  const { error } = await supabaseAdmin.from("users").update({ status: "removed_from_lineworks_kaipoke" }).eq("user_id", userId);
  if (error) throw error;
}

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const [{ data, error }, lineworksUsers] = await Promise.all([
      supabaseAdmin.rpc("staff_retirement_review_rows"),
      fetchAllLineworksUsers(),
    ]);
    if (error) throw error;
    const liveIds = new Set(lineworksUsers.map((user) => user.userId));
    const excludedOrgUserIds = new Set(
      lineworksUsers
        .filter((user) => user.organizations?.some((organization) =>
          organization.orgUnits?.some((orgUnit) => ["fb9bab81-5f4e-4725-2d34-05240f80a71a", "5b26013b-a3d4-42ab-266c-05cad5ab1c10"].includes(orgUnit.orgUnitId ?? ""))
        ))
        .map((user) => user.userId)
    );
    const today = new Date();
    const rows = ((data ?? []) as ReviewRow[]).flatMap((row) => {
      if (row.lw_userid && excludedOrgUserIds.has(row.lw_userid)) return [];
      const removed = row.status === "removed_from_lineworks_kaipoke";
      const lineworksExists = !!row.lw_userid && liveIds.has(row.lw_userid);
      const lastShift = row.last_shift_date ? new Date(`${row.last_shift_date}T00:00:00`) : null;
      const hiredAt = row.hired_at ? new Date(row.hired_at) : null;
      const reference = lastShift ?? hiredAt;
      const inactiveDays = reference ? Math.floor((today.getTime() - reference.getTime()) / 86_400_000) : null;
      const inactive = !removed && inactiveDays !== null && inactiveDays >= 30;
      const reasons: string[] = [];
      if (!removed && !lineworksExists) reasons.push("LINE WORKS登録なし");
      if (removed && lineworksExists) reasons.push("LINE WORKS削除漏れ");
      if (inactive) reasons.push("1か月以上未稼働");
      if (!reasons.length) return [];
      const action = !removed && !lineworksExists ? "mark-removed" : removed && lineworksExists ? "delete-lineworks" : "retire";
      return [{ ...row, removed, lineworks_exists: lineworksExists, inactive_days: inactiveDays, reasons, action }];
    });
    return NextResponse.json({ ok: true, rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: message === "UNAUTHORIZED" ? 401 : message === "FORBIDDEN" ? 403 : 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);
    const { user_id, action } = await req.json() as { user_id?: string; action?: "mark-removed" | "delete-lineworks" | "retire" };
    if (!user_id || !action) return NextResponse.json({ ok: false, error: "不正なリクエストです" }, { status: 400 });
    const { data: user, error } = await supabaseAdmin.from("users").select("user_id,status,lw_userid").eq("user_id", user_id).maybeSingle();
    if (error || !user) return NextResponse.json({ ok: false, error: "職員が見つかりません" }, { status: 404 });
    if (action === "mark-removed") await markRemoved(user.user_id);
    else {
      if (user.lw_userid) await deleteLineWorksUser(user.lw_userid);
      if (action === "retire") await markRemoved(user.user_id);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "処理に失敗しました";
    return NextResponse.json({ ok: false, error: message }, { status: message === "UNAUTHORIZED" ? 401 : message === "FORBIDDEN" ? 403 : 500 });
  }
}
