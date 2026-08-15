"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabaseClient";

type Staff = { userId: string; label: string; status: string | null };
type PreviewShift = { shift_id: number; shift_start_date: string | null; shift_start_time: string | null; kaipoke_cs_id: string | null; clientName: string | null; staff_01_user_id: string | null; staff_02_user_id: string | null; staff_03_user_id: string | null };
type Summary = { processed_count: number; updated_count: number; deleted_count: number; failed_count: number; weekly_processed_count: number; weekly_updated_count: number; weekly_deleted_count: number };

async function authorizedRequest(path: string, init?: RequestInit) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init?.headers ?? {}) } });
}

export function DepartedStaffShiftBatchCard({ onCompleted }: { onCompleted: () => void }) {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [allowed, setAllowed] = useState(false);
  const [startAt, setStartAt] = useState("");
  const [fromUserId, setFromUserId] = useState("");
  const [toUserId, setToUserId] = useState("");
  const [preview, setPreview] = useState<PreviewShift[]>([]);
  const [weeklyPreviewCount, setWeeklyPreviewCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const selectedNames = useMemo(() => new Map(staff.map((row) => [row.userId, row.label])), [staff]);

  useEffect(() => {
    void (async () => {
      const response = await authorizedRequest("/api/portal/shift-batch-reassign");
      if (!response.ok) return;
      const body = await response.json() as { staff: Staff[] };
      setStaff(body.staff);
      setAllowed(true);
    })();
  }, []);

  if (!allowed) return null;
  const ready = Boolean(startAt && fromUserId && toUserId && fromUserId !== toUserId);
  const requestBody = (action: "preview" | "apply") => JSON.stringify({ action, startAt, fromUserId, toUserId });

  async function loadPreview() {
    if (!ready) return;
    setLoading(true);
    setMessage(null);
    try {
      const response = await authorizedRequest("/api/portal/shift-batch-reassign", { method: "POST", body: requestBody("preview") });
      const body = await response.json() as { count?: number; weeklyCount?: number; shifts?: PreviewShift[]; error?: string };
      if (!response.ok) throw new Error(body.error ?? "プレビューの取得に失敗しました");
      setPreview(body.shifts ?? []);
      setWeeklyPreviewCount(body.weeklyCount ?? 0);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "プレビューの取得に失敗しました");
    } finally { setLoading(false); }
  }

  async function apply() {
    if (!ready || !window.confirm(`通常シフト ${preview.length} 件、週間シフト ${weeklyPreviewCount} 件の担当を一括変更します。よろしいですか？`)) return;
    setLoading(true);
    setMessage(null);
    try {
      const response = await authorizedRequest("/api/portal/shift-batch-reassign", { method: "POST", body: requestBody("apply") });
      const body = await response.json() as { summary?: Summary; error?: string };
      if (!response.ok || !body.summary) throw new Error(body.error ?? "一括変更に失敗しました");
      const result = body.summary;
      setMessage(`完了：通常シフト 成功 ${result.updated_count} 件・削除 ${result.deleted_count} 件・失敗 ${result.failed_count} 件／週間シフト 成功 ${result.weekly_updated_count} 件・削除 ${result.weekly_deleted_count} 件`);
      setPreview([]);
      setWeeklyPreviewCount(0);
      onCompleted();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "一括変更に失敗しました");
    } finally { setLoading(false); }
  }

  return <section className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
    <h2 className="text-base font-bold">退職者シフトの一括変更</h2>
    <p className="mt-1 text-sm text-gray-600">指定日時以降のシフトから、退職者などの担当を引継ぎ先へ変更します。</p>
    <div className="mt-3 grid gap-3 md:grid-cols-3">
      <label className="text-sm">変更開始日時<input className="mt-1 block w-full rounded border bg-white p-2" type="datetime-local" value={startAt} onChange={(event) => setStartAt(event.target.value)} /></label>
      <label className="text-sm">変更元スタッフ<select className="mt-1 block w-full rounded border bg-white p-2" value={fromUserId} onChange={(event) => setFromUserId(event.target.value)}><option value="">選択してください</option>{staff.map((row) => <option key={row.userId} value={row.userId}>{row.label}（{row.userId}）</option>)}</select></label>
      <label className="text-sm">変更先スタッフ<select className="mt-1 block w-full rounded border bg-white p-2" value={toUserId} onChange={(event) => setToUserId(event.target.value)}><option value="">選択してください</option>{staff.map((row) => <option key={row.userId} value={row.userId}>{row.label}（{row.userId}）</option>)}</select></label>
    </div>
    <div className="mt-3 flex flex-wrap items-center gap-2"><Button type="button" variant="outline" disabled={!ready || loading} onClick={() => void loadPreview()}>対象件数をプレビュー</Button>{(preview.length > 0 || weeklyPreviewCount > 0) && <Button type="button" disabled={loading} onClick={() => void apply()}>一括変更を実行</Button>}<span className="text-sm">対象件数: 通常シフト {preview.length}件／週間シフト {weeklyPreviewCount}件</span></div>
    {message && <p className="mt-2 text-sm" role="status">{message}</p>}
    {preview.length > 0 && <div className="mt-3 max-h-64 overflow-auto rounded border bg-white"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-gray-100"><tr><th className="p-2">日時</th><th className="p-2">利用者</th><th className="p-2">現在の担当</th><th className="p-2">変更後</th></tr></thead><tbody>{preview.map((shift) => <tr key={shift.shift_id} className="border-t"><td className="p-2">{shift.shift_start_date} {shift.shift_start_time?.slice(0, 5)}</td><td className="p-2">{shift.clientName ?? shift.kaipoke_cs_id ?? "-"}</td><td className="p-2">{[shift.staff_01_user_id, shift.staff_02_user_id, shift.staff_03_user_id].filter(Boolean).map((id) => selectedNames.get(id ?? "") ?? id).join(" / ")}</td><td className="p-2">{selectedNames.get(toUserId) ?? toUserId}</td></tr>)}</tbody></table></div>}
  </section>;
}
