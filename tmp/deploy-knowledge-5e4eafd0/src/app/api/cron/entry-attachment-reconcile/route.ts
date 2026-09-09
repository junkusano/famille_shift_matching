import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { assertCronAuth } from "@/lib/cron/auth";
import { supabaseAdmin } from "@/lib/supabase/service";

export const runtime = "nodejs";
const ENTRY_DRIVE_FOLDER_ID = "1N1EIT1escqpNREOfwc70YgBC8JVu78j2";

function legacyType(slot: string) {
  if (slot === "license_front") return "免許証表";
  if (slot === "license_back") return "免許証裏";
  if (slot === "residence_card") return "住民票";
  if (slot.startsWith("certificate_")) return "資格証明書";
  return "その他";
}

async function syncEntryDisplayFields(entryId: string) {
  const { data: files, error: filesError } = await supabaseAdmin
    .from("entry_attachments")
    .select("id,slot,original_filename,drive_file_id,mime_type,created_at")
    .eq("entry_id", entryId)
    .eq("status", "linked")
    .not("drive_file_id", "is", null);
  if (filesError) throw filesError;
  if (!files?.length) return 0;

  const { data: entry, error: entryError } = await supabaseAdmin
    .from("form_entries")
    .select("attachments,photo_url,license_front_url,license_back_url,residence_card_url,certifications")
    .eq("id", entryId)
    .single();
  if (entryError) throw entryError;

  const existing = Array.isArray(entry.attachments) ? entry.attachments : [];
  const urls = new Set(existing.map((item: { url?: string }) => item?.url).filter(Boolean));
  const additions = files
    .map((file) => ({
      url: `https://drive.google.com/uc?export=view&id=${file.drive_file_id}`,
      type: legacyType(file.slot),
      label: file.original_filename,
      mimeType: file.mime_type,
      uploaded_at: file.created_at,
    }))
    .filter((item) => !urls.has(item.url));
  const bySlot = new Map(files.map((file) => [file.slot, `https://drive.google.com/uc?export=view&id=${file.drive_file_id}`]));
  const certificates = Array.isArray(entry.certifications) ? entry.certifications : [];
  const certificateUrls = files.filter((file) => file.slot.startsWith("certificate_")).map((file) => `https://drive.google.com/uc?export=view&id=${file.drive_file_id}`);
  const update = {
    attachments: [...existing, ...additions],
    photo_url: entry.photo_url ?? bySlot.get("photo") ?? null,
    license_front_url: entry.license_front_url ?? bySlot.get("license_front") ?? null,
    license_back_url: entry.license_back_url ?? bySlot.get("license_back") ?? null,
    residence_card_url: entry.residence_card_url ?? bySlot.get("residence_card") ?? null,
    certifications: [...certificates, ...certificateUrls.filter((url) => !certificates.includes(url))],
  };
  const { error: updateError } = await supabaseAdmin.from("form_entries").update(update).eq("id", entryId);
  if (updateError) throw updateError;
  return additions.length;
}

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
    // The staff detail page still reads the legacy URL/attachments columns.
    // Mirror linked records into those fields so both new and existing UI paths
    // show the recovered files without losing the canonical attachment record.
    const { data: linkedRows, error: linkedRowsError } = await supabaseAdmin
      .from("entry_attachments")
      .select("entry_id")
      .eq("status", "linked")
      .not("entry_id", "is", null)
      .limit(1000);
    if (linkedRowsError) throw linkedRowsError;
    const entryIds = [...new Set((linkedRows ?? []).map((row) => row.entry_id).filter((id): id is string => Boolean(id)))];
    let mirrored = 0;
    for (const entryId of entryIds) mirrored += await syncEntryDisplayFields(entryId);
    console.info("[entry.attachment.reconcile] display fields mirrored", { entryCount: entryIds.length, attachmentCount: mirrored });
    return NextResponse.json({ ok: true, scanned: attachments?.length ?? 0, linked, recreated, mirrored });
  } catch (e) {
    console.error("[entry.attachment.reconcile] failed", { message: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ ok: false, error: "reconcile_failed" }, { status: 500 });
  }
}
