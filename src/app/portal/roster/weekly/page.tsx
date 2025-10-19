// /portal/roster/weekly/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Save, Eye } from "lucide-react";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
  // ⑤ 役割コードは削除
  active: boolean;
  // ⑥ 有効期間は削除
  is_biweekly?: boolean | null;
  nth_weeks?: number[] | null; // [1..5]
  _cid?: string;
  _selected?: boolean;
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
  // PreviewRow の role_code も表示しない
  has_conflict: boolean;
};

type KaipokeCs = {
  id: string;
  kaipoke_cs_id: string;
  name: string;
  end_at: string | null;
};

type StaffOption = { value: string; label: string }; // user_id と name を格納

// =========================
// Helpers（monthlyのフィルター仕様を踏襲）
// =========================
const WEEKS_JP = ["日", "月", "火", "水", "木", "金", "土"];
const yyyymm = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const addMonths = (month: string, diff: number) => {
  const [y, m] = month.split("-").map(Number);
  const dt = new Date(y, (m - 1) + diff, 1);
  return yyyymm(dt);
};
const nowYYYYMM = () => yyyymm(new Date());

// --- HTML混入対策: プレビュー/エラー用 ---
const decodeEntities = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const stripTags = (s: string) => s.replace(/<[^>]*>/g, "");
const cleanText = (v: string | null) => (v ? stripTags(decodeEntities(v)) : "");

// =========================
// Validation
// =========================
function validateRow(r: TemplateRow): string[] {
  const errs: string[] = [];
  // ① 修正: HH:MM 形式を厳密にチェック (DBからはHH:MM:SSが来るが、フロントでHH:MMに変換しているため)
  const re = /^\d{2}:\d{2}$/;
  if (!re.test(r.start_time)) errs.push("開始時刻の形式が不正です");
  if (!re.test(r.end_time)) errs.push("終了時刻の形式が不正です");

  // HH:MM形式に統一して時刻比較を行う（HH:MM:SSで比較する場合は:00を補完する必要があるが、HH:MMで十分）
  const st = r.start_time;
  const et = r.end_time;
  if (re.test(st) && re.test(et) && et <= st) {
    errs.push("終了時刻は開始より後である必要があります");
  }

  if (r.weekday < 0 || r.weekday > 6) errs.push("曜日が不正です");
  if (!r.service_code) errs.push("サービス内容（service_code）を入力してください");
  if (r.required_staff_count < 1) errs.push("派遣人数は1以上にしてください");
  if (r.nth_weeks && r.nth_weeks.some((n) => n < 1 || n > 5)) errs.push("第n週は1〜5で指定してください");
  if (r.judo_ido && !/^([0-2][0-9][0-5][0-9])$/.test(r.judo_ido)) errs.push("重訪移動（judo_ido）はHHMM形式");
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
// エラー整形（HTMLを出さずHTTP要約を返す）
// =========================
async function summarizeHTTP(res: Response): Promise<string> {
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    try {
      const j = await res.json();
      const msg = (j && (j.message || j.error)) ? ` - ${(j.message || j.error)}` : "";
      return `HTTP ${res.status} ${res.statusText}${msg}`;
    } catch {
      return `HTTP ${res.status} ${res.statusText}`;
    }
  } else {
    // HTMLやテキストは読んでも捨てて要約だけ表示
    return `HTTP ${res.status} ${res.statusText}`;
  }
}
const safeErr = (s: string | null) => (s ? stripTags(decodeEntities(s)).slice(0, 300) : null);

// =========================
// API wrappers
// =========================
async function apiFetchTemplates(cs: string): Promise<TemplateRow[]> {
  const usp = new URLSearchParams({ kaipoke_cs_id: cs, cs });
  const url = "/api/roster/weekly/templates?" + usp.toString();
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(await summarizeHTTP(res));
  const data = (await res.json()) as TemplateRow[];

  // 取得したHH:MM:SS形式をHH:MMに変換
  const toHHMM = (t?: string | null) =>
    (t && t.length >= 5) ? t.slice(0, 5) : (t ?? "");

  return data.map((r) => ({
    ...r,
    start_time: toHHMM(r.start_time),
    end_time: toHHMM(r.end_time),
    // ⑤ ⑥ 不要なフィールドは省略 (DBから返ってくる場合は含めてもOKだが、ここでは型を合わせるために省略)
    // r.staff_01_role_code, r.effective_from などは TemplateRow の定義から除外された
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
  if (!res.ok) throw new Error(await summarizeHTTP(res));
  return res.json();
}
async function apiBulkDelete(templateIds: number[]) {
  const res = await fetch("/api/roster/weekly/templates/bulk_delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ template_ids: templateIds }),
  });
  if (!res.ok) throw new Error(await summarizeHTTP(res));
  return res.json();
}
async function apiPreviewMonth(month: string, cs: string, useRecurrence: boolean) {
  const q = new URLSearchParams({ month, cs, recurrence: String(useRecurrence) });
  const res = await fetch(`/api/roster/weekly/preview?${q}`, { cache: "no-store" });
  if (!res.ok) throw new Error(await summarizeHTTP(res));
  const data = await res.json();
  const rows = (data && data.rows) ? data.rows : [];
  return Array.isArray(rows) ? (rows as PreviewRow[]) : [];
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
  const [clientSearchKeyword, setClientSearchKeyword] = useState<string>("");

  // ③ スタッフマスタ
  const [staffOpts, setStaffOpts] = useState<StaffOption[]>([]);
  
  // id -> 名前 の高速参照
  const staffNameById = useMemo<Record<string, string>>(
    () => Object.fromEntries(staffOpts.map(o => [o.value, o.label])),
    [staffOpts]
  );
  // 名前取得ヘルパー
  const nameOf = (id: string | null | undefined): string => {
    if (!id) return "-";
    // ユーザーIDが見つからない場合はIDをそのまま表示
    return staffNameById[id] ?? id;
  };

  // ==== Page states ====
  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(false);
  void loading
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
    // 時刻形式が不正な場合は 0 にする
    const validRows = rows.filter(r => validateRow(r).length === 0);
    return validRows.reduce((acc, r) => acc + Math.max(0, toMin(r.end_time) - toMin(r.start_time)), 0);
  }, [rows]);

  // 利用者フィルタリング
  const filteredKaipokeCs = useMemo(() => {
    if (!clientSearchKeyword) return kaipokeCs;
    const keyword = clientSearchKeyword.toLowerCase();
    return kaipokeCs.filter(
      (cs) =>
        cs.name.toLowerCase().includes(keyword) ||
        cs.kaipoke_cs_id.toLowerCase().includes(keyword) // IDでも検索可能に
    );
  }, [kaipokeCs, clientSearchKeyword]);

  // スタッフ選択コンポーネント (SelectBox)
  const StaffSelect: React.FC<{
    userId: string | null | undefined;
    staffOpts: StaffOption[];
    onChange: (value: string | null) => void;
  }> = ({ userId, staffOpts, onChange }) => {
    return (
      <Select
        value={userId || ""}
        onValueChange={(v) => onChange(v || null)}
        // Selectコンポーネント自体に幅とフォントサイズを付与
      >
        <SelectTrigger>
          {/* SelectTrigger から className="w-40 h-8 text-xs" を削除し、h-8のみ残す */}
          <SelectValue placeholder="スタッフを選択" />
        </SelectTrigger>
        <SelectContent>
          {/* SelectItem から className は削除済み */}
          <SelectItem value={""}>
            - 担当なし -
          </SelectItem>
          {staffOpts.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  };

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
  // masters, staffs のロード
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
        console.error("利用者マスタ取得エラー", e);
      }
    };
    void loadMasters();

    // ③ スタッフマスタのロード
    const loadStaffs = async () => {
      try {
        const res = await fetch("/api/users", { cache: "no-store" });
        const js = await res.json();
        // user_entry_united_view_single のカラム名が user_id と name であると仮定
        const arr: { user_id: string; name: string }[] = Array.isArray(js) ? js : [];
        setStaffOpts(arr.map(u => ({ value: u.user_id, label: u.name })));
      } catch (e) {
        console.error("スタッフマスタ取得エラー", e);
      }
    };
    void loadStaffs();

  }, []);

  // templates：利用者が変われば自動再取得
  useEffect(() => {
    if (!selectedKaipokeCS) return;

    setLoading(true);
    setError(null);
    setPreview(null); // 利用者が変わったらプレビューをリセット

    apiFetchTemplates(selectedKaipokeCS) // テンプレートを取得
      .then((data) => {
        setRows(data);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : String(e));
        setRows([]); // エラー時は空に
      })
      .finally(() => setLoading(false));
  }, [selectedKaipokeCS]); // 依存配列に selectedKaipokeCS のみ

  // preview：月/利用者/隔週フラグの変更時に自動再生成
  useEffect(() => {
    if (!selectedKaipokeCS || !selectedMonth) return;

    setLoading(true);
    setError(null);

    apiPreviewMonth(selectedMonth, selectedKaipokeCS, useRecurrence)
      .then((v) => {
        setPreview(Array.isArray(v) ? v : []);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => setLoading(false));
  }, [selectedMonth, selectedKaipokeCS, useRecurrence]); // 依存配列に selectedMonth, selectedKaipokeCS, useRecurrence

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
      active: true,
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
      // ⑤ ⑥ role code, effective_from/to は型から削除しているため、ここでは除外処理を省略
      type ServerRow = Omit<TemplateRow, "_cid" | "_selected">;
      // DB保存時に HH:MM:SS に補完
      const toHHMMSS = (t: string) => t.length === 5 ? `${t}:00` : t;
      const payload: ServerRow[] = rows.map((r) => {
        const obj: Record<string, unknown> = { ...r };
        delete (obj as { _cid?: string })._cid;
        delete (obj as { _selected?: boolean })._selected;
        // 時刻を HH:MM:SS へ
        (obj).start_time = toHHMMSS(r.start_time);
        (obj).end_time = toHHMMSS(r.end_time);
        return obj as ServerRow;
      });
      await apiBulkUpsert(payload);

      // 保存後に最新再取得
      const data = await apiFetchTemplates(selectedKaipokeCS);
      setRows(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  // =========================
  // Render
  // =========================
  return (
    <div className="p-6 space-y-4">
      {/* ======= フィルターバー（monthly同等UI） ======= */}
      <div className="flex flex-wrap items-end gap-3">
        {/* 利用者 */}
        <div className="flex flex-col">
          <label className="text-sm text-muted-foreground">利用者</label>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              disabled={!csPrev}
              onClick={() => csPrev && setSelectedKaipokeCS(csPrev.kaipoke_cs_id)}
            >
              前へ（{csPrev?.name ?? "-"}）
            </Button>

            {/* 検索ボックス（先頭一致/部分一致） */}
            <div style={{ width: 100 }}>
              <Input
                type="text"
                placeholder="利用者名検索"
                value={clientSearchKeyword}
                onChange={(e) => setClientSearchKeyword(e.target.value)}
              />
            </div>

            <div style={{ width: 100 }}>
              <Select value={selectedKaipokeCS} onValueChange={setSelectedKaipokeCS}>
                <SelectTrigger><SelectValue placeholder="利用者を選択" /></SelectTrigger>
                <SelectContent>
                  {filteredKaipokeCs.map((cs) => (
                    <SelectItem key={cs.kaipoke_cs_id} value={cs.kaipoke_cs_id}>
                      {cs.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              variant="secondary"
              disabled={!csNext}
              onClick={() => csNext && setSelectedKaipokeCS(csNext.kaipoke_cs_id)}
            >
              次へ（{csNext?.name ?? "-"}）
            </Button>
          </div>
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
        {error ? <span className="text-xs text-red-600">エラー: {safeErr(error)}</span> : null}
      </div>

      {/* テンプレ編集テーブル */}
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
                {/* ⑦ ラベル変更 */}
                <th className="text-left text-xs font-semibold text-slate-500 px-2 py-2 border-b">隔週（不定期実施）</th>
                {/* ⑧ ラベル変更 */}
                <th className="text-left text-xs font-semibold text-slate-500 px-2 py-2 border-b">適用 ✅</th>
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
                        {/* 担当スタッフ1 (SelectBox + 名前表示) */}
                        <div className="flex items-center gap-1">
                          <StaffSelect
                            userId={r.staff_01_user_id}
                            staffOpts={staffOpts}
                            onChange={(v) => updateRow(r._cid as string, { staff_01_user_id: v })}
                          />
                          <span className="text-xs text-slate-400">出動</span>
                        </div>
                        {/* 担当スタッフ2 (SelectBox + 同行フラグ) */}
                        <div className="flex items-center gap-1">
                          <StaffSelect
                            userId={r.staff_02_user_id}
                            staffOpts={staffOpts}
                            onChange={(v) => updateRow(r._cid as string, { staff_02_user_id: v })}
                          />
                          <label className="text-xs inline-flex items-center gap-1">
                            <input
                              type="checkbox"
                              checked={r.staff_02_attend_flg}
                              onChange={(e) => updateRow(r._cid as string, { staff_02_attend_flg: e.target.checked })}
                              disabled={!r.staff_02_user_id} /* IDがない場合はチェック不可 */
                            /> 同行
                          </label>
                        </div>
                        {/* 担当スタッフ3 (SelectBox + 同行フラグ) */}
                        <div className="flex items-center gap-1">
                          <StaffSelect
                            userId={r.staff_03_user_id}
                            staffOpts={staffOpts}
                            onChange={(v) => updateRow(r._cid as string, { staff_03_user_id: v })}
                          />
                          <label className="text-xs inline-flex items-center gap-1">
                            <input
                              type="checkbox"
                              checked={r.staff_03_attend_flg}
                              onChange={(e) => updateRow(r._cid as string, { staff_03_attend_flg: e.target.checked })}
                              disabled={!r.staff_03_user_id} /* IDがない場合はチェック不可 */
                            /> 同行
                          </label>
                        </div>
                      </div>
                    </td>

                    {/* ⑤ role code と ⑥ 有効期間の列を削除 */}

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
                            updateRow(r._cid as string, { nth_weeks: v.length ? v : null });
                          }}
                          placeholder="第n週(例: 1,3,5)"
                          className="border rounded-lg px-2 py-1 w-28"
                        />
                      </div>
                    </td>
                    <td className="px-2 py-2 align-top border-b">
                      {/* ⑧ 適用フラグ */}
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={r.active}
                          onChange={(e) => updateRow(r._cid as string, { active: e.target.checked })}
                        />
                        <span className="text-xs text-slate-600">{r.active ? "適用" : "未適用"}</span>
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
                  <td className="text-center text-slate-400 py-8" colSpan={9}>
                    テンプレ行がありません。利用者を変更するか、行を追加してください。
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {/* ===== ② 操作群（テンプレ表の下に移動） ===== */}
      <div className="flex items-end gap-2 justify-end">
        <Button variant="outline" onClick={addRow} disabled={!selectedKaipokeCS}>
          <Plus className="w-4 h-4 mr-2" /> 行を追加
        </Button>
        <Button variant="outline" onClick={removeSelected} disabled={rows.every((r) => !r._selected)}>
          <Trash2 className="w-4 h-4 mr-2" /> 選択削除
        </Button>
        <Button onClick={saveAll} disabled={!rows.length || saving || duplicate}>
          <Save className="w-4 h-4 mr-2" /> 保存
        </Button>

        <div className="flex items-end gap-2 ml-4">
          <label className="text-sm text-muted-foreground">反映月</label>
          <div style={{ width: 120 }}>
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger><SelectValue placeholder="月を選択" /></SelectTrigger>
              <SelectContent>
                {monthOptions.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button
          variant="secondary"
          disabled={!selectedKaipokeCS || !selectedMonth}
          onClick={() => {
            setPreview(null);
            setLoading(true);
            setError(null);
            apiPreviewMonth(selectedMonth, selectedKaipokeCS, useRecurrence)
              .then((v) => setPreview(Array.isArray(v) ? v : []))
              .catch((e) => setError(e instanceof Error ? e.message : String(e)))
              .finally(() => setLoading(false));
          }}
        >
          <Eye className="w-4 h-4 mr-2" /> 月展開プレビュー
        </Button>
      </div>

      {/* プレビュー（HTMLタグ混入対策：cleanTextで表示） */}
      {Array.isArray(preview) ? (
        <div className="rounded-2xl border overflow-hidden mt-6">
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
                  <th className="text-left text-xs font-semibold text-slate-500 px-2 py-2 border-b">既存シフトと重なり</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((p, i) => {
                  const dateStr = typeof p.shift_start_date === "string" ? p.shift_start_date : "";
                  const d = dateStr ? new Date(dateStr + "T00:00:00") : null;
                  const wd = d && !isNaN(d.getTime()) ? WEEKS_JP[d.getDay()] : "-";
                  const sst = typeof p.shift_start_time === "string" ? p.shift_start_time.slice(0, 5) : "--:--";
                  const set = typeof p.shift_end_time === "string" ? p.shift_end_time.slice(0, 5) : "--:--";
                  // ④ 競合行の背景色を設定: 既存シフトと重なっている場合は警告色 (赤系)
                  const rowClass = p.has_conflict ? "bg-red-50" : "hover:bg-slate-50";

                  return (
                    <tr key={i} className={`border-b ${rowClass}`}>
                      <td className="px-2 py-2 align-top border-b">{dateStr || "-"}</td>
                      <td className="px-2 py-2 align-top border-b">{wd}</td>
                      <td className="px-2 py-2 align-top border-b">
                        {sst}〜{set}
                      </td>
                      <td className="px-2 py-2 align-top border-b">{cleanText(p.service_code)}</td>
                      <td className="px-2 py-2 align-top border-b">
                        {p.required_staff_count}{p.two_person_work_flg ? " / 2人従事" : ""}
                      </td>
                      {/* ③ 名前表示と連記 */}
                      <td className="px-2 py-2 align-top border-b text-xs text-slate-600">
                        {nameOf(p.staff_01_user_id)}
                        {p.staff_02_user_id ? " / " + nameOf(p.staff_02_user_id) + (p.staff_02_attend_flg ? "(同)" : "") : ""}
                        {p.staff_03_user_id ? " / " + nameOf(p.staff_03_user_id) + (p.staff_03_attend_flg ? "(同)" : "") : ""}
                      </td>
                      {/* ④ 衝突表示の文言変更と色分け */}
                      <td className="px-2 py-2 align-top border-b">
                        {p.has_conflict
                          ? <span className="text-red-700 text-xs font-semibold">既存シフトと重なり</span>
                          : <span className="text-green-700 text-xs">空き枠</span>
                        }
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