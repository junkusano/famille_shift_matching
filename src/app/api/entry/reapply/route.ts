import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import { notifyRecruitment, sendApplicantGuide } from "@/lib/entry/notifications";

export const runtime = "nodejs";
const normal = (v: unknown) => String(v ?? "").trim().toLowerCase();
const publicNotFound = "過去の応募情報を確認できませんでした。入力内容をご確認いただくか、通常の応募フォームからお申し込みください。";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const required = [body.lastNameKanji, body.firstNameKanji, body.lastNameKana, body.firstNameKana, body.birthYear, body.birthMonth, body.birthDay, body.phone, body.email];
    if (required.some((v) => !String(v ?? "").trim())) return NextResponse.json({ ok: false, message: publicNotFound }, { status: 400 });
    const { data: rows, error } = await supabaseAdmin.from("form_entries").select("id,auth_uid,phone,email,reapply_requested_at,last_name_kanji,first_name_kanji,last_name_kana,first_name_kana,birth_year,birth_month,birth_day").eq("birth_year", Number(body.birthYear)).eq("birth_month", Number(body.birthMonth)).eq("birth_day", Number(body.birthDay));
    if (error) throw error;
    const matches = (rows ?? []).filter((r) => normal(r.last_name_kanji) === normal(body.lastNameKanji) && normal(r.first_name_kanji) === normal(body.firstNameKanji) && normal(r.last_name_kana) === normal(body.lastNameKana) && normal(r.first_name_kana) === normal(body.firstNameKana));
    const applicant = { name: `${body.lastNameKanji}${body.firstNameKanji}`, kana: `${body.lastNameKana}${body.firstNameKana}`, birth: `${body.birthYear}-${body.birthMonth}-${body.birthDay}`, phone: String(body.phone).trim(), email: String(body.email).trim() };
    if (matches.length !== 1) {
      if (matches.length > 1) void notifyRecruitment("candidate", applicant, "再応募フォームから申請されましたが、既存応募者候補が複数存在するため確認が必要です。").catch((e) => console.error("[entry.reapply] LINE WORKS failed", { message: String(e) }));
      return NextResponse.json({ ok: false, message: publicNotFound });
    }
    const entry = matches[0];
    const { data: users, error: userError } = await supabaseAdmin.from("users").select("user_id,auth_user_id,status").eq("entry_id", entry.id);
    if (userError) throw userError;
    const linkedAuth = entry.auth_uid;
    if (linkedAuth && (users ?? []).some((u) => u.auth_user_id && u.auth_user_id !== linkedAuth)) throw new Error("Auth identity mismatch");
    const { error: updateError } = await supabaseAdmin.from("form_entries").update({ email: applicant.email, phone: applicant.phone, auth_uid: null, reapply_requested_at: new Date().toISOString() }).eq("id", entry.id);
    if (updateError) throw updateError;
    if (users?.length) {
      const { error: clearError } = await supabaseAdmin.from("users").update({ auth_user_id: null }).eq("entry_id", entry.id).eq("auth_user_id", linkedAuth ?? "");
      if (clearError) throw clearError;
    }
    if (linkedAuth) {
      const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(linkedAuth);
      if (deleteError) {
        // Keep the application and authentication linkage consistent if deletion
        // fails. Notifications are sent only after this completes successfully.
        await supabaseAdmin.from("form_entries").update({ email: entry.email, phone: entry.phone, auth_uid: linkedAuth, reapply_requested_at: entry.reapply_requested_at }).eq("id", entry.id);
        if (users?.length) await supabaseAdmin.from("users").update({ auth_user_id: linkedAuth }).eq("entry_id", entry.id);
        throw deleteError;
      }
    }
    const existingStatus = users?.map((u) => u.status).filter(Boolean).join(", ") || "未設定";
    void Promise.allSettled([notifyRecruitment("reapply", applicant, `既存Entry ID：${entry.id}\n既存status：${existingStatus}\n再応募フォームから申請され、既存Entry情報を更新しています。`), sendApplicantGuide("reapply", applicant.email)]).then((r) => console.info("[entry.reapply] notifications", { entryId: entry.id, results: r.map((x) => x.status) }));
    console.info("[entry.reapply] complete", { entryId: entry.id, authDeleted: Boolean(linkedAuth) });
    return NextResponse.json({ ok: true, message: "再応募を受け付けました。今後の手続きについては改めてご案内いたします。" });
  } catch (e) {
    console.error("[entry.reapply] failed", { message: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ ok: false, message: "再応募の受付を完了できませんでした。時間をおいてお試しください。" }, { status: 500 });
  }
}
