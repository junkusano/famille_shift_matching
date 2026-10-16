import { NextRequest } from "next/server";
import { POST as runFaxOcr } from "@/app/api/cm/fax/[id]/ocr/route";
import { supabaseAdmin } from "@/lib/supabase/service";

const MAX_FAXES_PER_RUN = 3;
const LINEWORKS_NOTIFIED_META_KEY = "fax_ocr_lineworks_notified_at";
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
 * 受信済みでOCR通知が完了していないFAXを先着順に処理する。
 *
 * 処理開始前にstatusを「OCR処理中」へ更新するため、Cronが重複起動しても
 * 同じFAXを同時にOCRしない。実際のOCR処理は詳細画面の再実行APIと共有する。
 */
export async function runFaxOcrOnReceive(): Promise<FaxOcrOnReceiveResult> {
  const { data: candidates, error: selectError } = await supabaseAdmin
    .from("cm_fax_received")
    .select("id, status, meta")
    .not("file_id", "is", null)
    .neq("status", "OCR処理中")
    .gte("received_at", OCR_RECEIVE_START_AT)
    .order("received_at", { ascending: true })
    .limit(MAX_FAXES_PER_RUN * 10);

  if (selectError) throw selectError;

  const pendingCandidates = (candidates ?? []).filter((candidate) => {
    const meta = candidate.meta && typeof candidate.meta === "object" ? candidate.meta as Record<string, unknown> : {};
    return !meta[LINEWORKS_NOTIFIED_META_KEY];
  }).slice(0, MAX_FAXES_PER_RUN);

  const result: FaxOcrOnReceiveResult = {
    scanned: pendingCandidates.length,
    claimed: 0,
    completed: 0,
    failed: 0,
    faxIds: [],
  };

  for (const candidate of pendingCandidates) {
    const { data: claimed, error: claimError } = await supabaseAdmin
      .from("cm_fax_received")
      .update({ status: "OCR処理中" })
      .eq("id", candidate.id)
      .eq("status", candidate.status)
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
