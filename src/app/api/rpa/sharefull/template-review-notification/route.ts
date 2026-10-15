import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/getAccessToken";
import { sendLWBotMessage } from "@/lib/lineworks/sendLWBotMessage";
import { isRpaTaimeeError, requireTaimeeRpaOperator } from "@/lib/rpa/taimee";
import { supabaseAdmin } from "@/lib/supabase/service";
import { isSharefullSyncClient, sharefullTemplateTableName, sharefullRpaMode } from "@/lib/spot-sync/sharefullScope";

const DEFAULT_CHANNEL_ID = "99142491";

export async function POST(request: NextRequest) {
  try {
    await requireTaimeeRpaOperator(request);
    const body = await request.json() as Record<string, unknown>;
    const coreId = typeof body.core_id === "string" ? body.core_id.trim() : "";
    const templateId = typeof body.template_id === "string" ? body.template_id.trim() : "";
    const templateName = typeof body.template_name === "string" ? body.template_name.trim().slice(0, 200) : "";
    const templateUrl = typeof body.template_url === "string" ? body.template_url.trim() : "";
    let parsedUrl: URL;
    try { parsedUrl = new URL(templateUrl); } catch { parsedUrl = new URL("https://invalid.local"); }
    if (!coreId || !/^\d{4,}$/.test(templateId) || !templateName
      || parsedUrl.origin !== "https://client.sharefull.com"
      || parsedUrl.pathname !== `/order_template/${templateId}`) {
      return NextResponse.json({ error: "通知対象のテンプレート情報が不正です" }, { status: 400 });
    }

    const { data: template, error: lookupError } = await supabaseAdmin
      .from(sharefullTemplateTableName() as never)
      .select("core_id, kaipoke_cs_id, sharefull_template_id")
      .eq("core_id", coreId)
      .maybeSingle();
    if (lookupError) throw lookupError;
    const record = template as unknown as Record<string, unknown> | null;
    if (!record || !isSharefullSyncClient(record.kaipoke_cs_id)
      || String(record.sharefull_template_id ?? "").trim() !== templateId) {
      return NextResponse.json({ error: "保存済みSharefullテンプレートと一致しません" }, { status: 404 });
    }
    if (sharefullRpaMode() === "test") {
      return NextResponse.json({ ok: true, notified: false, skipped: "test_environment" });
    }

    const now = new Date().toISOString();
    const { error: insertError } = await supabaseAdmin.from("sharefull_template_review_notifications" as never)
      .insert({ sharefull_template_id: templateId, core_id: coreId, template_name: templateName, template_url: templateUrl, notification_claimed_at: now, updated_at: now });
    if (insertError) {
      const { data: existing, error: existingError } = await supabaseAdmin
        .from("sharefull_template_review_notifications" as never)
        .select("notified_at, notification_claimed_at")
        .eq("sharefull_template_id", templateId)
        .maybeSingle();
      if (existingError) throw existingError;
      const existingRecord = existing as unknown as { notified_at?: string | null; notification_claimed_at?: string | null } | null;
      if (!existingRecord) throw insertError;
      if (existingRecord.notified_at || existingRecord.notification_claimed_at) {
        return NextResponse.json({ ok: true, notified: Boolean(existingRecord.notified_at), duplicate: true });
      }
      const { data: claim, error: claimError } = await supabaseAdmin
        .from("sharefull_template_review_notifications" as never)
        .update({ core_id: coreId, template_name: templateName, template_url: templateUrl, notification_claimed_at: now, notification_error: null, updated_at: now })
        .eq("sharefull_template_id", templateId)
        .is("notified_at", null)
        .is("notification_claimed_at", null)
        .select("sharefull_template_id")
        .maybeSingle();
      if (claimError) throw claimError;
      if (!claim) return NextResponse.json({ ok: true, notified: false, duplicate: true });
    }

    const message = ["【シェアフル】テンプレートが審査待ちです", `テンプレート名: ${templateName}`, `確認リンク: ${templateUrl}`].join("\n");
    try {
      const channelId = process.env.SHAREFULL_CONTENT_POLICY_CHANNEL_ID?.trim() || DEFAULT_CHANNEL_ID;
      await sendLWBotMessage(channelId, message, await getAccessToken());
    } catch (notificationError) {
      const detail = notificationError instanceof Error ? notificationError.message.slice(0, 500) : "LINE WORKS送信に失敗しました";
      await supabaseAdmin.from("sharefull_template_review_notifications" as never)
        .update({ notification_claimed_at: null, notification_error: detail, updated_at: new Date().toISOString() })
        .eq("sharefull_template_id", templateId);
      return NextResponse.json({ error: "LINE WORKS通知に失敗しました" }, { status: 502 });
    }

    const { error: confirmError } = await supabaseAdmin.from("sharefull_template_review_notifications" as never)
      .update({ notified_at: new Date().toISOString(), notification_claimed_at: null, notification_error: null, updated_at: new Date().toISOString() })
      .eq("sharefull_template_id", templateId);
    if (confirmError) {
      console.error("[rpa/sharefull/template-review-notification] sent but could not record confirmation", { templateId });
      return NextResponse.json({ error: "LINE WORKS送信後の記録に失敗しました。重複防止のため再送を保留しています" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, notified: true });
  } catch (error) {
    if (isRpaTaimeeError(error)) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("[rpa/sharefull/template-review-notification] failed", error);
    return NextResponse.json({ error: "Sharefull審査待ち通知に失敗しました" }, { status: 500 });
  }
}
