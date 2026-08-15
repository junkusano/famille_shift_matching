import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { Readable } from "stream";
import { supabaseAdmin } from "@/lib/supabase/service";

export const runtime = "nodejs";
const ENTRY_DRIVE_FOLDER_ID = "1N1EIT1escqpNREOfwc70YgBC8JVu78j2";
const stream = (buffer: Buffer) => Readable.from(buffer);

export async function POST(req: NextRequest) {
  let attachmentId: string | null = null;
  let submissionId: string | null = null;
  try {
    const body = await req.formData();
    const file = body.get("file");
    const slot = String(body.get("slot") ?? "").trim();
    submissionId = String(body.get("submissionId") ?? "").trim();
    if (!(file instanceof File) || !slot || !submissionId) return NextResponse.json({ ok: false, message: "添付を受け付けられませんでした。" }, { status: 400 });

    const { data: created, error: pendingError } = await supabaseAdmin.from("entry_attachments")
      .insert({ submission_id: submissionId, slot, original_filename: file.name, status: "pending" })
      .select("id,upload_token").single();
    if (pendingError || !created) throw pendingError ?? new Error("Attachment draft creation failed");
    attachmentId = created.id;

    const auth = new google.auth.GoogleAuth({ credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!), scopes: ["https://www.googleapis.com/auth/drive"] });
    const drive = google.drive({ version: "v3", auth });
    const uploaded = await drive.files.create({
      requestBody: { name: file.name, parents: [ENTRY_DRIVE_FOLDER_ID], appProperties: { entry_upload_token: created.upload_token, entry_submission_id: submissionId, entry_attachment_slot: slot } },
      media: { mimeType: file.type || undefined, body: stream(Buffer.from(await file.arrayBuffer())) },
      supportsAllDrives: true,
      fields: "id,webViewLink,mimeType",
    });
    if (!uploaded.data.id) throw new Error("Drive file id missing");
    await drive.permissions.create({ fileId: uploaded.data.id, requestBody: { role: "reader", type: "anyone", allowFileDiscovery: false }, supportsAllDrives: true });
    const { data: entry } = await supabaseAdmin.from("form_entries").select("id").eq("submission_id", submissionId).maybeSingle();
    const fileUrl = uploaded.data.webViewLink ?? `https://drive.google.com/open?id=${uploaded.data.id}`;
    const { error: linkedError } = await supabaseAdmin.from("entry_attachments").update({ entry_id: entry?.id ?? null, drive_file_id: uploaded.data.id, drive_web_view_link: fileUrl, mime_type: uploaded.data.mimeType ?? file.type, status: entry?.id ? "linked" : "uploaded", updated_at: new Date().toISOString() }).eq("id", attachmentId);
    if (linkedError) throw linkedError;
    console.info("[entry.attachment] linked", { submissionId, attachmentId, entryId: entry?.id ?? null, driveFileId: uploaded.data.id });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (attachmentId) await supabaseAdmin.from("entry_attachments").update({ status: "failed", error_code: "upload_or_link_failed", updated_at: new Date().toISOString() }).eq("id", attachmentId);
    console.error("[entry.attachment] failed", { submissionId, attachmentId, message: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ ok: false, message: "添付の保存に失敗しました。後ほど自動的に再確認します。" }, { status: 500 });
  }
}
