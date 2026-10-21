import { supabaseAdmin } from "@/lib/supabase/service";
import {
  determineServicesFromCertificates,
  judgeUserCertificatesForService,
  type DocMasterRow,
  type DocItemLite,
  type ServiceKey,
} from "@/lib/certificateJudge";

type AttachmentLike = DocItemLite & {
  id?: string;
  url?: string;
  mimeType?: string | null;
  uploaded_at?: string | null;
  acquired_at?: string | null;
};

function isCertificateAttachment(attachment: AttachmentLike | null | undefined) {
  if (!attachment) return false;
  const type = (attachment.type ?? "").toLowerCase();
  const label = (attachment.label ?? "").toLowerCase();
  return ["資格", "certificate", "certification"].some(
    (keyword) => type.includes(keyword) || label.includes(keyword),
  );
}
async function getUserServiceKeys(authUserId: string): Promise<ServiceKey[]> {
  const [{ data: entry, error: entryError }, { data: masterRows, error: masterError }] = await Promise.all([
    supabaseAdmin.from("form_entries").select("attachments").eq("auth_uid", authUserId).maybeSingle(),
    supabaseAdmin
      .from("user_doc_master")
      .select("category,label,is_active,sort_order,service_key:doc_group")
      .order("sort_order", { ascending: true }),
  ]);

  if (entryError) throw new Error(`資格情報の取得に失敗しました: ${entryError.message}`);
  if (masterError) throw new Error(`資格マスタの取得に失敗しました: ${masterError.message}`);

  const attachments = Array.isArray(entry?.attachments) ? (entry.attachments as AttachmentLike[]) : [];
  const certificateDocs = attachments.filter(isCertificateAttachment);
  return determineServicesFromCertificates(certificateDocs, (masterRows ?? []) as DocMasterRow[]);
}

export async function getAccountIdForAuthUser(authUserId: string) {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("user_id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (error) throw new Error(`職員情報の取得に失敗しました: ${error.message}`);
  return data?.user_id ? String(data.user_id) : null;
}

export async function ensureUserCanRequestShift(authUserId: string, shiftId: number | string) {
  const [{ data: shift, error: shiftError }, serviceKeys] = await Promise.all([
    supabaseAdmin
      .from("shift")
      .select("service_code,require_doc_group")
      .eq("shift_id", Number(shiftId))
      .maybeSingle(),
    getUserServiceKeys(authUserId),
  ]);

  if (shiftError) throw new Error(`シフト資格要件の取得に失敗しました: ${shiftError.message}`);
  if (!shift) throw new Error("対象シフトが見つかりません");

  const result = judgeUserCertificatesForService(
    [],
    [],
    typeof shift.service_code === "string" ? shift.service_code : null,
    typeof shift.require_doc_group === "string" ? shift.require_doc_group : null,
  );

  // judgeUserCertificatesForService の判定に、サーバーで取得した資格キーを使う。
  if (result.requiredKeys.length === 0) return { ok: true as const, serviceKeys };
  const ok = result.requiredKeys.some((key) =>
    serviceKeys.includes(key) || (key === "移動支援" && serviceKeys.includes("家事・身体・移動支援")),
  );
  if (!ok) {
    return {
      ok: false as const,
      serviceKeys,
      error: "保有する資格ではこのサービスに入れません。資格要件を確認してください。",
    };
  }
  return { ok: true as const, serviceKeys };
}

