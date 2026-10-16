import { NextRequest } from "next/server";
import { POST as runFaxOcr } from "@/app/api/cm/fax/[id]/ocr/route";
import { supabaseAdmin } from "@/lib/supabase/service";

const MAX_FAXES_PER_RUN = 3;
const CANDIDATE_SCAN_LIMIT = MAX_FAXES_PER_RUN * 100;
const OCR_PROCESSING_STATUS = "OCR処理中";
const OCR_RETRY_CLAIM_STATUS = "OCR再処理中";
const LINEWORKS_NOTIFIED_META_KEY = "fax_ocr_lineworks_notified_at";
const configuredStaleMinutes = Number(process.env.FAX_OCR_STALE_PROCESSING_MINUTES?.trim() || "10");
const STALE_OCR_PROCESSING_MINUTES = Number.isFinite(configuredStaleMinutes)
  ? Math.max(configuredStaleMinutes, 1)
  : 10;
// 自動通知の運用開始前に受信した履歴FAXは、初回Cronで遡って通知しない。
// 運用開始時刻を変更する場合はVercelの環境変数で上書きする。
const OCR_RECEIVE_START_AT = process.env.FAX_OCR_ON_RECEIVE_START_AT?.trim()
  || "2026-10-16T13:20:00+09:00";

export type FaxOcrOnReceiveResult = {
  scanned: number;
  claimed: number;
  completed: number;
  failed: number;
  faxIds: number[];
};

/**
 * 受信済みでOCR通知が完了していないFAXを新着順に処理する。
 *
 * 処理開始前にstatusを「OCR処理中」へ更新するため、Cronが重複起動しても
 * 同じFAXを同時にOCRしない。一定時間更新されていない処理中FAXは、途中失敗から復旧する。
 */
export async function runFaxOcrOnReceive(): Promise<FaxOcrOnReceiveResult> {
  const { data: candidates, error: selectError } = await supabaseAdmin
    .from("cm_fax_received")
    .select("id, status, meta, updated_at")
    .not("file_id", "is", null)
    .gte("received_at", OCR_RECEIVE_START_AT)
    // 古い処理中FAXが大量に残っていても、新着FAXの通知を優先する。
    .order("received_at", { ascending: false })
    .limit(CANDIDATE_SCAN_LIMIT);

  if (selectError) throw selectError;

  const pendingCandidates = (candidates ?? []).filter((candidate) => {
    const meta = candidate.meta && typeof candidate.meta === "object" ? candidate.meta as Record<string, unknown> : {};
    if (meta[LINEWORKS_NOTIFIED_META_KEY]) return false;
    if (candidate.status === OCR_RETRY_CLAIM_STATUS) return false;
    if (candidate.status !== OCR_PROCESSING_STATUS) return true;

    const updatedAt = Date.parse(String(candidate.updated_at ?? ""));
    const staleAfterMs = STALE_OCR_PROCESSING_MINUTES * 60 * 1000;
    return Number.isFinite(updatedAt) && Date.now() - updatedAt >= staleAfterMs;
  }).slice(0, MAX_FAXES_PER_RUN);

  const result: FaxOcrOnReceiveResult = {
    scanned: pendingCandidates.length,
    claimed: 0,
    completed: 0,
    failed: 0,
    faxIds: [],
  };

  for (const candidate of pendingCandidates) {
    const claimStatus = candidate.status === OCR_PROCESSING_STATUS
      ? OCR_RETRY_CLAIM_STATUS
      : OCR_PROCESSING_STATUS;
    const { data: claimed, error: claimError } = await supabaseAdmin
      .from("cm_fax_received")
      .update({ status: claimStatus })
      .eq("id", candidate.id)
      .eq("status", candidate.status)
      .eq("updated_at", candidate.updated_at)
      .select("id")
      .maybeSingle();

    if (claimError) throw claimError;
    if (!claimed) continue;

    result.claimed += 1;
    result.faxIds.push(candidate.id);

    const response = await runFaxOcr(
      new NextRequest(`https://internal.invalid/api/cm/fax/${candidate.id}/ocr`, {
        method: "POST",
      }),
      { params: Promise.resolve({ id: String(candidate.id) }) },
    );

    if (response.ok) {
      result.completed += 1;
    } else {
      result.failed += 1;
    }
  }

  return result;
}
