import { z } from "zod";

export const journeySchema = z.object({
  journeyId: z.string().uuid(),
  source: z.enum(["myfamille_lp", "recruiting_lp", "shi_on_content", "direct_unknown"]),
}).strict();
export const journeyEventSchema = journeySchema.extend({
  event: z.enum(["page_view", "cta_click", "form_start", "validation_error", "submit_attempt", "submit_error"]),
  page: z.enum(["myfamille_lp", "recruiting_lp", "entry"]),
  placement: z.enum(["top", "bottom", "body"]),
}).strict().refine(v => ["page_view", "cta_click"].includes(v.event) || v.page === "entry");

export const journeyLabels: Record<string, string> = {
  myfamille_lp: "MyFamille LP", recruiting_lp: "採用LP", shi_on_content: "施恩サイトから（ページ不明）", direct_unknown: "直接・参照元不明",
  entry: "エントリー", page_view: "ページ表示", cta_click: "応募ボタン", form_start: "入力開始", validation_error: "入力エラー",
  submit_attempt: "送信操作", submit_error: "送信エラー", submit_success: "新規登録成功（サーバー確認）", existing_applicant: "既存応募者の確認依頼",
  top: "上部", bottom: "下部", body: "本文",
};

// Callers supply only fixed event names. No input values are sent to analytics.
export function recruitmentEvent(event: "form_start" | "validation_error" | "submit_attempt" | "submit_error") {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("recruitment:event", { detail: event }));
}
export function recruitmentJourney(): unknown {
  try { return journeySchema.parse(JSON.parse(sessionStorage.getItem("recruitment-journey-v1") || "{}").context); }
  catch { return undefined; }
}
