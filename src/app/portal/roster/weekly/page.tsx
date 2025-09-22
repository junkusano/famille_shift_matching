// /portal/roster/weekly/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Save, RefreshCcw, Eye } from "lucide-react";

/**
 * shadcn/ui（monthlyと同一コンポーネントを使用）
 * - Select / Button は /portal/roster/monthly と同じ import 先です
 *   （@/components/ui/* のパスはプロジェクト既存定義を想定）
 */
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

// =========================
// Types
// =========================
export type TemplateRow = {
  template_id?: number;
  kaipoke_cs_id: string;
  weekday: number; // 0(日)-6(土)
  start_time: string; // HH:MM
  end_time: string; // HH:MM
  service_code: string;
  required_staff_count: number;
  two_person_work_flg: boolean;
  judo_ido?: string | null;
  staff_01_user_id?: string | null;
  staff_02_user_id?: string | null;
  staff_03_user_id?: string | null;
  staff_02_attend_flg: boolean;
  staff_03_attend_flg: boolean;
  staff_01_role_code?: string | null; // "-999" | "01" | "02"
  staff_02_role_code?: string | null;
  staff_03_role_code?: string | null;
  active: boolean;
  effective_from?: string | null; // YYYY-MM-DD
  effective_to?: string | null;   // YYYY-MM-DD
  is_biweekly?: boolean | null;
  nth_weeks?: number[] | null; // [1..5]
  _cid?: string;        // client helper
  _selected?: boolean;  // client helper
};

export type PreviewRow = {
  kaipoke_cs_id: string;
  shift_start_date: string; // YYYY-MM-DD
  shift_start_time: string; // HH:MM:SS
  shift_end_time: string;   // HH:MM:SS
  service_code: string;
  required_staff_count: number;
  two_person_work_flg: boolean;
  judo_ido: string | null;
  staff_01_user_id: string | null;
  staff_02_user_id: string | null;
  staff_03_user_id: string | null;
  staff_02_attend_flg: boolean;
  staff_03_attend_flg: boolean;
  staff_01_role_code: string | null;
  staff_02_role_code: string | null;
  staff_03_role_code: string | null;
  has_conflict: boolean;
};

type KaipokeCs = {
  id: string;
  kaipoke_cs_id: string;
  name: string;
  end_at: string | null;
};

// =========================
// Helpers（monthlyのフィルター仕様を踏襲）
// =========================
const WEEKS_JP = ["日", "月", "火", "水", "木", "金", "土"];
//const TZ = "Asia/Tokyo";

const yyyymm = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

const addMonths = (month: string, diff: number) => {
  const [y, m] = month.split("-").map(Number);
  const dt = new Date(y, (m - 1) + diff, 1);
  return yyyymm(dt);
};

const nowYYYYMM = () => yyyymm(new Date());

// 「タグ文字列が混入するケース」対策：HTMLタグ除去＋エンティティ簡易デコード
const decodeEntities = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const stripTags = (s: string) => s.replace(/<[^>]*>/g, "");
const cleanText = (v: string | null) => (v ? stripTags(decodeEntities(v)) : "");

// =========================
// Validation
// =========================
function validateRow(r: TemplateRow): string[] {
  const errs: string[] = [];
  const re = /^\d{2}:\d{2}$/;
  if (!re.test(r.start_time)) errs.push("開始時刻の形式が不正です");
  if (!re.test(r.end_time)) errs.push("終了時刻の形式が不正です");
  if (re.test(r.start_time) && re.test(r.end_time) && r.end_time <= r.start_time) {
    errs.push("終了時刻は開始より後である必要があります");
  }
  if (r.weekday < 0 || r.weekday > 6) errs.push("曜日が不正です");
  if (!r.service_code) errs.push("サービス内容（service_code）を入力してください");
  if (r.required_staff_count < 1) errs.push("派遣人数は1以上にしてください");
  if (r.nth_weeks && r.nth_weeks.some((n) => n < 1 || n > 5)) errs.push("第n週は1〜5で指定してください");
  if (r.judo_ido && !/^([0-2][0-9][0-5][0-9])$/.test(r.judo_ido)) errs.push("重訪移動（judo_ido）はHHMM形式");
  const rolesOk = (x?: string | null) => !x || x === "-999" || x === "01" || x === "02";
  if (!rolesOk(r.staff_01_role_code) || !rolesOk(r.staff_02_role_code) || !rolesOk(r.staff_03_role_code)) {
    errs.push("ロールコードは '-999' / '01' / '02' のみ有効です");
  }
  return errs;
}

function hasDuplicate(rows: TemplateRow[]): boolean {
  const key = (r: TemplateRow) => r.kaipoke_cs_id + "|" + r.weekday + "|" + r.start_time;
  const set = new Set<string>();
  for (const r of rows) {
    const k = key(r);
    if (set.has(k)) return true;
    set.add(k);
  }
  return false;
}

// =========================
/** API wrappers */
// =========================
async function apiFetchTemplates(cs: string): Promise<TemplateRow[]> {
  const res = await fetch("/api/roster/weekly/templates?kaipoke_cs_id=" + encodeURIComponent(cs), { cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  const data = (await res.json()) as { rows?: TemplateRow[] };
  const base = data && data.rows ? data.rows : [];
  return base.map((r) => ({
    ...r,
    _cid: (typeof crypto !== "undefined" && "randomUUID" in crypto) ? crypto.randomUUID() : String(Math.random()),
    _selected: false,
  }));
}

async function apiBulkUpsert(rows: Omit<TemplateRow, "_cid" | "_selected">[]) {
  const res = await fetch("/api/roster/weekly/templates/bulk_upsert", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rows }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function apiBulkDelete(templateIds: number[]) {
  const res = await fetch("/api/roster/weekly/templates/bulk_delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ template_ids: templateIds }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function apiPreviewMonth(month: string, cs: string, useRecurrence: boolean): Promise<PreviewRow[]> {
  const q = new URLSearchParams({ month, kaipoke_cs_id: cs, recurrence: String(useRecurrence) });
  const res = await fetch("/api/roster/weekly/preview?" + q.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  const data = (await res.json()) as { rows?: PreviewRow[] };
  return data && data.rows ? data.rows : [];
}

// =========================
// Small UI bits
// =========================
const Pill: React.FC<{ label: string; tone?: "ok" | "warn" | "muted" }> = ({ label, tone = "muted" }) => {
  const cls = [
    "inline-flex items-center rounded-full px-2 py-0.5 text-xs border",
    tone === "ok" ? "bg-green-50 border-green-200 text-green-700" : "",
    tone === "warn" ? "bg-amber-50 border-amber-200 text-amber-700" : "",
    tone === "muted" ? "bg-slate-50 border-slate-200 text-slate-600" : "",
  ].filter(Boolean).join(" ");
  return <span className={cls}>{label}</span>;
};

// =========================
// Main Page
// =========================
export default function WeeklyRosterPage() {
  // ==== Masters for filters ====
  const [kaipokeCs, setKaipokeCs] = useState<KaipokeCs[]>([]);
  const [selectedKaipokeCS, setSelectedKaipokeCS] = useState<string>("");
  const [selectedMonth, setSelectedMonth] = useState<string>(nowYYYYMM());

  // ==== Page states ====
  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [useRecurrence, setUseRecurrence] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ==== Derived ====
  const duplicate = useMemo(() => hasDuplicate(rows), [rows]);
  const invalidCount = useMemo(() => rows.reduce((acc, r) => acc + validateRow(r).length, 0), [rows]);
  const totalMinutes = useMemo(() => {
    const toMin = (hhmm: string) => {
      const [hh, mm] = hhmm.split(":").map((x) => Number(x));
      return hh * 60 + mm;
    };
    return rows.reduce((acc, r) => acc + Math.max(0, toMin(r.end_time) - toMin(r.start_time)), 0);
  }, [rows]);

  const monthOptions = useMemo(() => {
    const base = nowYYYYMM();
    const list: string[] = [];
    for (let i = 5 * 12; i >= 1; i--) list.push(addMonths(base, -i));
    list.push(base);
    for (let i = 1; i <= 12; i++) list.push(addMonths(base, i));
    return list;
  }, []);

  // 利用者 前後ナビ
  const csIndex = useMemo(() => kaipokeCs.findIndex((c) => c.kaipoke_cs_id === selectedKaipokeCS), [kaipokeCs, selectedKaipokeCS]);
  const csPrev = csIndex > 0 ? kaipokeCs[csIndex - 1] : null;
  const csNext = csIndex >= 0 && csIndex < kaipokeCs.length - 1 ? kaipokeCs[csIndex + 1] : null;

  // ==== Effects ====
  // masters
  useEffect(() => {
    const loadMasters = async () => {
      try {
        const res = await fetch("/api/kaipoke-info", { cache: "no-store" });
        const js = await res.json();
        const arr: KaipokeCs[] = Array.isArray(js) ? js : [];
        const valid = arr
          .filter((c) => c.kaipoke_cs_id && c.name)
          .sort((a, b) => a.name.localeCompare(b.name, "ja"));
        setKaipokeCs(valid);
        if (valid.length && !selectedKaipokeCS) setSelectedKaipokeCS(valid[0].kaipoke_cs_id);
      } catch (e) {
        console.error(e);
      }
    };
    void loadMasters();
  }, []); // monthlyの実装に準拠。:contentReference[oaicite:2]{index=2}

  // templates
  useEffect(() => {
    const load = async () => {
      if (!selectedKaipokeCS) {
        setRows([]);
        return;
      }
      setLoading(true);
      setError(null);
      setPreview(null);
      try {
        const data = await apiFetchTemplates(selectedKaipokeCS);
        setRows(data);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [selectedKaipokeCS]);

  // ==== Actions ====
  function addRow() {
    if (!selectedKaipokeCS) {
      alert("先に利用者を選択してください");
      return;
    }
    const newRow: TemplateRow = {
      kaipoke_cs_id: selectedKaipokeCS,
      weekday: 1,
      start_time: "09:00",
      end_time: "10:00",
      service_code: "",
      required_staff_count: 1,
      two_person_work_flg: false,
      judo_ido: null,
      staff_01_user_id: null,
      staff_02_user_id: null,
      staff_03_user_id: null,
      staff_02_attend_flg: false,
      staff_03_attend_flg: false,
      staff_01_role_code: null,
      staff_02_role_code: null,
      staff_03_role_code: null,
      active: true,
      effective_from: null,
      effective_to: null,
      is_biweekly: null,
      nth_weeks: null,
      _cid: (typeof crypto !== "undefined" && "randomUUID" in crypto) ? crypto.randomUUID() : String(Math.random()),
      _selected: false,
    };
    setRows((rs) => rs.concat([newRow]));
  }

  function updateRow(cid: string, patch: Partial<TemplateRow>) {
    setRows((rs) => rs.map((r) => (r._cid === cid ? { ...r, ...patch } : r)));
  }

  function removeSelected() {
    const idsToDelete = rows.filter((r) => !!r._selected && !!r.template_id).map((r) => r.template_id as number);
    const remaining = rows.filter((r) => !r._selected);
    if (idsToDelete.length === 0) {
      setRows(remaining);
      return;
    }
    if (!confirm(idsToDelete.length + "件の既存テンプレを削除します。よろしいですか？")) return;
    setLoading(true);
    apiBulkDelete(idsToDelete)
      .then(() => setRows(remaining))
      .catch((e: unknown) => alert(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }

  async function saveAll() {
    const allErrs = rows.flatMap((r, i) => validateRow(r).map((m) => "#" + (i + 1) + ": " + m));
    if (duplicate) {
      alert("同一曜日・開始時刻の重複があります。修正してください。");
      return;
    }
    if (allErrs.length) {
      const head = allErrs.slice(0, 5).join("\n");
      const msg = ["警告:", head, "...他" + allErrs.length + "件", "保存を続行しますか？"].join("\n");
      if (!confirm(msg)) return;
    }
    setSaving(true);
    setError(null);
    try {
      type ServerRow = Omit<TemplateRow, "_cid" | "_selected">;
      const payload: ServerRow[] = rows.map((r) => {
        const obj: Record<string, unknown> = { ...r };
        delete (obj as { _cid?: string })._cid;
        delete (obj as { _selected?: boolean })._selected;
        return obj as ServerRow;
      });
      await apiBulkUpsert(payload);
      // 最新を再読込
      const data = await apiFetchTemplates(selectedKaipokeCS);
      setRows(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function doPreview() {
    if (!selectedKaipokeCS) {
      alert("利用者を選択してください");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const p = await apiPreviewMonth(selectedMonth, selectedKaipokeCS, useRecurrence);
      setPreview(p);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  // =========================
  // Render
  // =========================
  return (
    <div className="p-6 space-y-4">
      {/* ======= フィルターバー（monthly同等UI） ======= */}
      <div className="flex flex-wrap items-end gap-3">
        {/* 実施月 */}
        <div className="flex flex-col">
          <label className="text-sm text-muted-foreground">実施月</label>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => setSelectedMonth((m) => addMonths(m, -1))}>前月</Button>
            <div style={{ width: 160 }}>
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger><SelectValue placeholder="月を選択" /></SelectTrigger>
                <SelectContent>
                  {monthOptions.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="secondary" onClick={() => setSelectedMonth((m) => addMonths(m, +1))}>次月</Button>
          </div>
        </div>

        {/* 利用者 */}
        <div className="flex flex-col">
          <label className="text-sm text-muted-foreground">利用者</label>
          <div className="flex items-center gap-2">
            <Button variant="secondary" disabled={!csPrev} onClick={() => csPrev && setSelectedKaipokeCS(csPrev.kaipoke_cs_id)}>
              前へ（{csPrev?.name ?? "-"}）
            </Button>
            <div style={{ width: 260 }}>
              <Select value={selectedKaipokeCS} onValueChange={setSelectedKaipokeCS}>
                <SelectTrigger><SelectValue placeholder="利用者を選択" /></SelectTrigger>
                <SelectContent>
                  {kaipokeCs.map((cs) => (
                    <SelectItem key={cs.kaipoke_cs_id} value={cs.kaipoke_cs_id}>{cs.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="secondary" disabled={!csNext} onClick={() => csNext && setSelectedKaipokeCS(csNext.kaipoke_cs_id)}>
              次へ（{csNext?.name ?? "-"}）
            </Button>
          </div>
        </div>

        {/* 操作群 */}
        <div className="flex items-center gap-2 ml-auto">
          <Button variant="outline" onClick={() => selectedKaipokeCS && apiFetchTemplates(selectedKaipokeCS).then(setRows)} disabled={!selectedKaipokeCS || loading}>
            <RefreshCcw className="w-4 h-4 mr-2" /> 読み込み
          </Button>
          <Button variant="outline" onClick={addRow} disabled={!selectedKaipokeCS}>
            <Plus className="w-4 h-4 mr-2" /> 行を追加
          </Button>
          <Button variant="outline" onClick={removeSelected} disabled={rows.every((r) => !r._selected)}>
            <Trash2 className="w-4 h-4 mr-2" /> 選択削除
          </Button>
          <Button onClick={saveAll} disabled={!rows.length || saving || duplicate}>
            <Save className="w-4 h-4 mr-2" /> 保存
          </Button>
          <Button variant="secondary" onClick={doPreview} disabled={!selectedKaipokeCS || loading}>
            <Eye className="w-4 h-4 mr-2" /> 月展開プレビュー
          </Button>
        </div>
      </div>

      {/* ステータス */}
      <div className="flex flex-wrap items-center gap-2">
        <Pill label={"行数: " + rows.length} />
        <Pill label={"合計時間: " + (totalMinutes / 60).toFixed(1) + "h"} />
        {duplicate ? <Pill tone="warn" label="重複 (同曜日×開始時刻) あり" /> : null}
        {invalidCount > 0 ? <Pill tone="warn" label={"警告 " + invalidCount + "件"} /> : null}
        {useRecurrence ? <Pill tone="ok" label="隔週/第n週 有効" /> : <Pill tone="muted" label="隔週/第n週 無効" />}
        <button className="text-xs underline text-slate-600" onClick={() => setUseRecurrence((v) => !v)}>切り替え</button>
        {error ? <span className="text-xs text-red-600">エラー: {error}</span> : null}
      </div>

      {/* テンプレ編集テーブル（既存UI踏襲） */}
      <div className="grid grid-cols-1 gap-3">
        <div className="overflow-auto rounded-2xl border">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left text-xs font-semibold text-slate-500 px-2 py-2 border-b">選択</th>
                <th className="text-left text-xs font-semibold text-slate-500 px-2 py-2 border-b">曜日</th>
                <th className="text-left text-xs font-semibold text-slate-500 px-2 py-2 border-b">提供時間</th>
                <th className="text-left text-xs font-semibold text-slate-500 px-2 py-2 border-b">サービス</th>
                <th className="text-left text-xs font-semibold text-slate-500 px-2 py-2 border-b">人数/2人従事</th>
                <th className="text-left text-xs font-semibold text-slate-500 px-2 py-2 border-b">重訪移動</th>
                <th className="text-left text-xs font-semibold text-slate-500 px-2 py-2 border-b">担当(1/2/3)</th>
                <th className="text-left text-xs font-semibold text-slate-500 px-2 py-2 border-b">ロール(1/2/3)</th>
                <th className="text-left text-xs font-semibold text-slate-500 px-2 py-2 border-b">有効期間</th>
                <th className="text-left text-xs font-semibold text-slate-500 px-2 py-2 border-b">隔週/第n週</th>
                <th className="text-left text-xs font-semibold text-slate-500 px-2 py-2 border-b">Active</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const errs = validateRow(r);
                return (
                  <tr key={r._cid} className={errs.length ? "bg-amber-50" : ""}>
                    <td className="px-2 py-2 align-top border-b">
                      <input type="checkbox" checked={!!r._selected} onChange={(e) => updateRow(r._cid as string, { _selected: e.target.checked })} />
                    </td>
                    <td className="px-2 py-2 align-top border-b">
                      <select
                        value={r.weekday}
                        onChange={(e) => updateRow(r._cid as string, { weekday: Number(e.target.value) })}
                        className="border rounded-lg px-2 py-1"
                      >
                        {WEEKS_JP.map((w, i) => <option key={i} value={i}>{w}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-2 align-top border-b">
                      <div className="flex items-center gap-1">
                        <input type="time" value={r.start_time} onChange={(e) => updateRow(r._cid as string, { start_time: e.target.value })} className="border rounded-lg px-2 py-1" />
                        <span className="text-slate-400">〜</span>
                        <input type="time" value={r.end_time} onChange={(e) => updateRow(r._cid as string, { end_time: e.target.value })} className="border rounded-lg px-2 py-1" />
                      </div>
                    </td>
                    <td className="px-2 py-2 align-top border-b">
                      <input
                        value={r.service_code}
                        onChange={(e) => updateRow(r._cid as string, { service_code: e.target.value })}
                        placeholder="身体/重訪Ⅱ など"
                        className="border rounded-lg px-2 py-1 w-36"
                      />
                    </td>
                    <td className="px-2 py-2 align-top border-b">
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={1}
                          value={r.required_staff_count}
                          onChange={(e) => updateRow(r._cid as string, { required_staff_count: Number(e.target.value) })}
                          className="border rounded-lg px-2 py-1 w-16"
                        />
                        <label className="inline-flex items-center gap-1 text-xs">
                          <input
                            type="checkbox"
                            checked={r.two_person_work_flg}
                            onChange={(e) => updateRow(r._cid as string, { two_person_work_flg: e.target.checked })}
                          /> 2人従事
                        </label>
                      </div>
                    </td>
                    <td className="px-2 py-2 align-top border-b">
                      <input
                        value={r.judo_ido || ""}
                        onChange={(e) => updateRow(r._cid as string, { judo_ido: e.target.value || null })}
                        placeholder="例: 0015"
                        className="border rounded-lg px-2 py-1 w-20"
                      />
                    </td>
                    <td className="px-2 py-2 align-top border-b">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1">
                          <input
                            value={r.staff_01_user_id || ""}
                            onChange={(e) => updateRow(r._cid as string, { staff_01_user_id: e.target.value || null })}
                            placeholder="staff1"
                            className="border rounded-lg px-2 py-1 w-32"
                          />
                          <span className="text-xs text-slate-400">出動</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <input
                            value={r.staff_02_user_id || ""}
                            onChange={(e) => updateRow(r._cid as string, { staff_02_user_id: e.target.value || null })}
                            placeholder="staff2"
                            className="border rounded-lg px-2 py-1 w-32"
                          />
                          <label className="text-xs inline-flex items-center gap-1">
                            <input
                              type="checkbox"
                              checked={r.staff_02_attend_flg}
                              onChange={(e) => updateRow(r._cid as string, { staff_02_attend_flg: e.target.checked })}
                            /> 同行
                          </label>
                        </div>
                        <div className="flex items-center gap-1">
                          <input
                            value={r.staff_03_user_id || ""}
                            onChange={(e) => updateRow(r._cid as string, { staff_03_user_id: e.target.value || null })}
                            placeholder="staff3"
                            className="border rounded-lg px-2 py-1 w-32"
                          />
                          <label className="text-xs inline-flex items-center gap-1">
                            <input
                              type="checkbox"
                              checked={r.staff_03_attend_flg}
                              onChange={(e) => updateRow(r._cid as string, { staff_03_attend_flg: e.target.checked })}
                            /> 同行
                          </label>
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-2 align-top border-b">
                      <div className="flex flex-col gap-1">
                        <input
                          value={r.staff_01_role_code || ""}
                          onChange={(e) => updateRow(r._cid as string, { staff_01_role_code: e.target.value || null })}
                          placeholder="-999/01/02"
                          className="border rounded-lg px-2 py-1 w-24"
                        />
                        <input
                          value={r.staff_02_role_code || ""}
                          onChange={(e) => updateRow(r._cid as string, { staff_02_role_code: e.target.value || null })}
                          placeholder="-999/01/02"
                          className="border rounded-lg px-2 py-1 w-24"
                        />
                        <input
                          value={r.staff_03_role_code || ""}
                          onChange={(e) => updateRow(r._cid as string, { staff_03_role_code: e.target.value || null })}
                          placeholder="-999/01/02"
                          className="border rounded-lg px-2 py-1 w-24"
                        />
                      </div>
                    </td>
                    <td className="px-2 py-2 align-top border-b">
                      <div className="flex items-center gap-1">
                        <input
                          type="date"
                          value={r.effective_from || ""}
                          onChange={(e) => updateRow(r._cid as string, { effective_from: e.target.value || null })}
                          className="border rounded-lg px-2 py-1"
                        />
                        <span className="text-slate-400">〜</span>
                        <input
                          type="date"
                          value={r.effective_to || ""}
                          onChange={(e) => updateRow(r._cid as string, { effective_to: e.target.value || null })}
                          className="border rounded-lg px-2 py-1"
                        />
                      </div>
                    </td>
                    <td className="px-2 py-2 align-top border-b">
                      <div className="flex flex-col gap-1">
                        <label className="text-xs inline-flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={!!r.is_biweekly}
                            onChange={(e) => updateRow(r._cid as string, { is_biweekly: e.target.checked })}
                          /> 隔週
                        </label>
                        <input
                          value={(r.nth_weeks || []).join(",")}
                          onChange={(e) => {
                            const v = e.target.value
                              ? e.target.value.split(",").map((x) => Number(x.trim())).filter((n) => !!n)
                              : [];
                            updateRow(r._cid as string, { nth_weeks: v });
                          }}
                          placeholder="第n週(例: 1,3,5)"
                          className="border rounded-lg px-2 py-1 w-28"
                        />
                      </div>
                    </td>
                    <td className="px-2 py-2 align-top border-b">
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={r.active}
                          onChange={(e) => updateRow(r._cid as string, { active: e.target.checked })}
                        />
                        <span className="text-xs text-slate-600">{r.active ? "有効" : "無効"}</span>
                      </label>
                      {errs.length > 0 ? (
                        <div className="mt-1 text-[11px] text-amber-700 space-y-0.5">
                          {errs.slice(0, 3).map((m, i) => <div key={i}>• {m}</div>)}
                          {errs.length > 3 ? <div>…他{errs.length - 3}件</div> : null}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 ? (
                <tr>
                  <td className="text-center text-slate-400 py-8" colSpan={11}>
                    テンプレ行がありません。「読み込み」または「行を追加」をクリック
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {/* プレビュー（HTMLタグ混入対策：cleanTextで表示） */}
      {preview ? (
        <div className="rounded-2xl border overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 flex items-center justify-between">
            <div className="text-sm text-slate-700">{selectedMonth} の展開プレビュー（{selectedKaipokeCS || "全員"}）</div>
            <div className="text-xs text-slate-500">{useRecurrence ? "隔週/第n週: 有効" : "隔週/第n週: 無効"}</div>
          </div>
          <div className="max-h-[50vh] overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-white sticky top-0 shadow-sm">
                <tr>
                  <th className="text-left text-xs font-semibold text-slate-500 px-2 py-2 border-b">日付</th>
                  <th className="text-left text-xs font-semibold text-slate-500 px-2 py-2 border-b">曜日</th>
                  <th className="text-left text-xs font-semibold text-slate-500 px-2 py-2 border-b">提供時間</th>
                  <th className="text-left text-xs font-semibold text-slate-500 px-2 py-2 border-b">サービス</th>
                  <th className="text-left text-xs font-semibold text-slate-500 px-2 py-2 border-b">人数/2人従事</th>
                  <th className="text-left text-xs font-semibold text-slate-500 px-2 py-2 border-b">担当</th>
                  <th className="text-left text-xs font-semibold text-slate-500 px-2 py-2 border-b">衝突</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((p, i) => {
                  const d = new Date(p.shift_start_date + "T00:00:00");
                  const wd = isNaN(d.getTime()) ? "-" : WEEKS_JP[d.getDay()];
                  return (
                    <tr key={i} className="border-b">
                      <td className="px-2 py-2 align-top border-b">{p.shift_start_date}</td>
                      <td className="px-2 py-2 align-top border-b">{wd}</td>
                      <td className="px-2 py-2 align-top border-b">
                        {p.shift_start_time.substring(0, 5)}〜{p.shift_end_time.substring(0, 5)}
                      </td>
                      <td className="px-2 py-2 align-top border-b">{cleanText(p.service_code)}</td>
                      <td className="px-2 py-2 align-top border-b">
                        {p.required_staff_count}{p.two_person_work_flg ? " / 2人従事" : ""}
                      </td>
                      <td className="px-2 py-2 align-top border-b text-xs text-slate-600">
                        {cleanText(p.staff_01_user_id || "-")}
                        {p.staff_02_user_id ? " / " + cleanText(p.staff_02_user_id) + (p.staff_02_attend_flg ? "(同)" : "") : ""}
                        {p.staff_03_user_id ? " / " + cleanText(p.staff_03_user_id) + (p.staff_03_attend_flg ? "(同)" : "") : ""}
                      </td>
                      <td className="px-2 py-2 align-top border-b">
                        {p.has_conflict ? <Pill tone="warn" label="重なり有" /> : <Pill tone="ok" label="OK" />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
