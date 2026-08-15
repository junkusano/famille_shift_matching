import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { assertCronAuth } from "@/lib/cron/auth";
import { supabaseAdmin } from "@/lib/supabase/service";

export const runtime = "nodejs";
const ENTRY_DRIVE_FOLDER_ID = "1N1EIT1escqpNREOfwc70YgBC8JVu78j2";
export async function GET(req: NextRequest) {
  try {
    assertCronAuth(req);
    const { data: attachments, error } = await supabaseAdmin.from("entry_attachments").select("id,submission_id,entry_id,drive_file_id,status").neq("status", "linked").limit(200);
    if (error) throw error;
    let linked = 0;
    for (const attachment of attachments ?? []) {
      const { data: entry } = await supabaseAdmin.from("form_entries").select("id").eq("submission_id", attachment.submission_id).maybeSingle();
      if (!entry?.id || !attachment.drive_file_id) continue;
      const { error: updateError } = await supabaseAdmin.from("entry_attachments").update({ entry_id: entry.id, status: "linked", updated_at: new Date().toISOString() }).eq("id", attachment.id).neq("status", "linked");
      if (updateError) throw updateError;
      linked += 1;
      console.info("[entry.attachment.reconcile] linked", { attachmentId: attachment.id, entryId: entry.id, driveFileId: attachment.drive_file_id });
    }
    // Recover only files carrying our metadata and only when their submission
    // resolves to exactly one Entry.  This deliberately avoids name-based links.
    const auth = new google.auth.GoogleAuth({ credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!), scopes: ["https://www.googleapis.com/auth/drive.readonly"] });
    const drive = google.drive({ version: "v3", auth });
    const driveFiles = await drive.files.list({ q: `'${ENTRY_DRIVE_FOLDER_ID}' in parents and trashed = false`, fields: "files(id,name,mimeType,webViewLink,appProperties)", pageSize: 1000, supportsAllDrives: true, includeItemsFromAllDrives: true });
    let recreated = 0;
    for (const file of driveFiles.data.files ?? []) {
      const submissionId = file.appProperties?.entry_submission_id;
      const slot = file.appProperties?.entry_attachment_slot;
      if (!file.id || !submissionId || !slot) continue;
      const { data: existing } = await supabaseAdmin.from("entry_attachments").select("id").eq("drive_file_id", file.id).maybeSingle();
      if (existing) continue;
      const { data: entry } = await supabaseAdmin.from("form_entries").select("id").eq("submission_id", submissionId).maybeSingle();
      if (!entry?.id) { console.warn("[entry.attachment.reconcile] unlinked Drive file skipped", { driveFileId: file.id, submissionId }); continue; }
      const { error: recreateError } = await supabaseAdmin.from("entry_attachments").insert({ submission_id: submissionId, entry_id: entry.id, upload_token: file.appProperties?.entry_upload_token, slot, original_filename: file.name ?? "unknown", drive_file_id: file.id, drive_web_view_link: file.webViewLink ?? `https://drive.google.com/open?id=${file.id}`, mime_type: file.mimeType ?? null, status: "linked" });
      if (recreateError) throw recreateError;
      recreated += 1;
      console.info("[entry.attachment.reconcile] recreated", { entryId: entry.id, driveFileId: file.id });
    }
    return NextResponse.json({ ok: true, scanned: attachments?.length ?? 0, linked, recreated });
  } catch (e) {
    console.error("[entry.attachment.reconcile] failed", { message: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ ok: false, error: "reconcile_failed" }, { status: 500 });
  }
}
