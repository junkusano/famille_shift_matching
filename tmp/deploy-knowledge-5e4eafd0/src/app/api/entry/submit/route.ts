import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import { notifyRecruitment, sendApplicantGuide, sendNewApplicantConfirmation } from "@/lib/entry/notifications";

export const runtime = "nodejs";
const safeError = "送信処理を完了できませんでした。時間をおいてもう一度お試しください。";

export async function POST(req: NextRequest) {
  try {
    const { submissionId, payload } = await req.json();
    const validSubmissionId = typeof submissionId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(submissionId);
    const validPayload = payload && typeof payload === "object"
      && typeof payload.email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email.trim())
      && typeof payload.last_name_kanji === "string" && payload.last_name_kanji.trim().length <= 100
      && typeof payload.first_name_kanji === "string" && payload.first_name_kanji.trim().length <= 100
      && payload.agreed_terms === true && payload.agreed_privacy === true;
    if (!validSubmissionId || !validPayload) return NextResponse.json({ ok: false, message: safeError }, { status: 400 });
    const { data, error } = await supabaseAdmin.rpc("submit_entry_application", { p_submission_id: submissionId, p_payload: payload });
    if (error || !data) throw error ?? new Error("Missing submission result");
    const result = data as { kind: string; entry_id?: string; candidate_count?: number };
    const applicant = { name: `${payload.last_name_kanji ?? ""}${payload.first_name_kanji ?? ""}`, kana: `${payload.last_name_kana ?? ""}${payload.first_name_kana ?? ""}`, birth: `${payload.birth_year ?? ""}-${payload.birth_month ?? ""}-${payload.birth_day ?? ""}`, phone: String(payload.phone ?? ""), email: String(payload.email ?? "").trim() };
    console.info("[entry.submit]", { submissionId, entryId: result.entry_id ?? null, result: result.kind });
    if (result.kind === "created") {
      void Promise.allSettled([
        notifyRecruitment("new", applicant, `Entry ID：${result.entry_id ?? ""}\n通常応募がありました。`),
        sendNewApplicantConfirmation(applicant, payload),
      ]).then((r) => console.info("[entry.submit] notifications", { submissionId, results: r.map((x) => x.status) }));
      return NextResponse.json({ ok: true, outcome: "created" });
    }
    void Promise.allSettled([
      notifyRecruitment("candidate", applicant, `${result.entry_id ? `既存Entry ID：${result.entry_id}\n` : ""}通常Entryから応募されましたが、新規Entryは作成していません。${result.kind === "multiple_candidates" ? "既存応募者候補が複数存在するため確認が必要です。" : "再応募として確認してください。"}`),
      sendApplicantGuide("candidate", applicant.email),
    ]).then((r) => console.info("[entry.submit] candidate notifications", { submissionId, results: r.map((x) => x.status) }));
    return NextResponse.json({ ok: true, outcome: "candidate" });
  } catch (e) {
    console.error("[entry.submit] failed", { message: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ ok: false, message: safeError }, { status: 500 });
  }
}
