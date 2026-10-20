import { supabaseAdmin } from "@/lib/supabase/service";
import { buildFaxSearchPattern, normalizeFaxNumber } from "@/lib/cm/faxNumberUtils";

const REPLY_LOOKBACK_DAYS = 14;

export type FaxReplyMatch = {
  isReplyCandidate: boolean;
  sentAt: string | null;
  destinationOffice: string | null;
  subject: string | null;
};

type FaxLogRow = {
  fax_number: string | null;
  office_name: string | null;
  subject: string | null;
  accepted_at: string | null;
  created_at: string | null;
  status: string | null;
};

const NO_REPLY: FaxReplyMatch = {
  isReplyCandidate: false,
  sentAt: null,
  destinationOffice: null,
  subject: null,
};

/**
 * 受信FAXが、直近に当社から送信したFAXへの返信かをFAX番号と時刻で判定する。
 * OCR本文の推測だけに依存せず、当社の送信履歴を優先する。
 */
export async function detectFaxReply(
  faxNumber: string | null | undefined,
  receivedAt: string | null | undefined,
): Promise<FaxReplyMatch> {
  const normalizedFax = normalizeFaxNumber(faxNumber);
  const faxSearchPattern = buildFaxSearchPattern(normalizedFax);
  const receivedMs = Date.parse(String(receivedAt ?? ""));
  if (!normalizedFax || !faxSearchPattern || !Number.isFinite(receivedMs)) {
    return NO_REPLY;
  }

  const receivedIso = new Date(receivedMs).toISOString();
  const lookbackIso = new Date(
    receivedMs - REPLY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data, error } = await supabaseAdmin
    .from("fax_log")
    .select("fax_number, office_name, subject, accepted_at, created_at, status")
    .eq("status", "accepted")
    .ilike("fax_number", faxSearchPattern)
    .not("accepted_at", "is", null)
    .gte("accepted_at", lookbackIso)
    .lte("accepted_at", receivedIso)
    .order("accepted_at", { ascending: false })
    .limit(50);

  if (error || !data) return NO_REPLY;

  const match = (data as FaxLogRow[]).find((row) => {
    if (normalizeFaxNumber(row.fax_number) !== normalizedFax) return false;
    const sentMs = Date.parse(String(row.accepted_at ?? ""));
    return Number.isFinite(sentMs) && sentMs <= receivedMs;
  });

  if (!match) return NO_REPLY;

  return {
    isReplyCandidate: true,
    sentAt: match.accepted_at,
    destinationOffice: match.office_name?.trim() || null,
    subject: match.subject?.trim() || null,
  };
}
