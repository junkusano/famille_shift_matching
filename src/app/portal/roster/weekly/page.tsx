// /portal/roster/weekly/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Save, Eye, ChevronLeft, ChevronRight } from "lucide-react";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRouter, useSearchParams } from "next/navigation";


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
  active: boolean;
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
  has_conflict: boolean;
};

// 展開ポリシーを3パターンに
export type DeployPolicy =
  | 'skip_conflict'
  | 'overwrite_only'
  | 'delete_month_insert';

type KaipokeCs = {
  id: string;
  kaipoke_cs_id: string;
  name: string;
  end_at: string | null;
};

// ③ 項目名修正：user_entry_united_view_single のカラム名
type StaffUserEntry = {
  user_id: string;
  last_name_kanji: string | null;
  first_name_kanji: string | null;
};

type StaffOption = { value: string; label: string }; // user_id と name を格納
type ServiceCodeOption = { value: string; label: string }; // service_code と service_code を格納

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
// ... (validateRow, hasDuplicate は変更なし)
function validateRow(r: TemplateRow): string[] {
  const errs: string[] = [];
  const re = /^\d{2}:\d{2}$/;
  if (!re.test(r.start_time)) errs.push("開始時刻の形式が不正です");
  if (!re.test(r.end_time)) errs.push("終了時刻の形式が不正です");

  const st = r.start_time;
  const et = r.end_time;
  if (re.test(st) && re.test(et) && et <= st) {
    errs.push("終了時刻は開始より後である必要があります");
  }

  if (r.weekday < 0 || r.weekday > 6) errs.push("曜日が不正です");
  if (!r.service_code) errs.push("サービス内容（service_code）を選択してください"); // 修正
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
// ... (summarizeHTTP, safeErr は変更なし)
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
    return `HTTP ${res.status} ${res.statusText}`;
  }
}
const safeErr = (s: string | null) => (s ? stripTags(decodeEntities(s)).slice(0, 300) : null);


// =========================
// API wrappers
// =========================
// ... (apiFetchTemplates, apiBulkUpsert, apiBulkDelete, apiPreviewMonth は変更なし)

async function apiFetchTemplates(cs: string): Promise<TemplateRow[]> {
  const usp = new URLSearchParams({ kaipoke_cs_id: cs, cs });
  const url = "/api/roster/weekly/templates?" + usp.toString();
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(await summarizeHTTP(res));
  const data = (await res.json()) as TemplateRow[];

  const toHHMM = (t?: string | null) =>
    (t && t.length >= 5) ? t.slice(0, 5) : (t ?? "");

  return data.map((r) => ({
    ...r,
    start_time: toHHMM(r.start_time),
    end_time: toHHMM(r.end_time),
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

// ① サービスコードマスタ取得API
async function apiFetchServiceCodes(): Promise<ServiceCodeOption[]> {
  // /api/shift_service_codes は存在すると仮定
  const res = await fetch("/api/shift_service_codes", { cache: "no-store" });
  if (!res.ok) throw new Error(await summarizeHTTP(res));
  const data = await res.json();
  // shift_service_code テーブルから service_code を取得し、値とラベルに設定
  return Array.isArray(data) ?
    data.map((d) => ({ value: d.service_code, label: d.service_code }))
    : [];
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
  const router = useRouter();
  // 1. useSearchParams の取得
  const searchParams = useSearchParams();

  // 2. URLからcsIDを直接取得
  const currentCsId = searchParams.get("cs") || "";



  // 3. 既存の useEffect の依存配列はそのまま (currentCsId に依存しているはず)
  // ERROR: fetchTemplateList, setTemplates のため、このブロックを削除します
  /*
  useEffect(() => {
    // ...
    fetchTemplateList(currentCsId)
      .then(setTemplates)
      // ...
  }, [currentCsId]);
  */

  // 2. 状態の管理: selectedKaipokeCsId を URLの値で初期化
  // FIX: urlCsId -> currentCsId
  const [selectedKaipokeCsId, setSelectedKaipokeCsId] = useState<string>(currentCsId);

  // ==== Masters for filters ====
  const [kaipokeCs, setKaipokeCs] = useState<KaipokeCs[]>([]);
  // NOTE: selectedKaipokeCS は NavボタンやFetchingで使われるため残す
  const [selectedKaipokeCS, setSelectedKaipokeCS] = useState<string>("");
  const [selectedMonth, setSelectedMonth] = useState<string>(nowYYYYMM());
  const [deployPolicy, setDeployPolicy] = useState<DeployPolicy>('skip_conflict'); // ③ 新規追加
  const [deploying, setDeploying] = useState(false); // ④ 新規追加 (展開中ステート)
  const [clientSearchKeyword, setClientSearchKeyword] = useState<string>("");

  // ③ スタッフマスタ
  const [staffOpts, setStaffOpts] = useState<StaffOption[]>([]);
  // const [staffMap] = useState<Record<string, string>>({}); // 削除

  // ① サービスコードマスタ
  const [serviceCodeOpts, setServiceCodeOpts] = useState<ServiceCodeOption[]>([]);
  // サービスコードのオプションを保持するステートを定義

  // id -> 名前 の高速参照
  const staffNameById = useMemo<Record<string, string>>(
    () => Object.fromEntries(staffOpts.map(o => [o.value, o.label])),
    [staffOpts]
  );

  // nameOf は未使用のため削除
  // const nameOf = (id: string | null | undefined): string => {
  //   if (!id) return "-";
  //   return staffNameById[id] ?? id; 
  // };

  // ⑥ 新しいヘルパー (IDと姓名をスペース区切りで返す)
  const idAndNameOf = (id: string | null | undefined): string => {
    if (!id) return "-";
    const name = staffNameById[id];
    if (!name || name === id) return id;
    return `${id} ${name}`;
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
        cs.kaipoke_cs_id.toLowerCase().includes(keyword)
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
      >
        <SelectTrigger>
          <SelectValue placeholder="スタッフを選択" />
        </SelectTrigger>
        <SelectContent>
          {staffOpts.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
          {/* 未定/未割当オプションを追加 */}
          <SelectItem value="">未定</SelectItem>
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

  // 3. URLの変更を監視し、状態を同期させる (ブラウザ操作に対応)
  useEffect(() => {
    // FIX: urlCsId -> currentCsId
    if (selectedKaipokeCsId !== currentCsId) {
      // URLの値が変更されたら、内部状態も更新
      // FIX: urlCsId -> currentCsId
      setSelectedKaipokeCsId(currentCsId);
      // selectedKaipokeCS も URLの値に合わせ、Fetchingがトリガーされるようにします
      setSelectedKaipokeCS(currentCsId);
    }
    // FIX: urlCsId -> currentCsId
  }, [currentCsId, selectedKaipokeCsId]);

  // 4. kaipoke_cs_id 変更ハンドラ: 状態とURLを更新
  // Select コンポーネントの onChange/onValueChange に渡す
  const handleCsIdChange = (newCsId: string) => {
    // 状態を即時更新
    setSelectedKaipokeCsId(newCsId);
    // FIX: selectedKaipokeCS も更新し、テンプレート/プレビューの自動再取得をトリガー
    setSelectedKaipokeCS(newCsId);

    // URLSearchParams を更新
    const newParams = new URLSearchParams(searchParams.toString());
    if (newCsId) {
      newParams.set('cs', newCsId);
    } else {
      newParams.delete('cs'); // 全選択などの場合はパラメータを削除
    }
    // router.replace() で履歴を残さずURLを更新
    router.replace(`/portal/roster/weekly?${newParams.toString()}`, { scroll: false });
  };

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
        // user_entry_united_view_single のカラム名を使用
        const arr: StaffUserEntry[] = Array.isArray(js) ? js : [];
        setStaffOpts(arr.map(u => ({
          value: u.user_id,
          // 姓名をスペース区切りで結合
          label: `${u.last_name_kanji ?? ''} ${u.first_name_kanji ?? ''}`.trim()
        })).filter(o => o.label)); // 姓名が空の場合は除外
      } catch (e) {
        console.error("スタッフマスタ取得エラー", e);
      }
    };
    void loadStaffs();

    // ① サービスコードマスタのロード
    const loadServiceCodes = async () => {
      try {
        const data = await apiFetchServiceCodes();
        setServiceCodeOpts(data);
      } catch (e) {
        console.error("サービスコードマスタ取得エラー", e);
      }
    };
    void loadServiceCodes();

  }, []);

  async function apiDeployMonth(month: string, cs: string, policy: DeployPolicy) {
    const res = await fetch("/api/roster/weekly/deploy", { // 新規APIエンドポイント
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month, kaipoke_cs_id: cs, policy }),
    });
    if (!res.ok) throw new Error(await summarizeHTTP(res));
    return res.json();
  }

  async function deployShift() {
    if (!selectedKaipokeCS) {
      alert("利用者を選択してください。");
      return;
    }
    if (!confirm(`【${selectedMonth}】の週間シフト展開を実行します。\nポリシー: ${deployPolicy} で実行。よろしいですか？`)) return;

    setDeploying(true);
    setError(null);
    setPreview(null); // 展開後はプレビューをリフレッシュ（自動で再生成される想定）

    try {
      const result = await apiDeployMonth(selectedMonth, selectedKaipokeCS, deployPolicy);
      alert(`シフト展開が完了しました。\n挿入: ${result.inserted_count || 0}件, 更新: ${result.updated_count || 0}件, 削除: ${result.deleted_count || 0}件`);
      // 展開後、プレビューを強制更新
      apiPreviewMonth(selectedMonth, selectedKaipokeCS, useRecurrence).then(setPreview).catch(setError);
    } catch (s) {
      setError(s instanceof Error ? s.message : String(s));
      alert("シフト展開中にエラーが発生しました: " + safeErr(s)); // safeErrの引数を e に修正
    } finally {
      setDeploying(false); // ★ 利用する (Warning 6133 解消)
    }
  }

  // templates：利用者が変われば自動再取得
  useEffect(() => {
    if (!selectedKaipokeCS) return;

    setLoading(true);
    setError(null);
    setPreview(null);

    if (selectedKaipokeCsId) {
      apiFetchTemplates(selectedKaipokeCsId);
    }

    apiFetchTemplates(selectedKaipokeCS)
      .then((data) => {
        setRows(data);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : String(e));
        setRows([]);
      })
      .finally(() => setLoading(false));
  }, [selectedKaipokeCsId]);

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
  }, [selectedMonth, selectedKaipokeCS, useRecurrence]);

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
      type ServerRow = Omit<TemplateRow, "_cid" | "_selected">;
      const toHHMMSS = (t: string) => t.length === 5 ? `${t}:00` : t;
      const payload: ServerRow[] = rows.map((r) => {
        const obj: Record<string, unknown> = { ...r };
        delete (obj as { _cid?: string })._cid;
        delete (obj as { _selected?: boolean })._selected;
        (obj).start_time = toHHMMSS(r.start_time);
        (obj).end_time = toHHMMSS(r.end_time);
        return obj as ServerRow;
      });
      await apiBulkUpsert(payload);

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
              // FIX: setSelectedKaipokeCS から handleCsIdChange へ変更
              onClick={() => csPrev && handleCsIdChange(csPrev.kaipoke_cs_id)}
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
              <Select
                // 1. ステート変数を合わせます
                value={selectedKaipokeCsId}

                // 2. 【✅ 警告解消のための修正箇所】onValueChange に handleCsIdChange を渡します
                onValueChange={handleCsIdChange}
              >
                <SelectTrigger>
                  {/* 利用者を選択 (カイポケID) */}
                  <SelectValue placeholder="利用者を選択" />
                </SelectTrigger>
                <SelectContent>
                  {/* 3. （全選択）オプションを追加（handleCsIdChange が "" で URLパラメータを削除） */}
                  <SelectItem value="">利用者を選択（すべて）</SelectItem>

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
                <th className="text-left text-xs font-semibold text-slate-500 px-2 py-2 border-b">隔週（不定期実施）</th>
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
                      {/* サービスコード Select (Line 603: Error 2322 の解消) */}
                      <Select
                        value={r.service_code || ""} // null/undefined 対策
                        onValueChange={(v) => updateRow(r._cid as string, { service_code: v || "" })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="サービスを選択" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">-</SelectItem> {/* 未選択オプション */}
                          {/* serviceCodeOpts はクロージャ（スコープ）を通じて参照される */}
                          {serviceCodeOpts.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-2 py-2 align-top border-b">
                      <div className="flex items-center gap-2">
                        {/* 人数 Select (Line 618: Error 2322 の解消) */}
                        <Select
                          value={String(r.required_staff_count)}
                          onValueChange={(v) => updateRow(r._cid as string, { required_staff_count: Number(v) })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="人数" />
                          </SelectTrigger>
                          <SelectContent>
                            {[1, 2, 3].map((count) => (
                              <SelectItem key={count} value={String(count)}>
                                {count}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {/* ... 2人従事チェックボックスなど ... */}
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

                    {/* ③ 担当者 Selectbox は前回修正済み（StaffSelectを使用） */}
                    <td className="px-2 py-2 align-top border-b">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1">
                          <StaffSelect
                            userId={r.staff_01_user_id}
                            staffOpts={staffOpts}
                            onChange={(v) => updateRow(r._cid as string, { staff_01_user_id: v })}
                          />
                          <span className="text-xs text-slate-400">出動</span>
                        </div>
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
                              disabled={!r.staff_02_user_id}
                            /> 同行
                          </label>
                        </div>
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
                              disabled={!r.staff_03_user_id}
                            /> 同行
                          </label>
                        </div>
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
                            updateRow(r._cid as string, { nth_weeks: v.length ? v : null });
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

      {/* ④ 操作群の配置変更 */}
      <div className="flex flex-col gap-2">
        {/* 行操作ボタン */}
        <div className="flex items-center gap-2 justify-end">
          <Button variant="outline" onClick={addRow} disabled={!selectedKaipokeCS}>
            <Plus className="w-4 h-4 mr-2" /> 行を追加
          </Button>
          <Button variant="outline" onClick={removeSelected} disabled={rows.every((r) => !r._selected)}>
            <Trash2 className="w-4 h-4 mr-2" /> 選択削除
          </Button>
          <Button onClick={saveAll} disabled={!rows.length || saving || duplicate}>
            <Save className="w-4 h-4 mr-2" /> テンプレート保存
          </Button>
        </div>

        {/* 反映月とプレビューボタン */}
        <div className="flex items-center gap-2 justify-end pt-2 border-t">
          <label className="text-sm text-muted-foreground">反映月</label>
          {/* 前月ボタン */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSelectedMonth(addMonths(selectedMonth, -1))}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
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
          {/* 次月ボタン */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSelectedMonth(addMonths(selectedMonth, 1))}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>

          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground">重なり時の処理/月間削除</label>
            <Select
              value={deployPolicy}
              onValueChange={(v) => setDeployPolicy(v as DeployPolicy)}
            // disabled={deploying} を削除 (Error 2322 対応)
            >
              <SelectTrigger >
                <SelectValue placeholder="展開ポリシーを選択" /> {/* placeholder を追加 (Error 2741 対応) */}
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="skip_conflict">既存と重なるときは展開スキップ (既存維持)</SelectItem>
                <SelectItem value="overwrite_only">既存と重なるときは週間シフトで上書き (既存維持)</SelectItem>
                <SelectItem value="delete_month_insert">月全体を削除し、全て新規挿入</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={deployShift}
            disabled={!selectedKaipokeCS || !selectedMonth || deploying}
            className="bg-red-600 hover:bg-red-700"
          >
            {deploying ? '展開中...' : '月間シフト展開を実行'}
          </Button>
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

                  // ⑤ プレビュー背景色ロジック修正
                  const rowClass = p.has_conflict
                    ? "bg-red-50 hover:bg-red-100 border-b"
                    : "bg-blue-50 hover:bg-blue-100 border-b";

                  return (
                    <tr key={i} className={rowClass}>
                      <td className="px-2 py-2 align-top border-b">{dateStr || "-"}</td>
                      <td className="px-2 py-2 align-top border-b">{wd}</td>
                      <td className="px-2 py-2 align-top border-b">
                        {sst}〜{set}
                      </td>
                      <td className="px-2 py-2 align-top border-b">{cleanText(p.service_code)}</td>
                      <td className="px-2 py-2 align-top border-b">
                        {p.required_staff_count}{p.two_person_work_flg ? " / 2人従事" : ""}
                      </td>
                      {/* ⑥ 担当者表示を ID 姓名 に変更 */}
                      <td className="px-2 py-2 align-top border-b text-xs text-slate-600">
                        {idAndNameOf(p.staff_01_user_id)}
                        {p.staff_02_user_id ? " / " + idAndNameOf(p.staff_02_user_id) + (p.staff_02_attend_flg ? "(同)" : "") : ""}
                        {p.staff_03_user_id ? " / " + idAndNameOf(p.staff_03_user_id) + (p.staff_03_attend_flg ? "(同)" : "") : ""}
                      </td>
                      {/* ⑤ 衝突表示の文言変更と色分け */}
                      <td className="px-2 py-2 align-top border-b">
                        {p.has_conflict
                          ? <span className="text-red-700 text-xs font-semibold">既存シフトと重なり</span>
                          : <span className="text-blue-700 text-xs font-semibold">テンプレート展開</span>
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