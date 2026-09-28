"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"] as const;
const VIEW_START = 6 * 60;
const VIEW_END = 24 * 60;
const PX_PER_MIN = 1.05;
const ROW_HEIGHT = 54;
const NAME_WIDTH = 126;
const MIN_DURATION = 10;
const UNASSIGNED = "__unassigned__";

type WeeklyTemplate = {
  template_id?: number;
  kaipoke_cs_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
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
  nth_weeks?: number[] | null;
  holiday_off: boolean;
};

type Staff = { id: string; name: string; rosterSort: number };
type ClientInfo = Record<string, unknown> & { kaipoke_cs_id: string; name?: string | null };
type ServiceOption = { value: string; label: string };
type CardRef = { row: WeeklyTemplate; slot: 0 | 1 | 2 | 3; staffId: string };
type DragState = CardRef & {
  mode: "move" | "resize";
  pointerX: number;
  pointerY: number;
  originalStart: number;
  originalEnd: number;
  originalRow: number;
  nextStart: number;
  nextEnd: number;
  nextRow: number;
  moved: boolean;
};

const hhmm = (value?: string | null) => (value ?? "").slice(0, 5);
const toMinutes = (value: string) => {
  const [h = 0, m = 0] = value.split(":").map(Number);
  return h * 60 + m;
};
const toTime = (minutes: number) => {
  const safe = Math.max(0, Math.min(24 * 60, Math.round(minutes / 5) * 5));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
};
const durationLabel = (row: WeeklyTemplate) => {
  const total = Math.max(0, toMinutes(row.end_time) - toMinutes(row.start_time));
  return `${Math.floor(total / 60)}時間${total % 60 ? `${total % 60}分` : ""}`;
};
const rowKey = (row: WeeklyTemplate) => row.template_id ?? `${row.kaipoke_cs_id}-${row.weekday}-${row.start_time}`;
const visibleInWeek = (row: WeeklyTemplate, week: number) => {
  const specified = (row.nth_weeks ?? []).filter((n) => n >= 1 && n <= 5);
  if (specified.length) return specified.includes(week);
  if (row.is_biweekly) return week === 1 || week === 3 || week === 5;
  return true;
};
const validationErrors = (row: WeeklyTemplate) => {
  const errors: string[] = [];
  if (!row.kaipoke_cs_id) errors.push("利用者が未選択です");
  if (!/^\d{2}:\d{2}$/.test(hhmm(row.start_time))) errors.push("開始時刻が不正です");
  if (!/^\d{2}:\d{2}$/.test(hhmm(row.end_time))) errors.push("終了時刻が不正です");
  if (hhmm(row.end_time) <= hhmm(row.start_time)) errors.push("終了時刻は開始時刻より後にしてください");
  if (!row.service_code) errors.push("サービスが未選択です");
  if (!row.staff_01_user_id) errors.push("主担当が未設定です");
  const assigned = [row.staff_01_user_id, row.staff_02_user_id, row.staff_03_user_id].filter(Boolean);
  if (new Set(assigned).size !== assigned.length) errors.push("同じ担当者が重複しています");
  return errors;
};
const recurrenceLabel = (row: WeeklyTemplate) => {
  if (row.nth_weeks?.length) return `第${row.nth_weeks.join("・")}週`;
  if (row.is_biweekly) return "隔週 1・3・5";
  return "毎週";
};
const clientGender = (client?: ClientInfo) => {
  if (!client) return null;
  const named = String(client.gender_request_name ?? client.gender_request ?? "").trim();
  if (named) return named;
  if (client.female_flg === true && client.male_flg !== true) return "女性限定";
  if (client.male_flg === true && client.female_flg !== true) return "男性限定";
  return null;
};
const clientArea = (client?: ClientInfo) => {
  if (!client) return null;
  const value = client.dsp_short ?? client.area_short ?? client.area_name ?? client.municipality;
  return value ? String(value) : null;
};
const cleanRow = (row: WeeklyTemplate): WeeklyTemplate => ({
  ...row,
  start_time: hhmm(row.start_time),
  end_time: hhmm(row.end_time),
  nth_weeks: row.nth_weeks?.length ? [...new Set(row.nth_weeks)].sort() : null,
  holiday_off: Boolean(row.holiday_off),
});

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
  return response.json() as Promise<T>;
}

function GenderBadge({ value }: { value: string | null }) {
  if (!value) return null;
  const female = value.includes("女");
  const male = value.includes("男");
  return (
    <span title={value} className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${female ? "bg-pink-500" : male ? "bg-blue-500" : "bg-violet-500"}`}>
      {female ? "♀" : male ? "♂" : "限"}
    </span>
  );
}

function WeeklyEditDialog({ value, clients, staff, services, onClose, onSave, onDelete }: {
  value: WeeklyTemplate;
  clients: ClientInfo[];
  staff: Staff[];
  services: ServiceOption[];
  onClose: () => void;
  onSave: (row: WeeklyTemplate) => Promise<void>;
  onDelete: (row: WeeklyTemplate) => Promise<void>;
}) {
  const [draft, setDraft] = useState(() => cleanRow(value));
  const [saving, setSaving] = useState(false);
  const errors = validationErrors(draft);
  const patch = (next: Partial<WeeklyTemplate>) => setDraft((current) => ({ ...current, ...next }));

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = async () => {
    if (errors.length) return;
    setSaving(true);
    try { await onSave(cleanRow(draft)); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/45 p-3" onMouseDown={onClose}>
      <section role="dialog" aria-modal="true" aria-labelledby="weekly-shift-dialog-title" className="max-h-[94vh] w-full max-w-4xl overflow-auto rounded-2xl bg-white shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-5 py-4">
          <div>
            <h2 id="weekly-shift-dialog-title" className="text-lg font-bold text-slate-900">週間シフト編集</h2>
            <p className="text-xs text-slate-500">担当・時間・週指定・サービス内容をまとめて編集できます</p>
          </div>
          <button type="button" className="rounded-lg px-3 py-1 text-2xl text-slate-500 hover:bg-slate-100" onClick={onClose} aria-label="閉じる">×</button>
        </header>

        <div className="grid gap-4 p-5 md:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">利用者
            <select className="mt-1 w-full rounded-lg border px-3 py-2" value={draft.kaipoke_cs_id} onChange={(event) => patch({ kaipoke_cs_id: event.target.value })}>
              <option value="">-- 選択 --</option>
              {clients.map((client) => <option key={client.kaipoke_cs_id} value={client.kaipoke_cs_id}>{client.name ?? client.kaipoke_cs_id}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">曜日
            <select className="mt-1 w-full rounded-lg border px-3 py-2" value={draft.weekday} onChange={(event) => patch({ weekday: Number(event.target.value) })}>
              {WEEKDAYS.map((day, index) => <option key={day} value={index}>{day}曜日</option>)}
            </select>
          </label>

          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
            <label className="text-sm font-medium text-slate-700">開始
              <input type="time" step="300" className="mt-1 w-full rounded-lg border px-3 py-2" value={draft.start_time} onChange={(event) => patch({ start_time: event.target.value })} />
            </label>
            <span className="pb-2 text-slate-400">〜</span>
            <label className="text-sm font-medium text-slate-700">終了
              <input type="time" step="300" className="mt-1 w-full rounded-lg border px-3 py-2" value={draft.end_time} onChange={(event) => patch({ end_time: event.target.value })} />
            </label>
          </div>
          <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-700">所要時間 <strong className="ml-2">{durationLabel(draft)}</strong></div>

          <label className="text-sm font-medium text-slate-700">サービス
            <select className="mt-1 w-full rounded-lg border px-3 py-2" value={draft.service_code} onChange={(event) => patch({ service_code: event.target.value })}>
              <option value="">-- 選択 --</option>
              {services.map((service) => <option key={service.value} value={service.value}>{service.label}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">必要人数
            <select className="mt-1 w-full rounded-lg border px-3 py-2" value={draft.required_staff_count} onChange={(event) => patch({ required_staff_count: Number(event.target.value) })}>
              {[1, 2, 3].map((count) => <option key={count} value={count}>{count}人</option>)}
            </select>
          </label>

          {([1, 2, 3] as const).map((slot) => {
            const field = `staff_0${slot}_user_id` as "staff_01_user_id" | "staff_02_user_id" | "staff_03_user_id";
            const attend = slot === 2 ? "staff_02_attend_flg" : slot === 3 ? "staff_03_attend_flg" : null;
            return (
              <div key={slot} className="rounded-xl border p-3">
                <label className="text-sm font-medium text-slate-700">担当{slot}
                  <select className="mt-1 w-full rounded-lg border px-3 py-2" value={draft[field] ?? ""} onChange={(event) => patch({ [field]: event.target.value || null } as Partial<WeeklyTemplate>)}>
                    <option value="">-- 未設定 --</option>
                    {staff.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
                  </select>
                </label>
                {attend ? <label className="mt-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={Boolean(draft[attend])} onChange={(event) => patch({ [attend]: event.target.checked } as Partial<WeeklyTemplate>)} />同行</label> : <span className="mt-2 block text-xs text-slate-400">主担当</span>}
              </div>
            );
          })}
          <div className="rounded-xl border p-3">
            <label className="text-sm font-medium text-slate-700">重訪移動
              <input className="mt-1 w-full rounded-lg border px-3 py-2" value={draft.judo_ido ?? ""} placeholder="例: 0015" onChange={(event) => patch({ judo_ido: event.target.value || null })} />
            </label>
            <label className="mt-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={draft.two_person_work_flg} onChange={(event) => patch({ two_person_work_flg: event.target.checked })} />2人介助</label>
          </div>

          <fieldset className="rounded-xl border p-3 md:col-span-2">
            <legend className="px-1 text-sm font-semibold text-slate-700">表示する週</legend>
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm"><input type="radio" checked={!draft.is_biweekly && !(draft.nth_weeks?.length)} onChange={() => patch({ is_biweekly: false, nth_weeks: null })} />毎週</label>
              <label className="flex items-center gap-2 text-sm"><input type="radio" checked={Boolean(draft.is_biweekly) && !(draft.nth_weeks?.length)} onChange={() => patch({ is_biweekly: true, nth_weeks: null })} />隔週（第1・3・5週）</label>
              <span className="text-sm">週指定:</span>
              {[1, 2, 3, 4, 5].map((week) => <label key={week} className="flex items-center gap-1 text-sm"><input type="checkbox" checked={draft.nth_weeks?.includes(week) ?? false} onChange={(event) => {
                const next = new Set(draft.nth_weeks ?? []);
                if (event.target.checked) next.add(week); else next.delete(week);
                patch({ nth_weeks: next.size ? [...next].sort() : null, is_biweekly: false });
              }} />第{week}週</label>)}
            </div>
          </fieldset>

          <div className="flex flex-wrap gap-5 md:col-span-2">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.holiday_off} onChange={(event) => patch({ holiday_off: event.target.checked })} />祝日は休み</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.active} onChange={(event) => patch({ active: event.target.checked })} />適用中</label>
          </div>

          {errors.length ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 md:col-span-2"><strong>入力不備</strong>{errors.map((error) => <div key={error}>・{error}</div>)}</div> : null}
        </div>

        <footer className="sticky bottom-0 flex items-center justify-between border-t bg-white px-5 py-4">
          <button type="button" className="rounded-lg border border-red-300 px-4 py-2 text-sm text-red-700 hover:bg-red-50" onClick={() => void onDelete(draft)} disabled={!draft.template_id}>削除</button>
          <div className="flex gap-2">
            <button type="button" className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50" onClick={onClose}>キャンセル</button>
            <button type="button" className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-40" disabled={saving || errors.length > 0} onClick={() => void submit()}>{saving ? "保存中…" : "保存"}</button>
          </div>
        </footer>
      </section>
    </div>
  );
}

export default function WeeklyRosterBoard() {
  const [templates, setTemplates] = useState<WeeklyTemplate[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [clients, setClients] = useState<ClientInfo[]>([]);
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [editor, setEditor] = useState<WeeklyTemplate | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const staffRows = useMemo(() => [{ id: UNASSIGNED, name: "未担当", rosterSort: -1 }, ...staff], [staff]);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const [templateRows, userRows, clientRows, serviceRows] = await Promise.all([
        requestJson<WeeklyTemplate[]>("/api/roster/weekly/templates?active=false"),
        requestJson<Array<Record<string, unknown>>>("/api/users"),
        requestJson<ClientInfo[]>("/api/kaipoke-info"),
        requestJson<Array<Record<string, unknown>>>("/api/shift-service-code"),
      ]);
      setTemplates(templateRows.map(cleanRow));
      setStaff(userRows.map((user) => ({
        id: String(user.user_id ?? ""),
        name: `${String(user.last_name_kanji ?? "")} ${String(user.first_name_kanji ?? "")}`.trim(),
        rosterSort: Number(user.roster_sort ?? Number.MAX_SAFE_INTEGER),
      })).filter((user) => user.id && user.name).sort((a, b) => a.rosterSort - b.rosterSort || a.name.localeCompare(b.name, "ja")));
      setClients(clientRows.filter((client) => client.kaipoke_cs_id).sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? ""), "ja")));
      setServices(serviceRows.map((service) => ({ value: String(service.service_code ?? ""), label: String(service.service_name ?? service.service_code ?? "") })).filter((service) => service.value));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "読み込みに失敗しました");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const clientMap = useMemo(() => new Map(clients.map((client) => [String(client.kaipoke_cs_id), client])), [clients]);
  const visibleTemplates = useMemo(() => templates.filter((row) => row.active && visibleInWeek(row, selectedWeek)), [templates, selectedWeek]);
  const invalidCount = useMemo(() => visibleTemplates.filter((row) => validationErrors(row).length).length, [visibleTemplates]);
  const timeWidth = (VIEW_END - VIEW_START) * PX_PER_MIN;

  const saveRow = useCallback(async (row: WeeklyTemplate) => {
    setSaving(true);
    setMessage(null);
    try {
      await requestJson("/api/roster/weekly/templates/bulk_upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: [cleanRow(row)] }),
      });
      setEditor(null);
      await load();
      setMessage("週間シフトを保存しました");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存に失敗しました");
      throw error;
    } finally { setSaving(false); }
  }, [load]);

  const deleteRow = useCallback(async (row: WeeklyTemplate) => {
    if (!row.template_id || !window.confirm("この週間シフトを削除しますか？")) return;
    await requestJson("/api/roster/weekly/templates/bulk_delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ template_ids: [row.template_id] }),
    });
    setEditor(null);
    await load();
    setMessage("週間シフトを削除しました");
  }, [load]);

  const cardRefsForDay = useCallback((weekday: number) => {
    const refs: CardRef[] = [];
    visibleTemplates.filter((row) => row.weekday === weekday).forEach((row) => {
      const assigned = [row.staff_01_user_id, row.staff_02_user_id, row.staff_03_user_id];
      let found = false;
      assigned.forEach((staffId, index) => {
        if (!staffId) return;
        found = true;
        refs.push({ row, slot: (index + 1) as 1 | 2 | 3, staffId });
      });
      if (!found) refs.push({ row, slot: 0, staffId: UNASSIGNED });
    });
    return refs;
  }, [visibleTemplates]);

  const beginDrag = (event: React.MouseEvent, ref: CardRef, mode: "move" | "resize") => {
    event.preventDefault();
    event.stopPropagation();
    const rowIndex = Math.max(0, staffRows.findIndex((person) => person.id === ref.staffId));
    setDrag({ ...ref, mode, pointerX: event.clientX, pointerY: event.clientY, originalStart: toMinutes(ref.row.start_time), originalEnd: toMinutes(ref.row.end_time), originalRow: rowIndex, nextStart: toMinutes(ref.row.start_time), nextEnd: toMinutes(ref.row.end_time), nextRow: rowIndex, moved: false });
  };

  useEffect(() => {
    if (!drag) return;
    const onMove = (event: MouseEvent) => setDrag((current) => {
      if (!current) return current;
      const dx = event.clientX - current.pointerX;
      const dy = event.clientY - current.pointerY;
      const moved = current.moved || Math.abs(dx) > 3 || Math.abs(dy) > 3;
      if (current.mode === "resize") {
        const nextEnd = Math.max(current.originalStart + MIN_DURATION, Math.min(VIEW_END, current.originalEnd + dx / PX_PER_MIN));
        return { ...current, nextEnd, moved };
      }
      const duration = current.originalEnd - current.originalStart;
      const nextStart = Math.max(VIEW_START, Math.min(VIEW_END - duration, current.originalStart + dx / PX_PER_MIN));
      const nextRow = Math.max(0, Math.min(staffRows.length - 1, current.originalRow + Math.round(dy / ROW_HEIGHT)));
      return { ...current, nextStart, nextEnd: nextStart + duration, nextRow, moved };
    });
    const onUp = () => {
      const current = drag;
      setDrag(null);
      if (!current.moved) { setEditor(current.row); return; }
      const target = staffRows[current.nextRow];
      const updated: WeeklyTemplate = { ...current.row, start_time: toTime(current.nextStart), end_time: toTime(current.nextEnd) };
      if (current.slot === 0) updated.staff_01_user_id = target.id === UNASSIGNED ? null : target.id;
      else updated[`staff_0${current.slot}_user_id` as "staff_01_user_id" | "staff_02_user_id" | "staff_03_user_id"] = target.id === UNASSIGNED ? null : target.id;
      setTemplates((rows) => rows.map((row) => rowKey(row) === rowKey(updated) ? updated : row));
      void saveRow(updated).catch(() => load());
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp, { once: true });
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [drag, staffRows, saveRow, load]);

  const addTemplate = () => setEditor({
    kaipoke_cs_id: "", weekday: 1, start_time: "09:00", end_time: "10:00", service_code: "", required_staff_count: 1,
    two_person_work_flg: false, judo_ido: null, staff_01_user_id: null, staff_02_user_id: null, staff_03_user_id: null,
    staff_02_attend_flg: false, staff_03_attend_flg: false, active: true, is_biweekly: false, nth_weeks: null, holiday_off: false,
  });

  return (
    <div className="space-y-3 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">週間シフト表</h1>
          <p className="text-xs text-slate-500">カードをドラッグして担当・時間を変更、右端をドラッグして所要時間を変更できます</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-slate-600">表示週</span>
          {[1, 2, 3, 4, 5].map((week) => <button key={week} type="button" onClick={() => setSelectedWeek(week)} className={`rounded-lg border px-3 py-1.5 text-sm ${selectedWeek === week ? "border-blue-600 bg-blue-600 text-white" : "bg-white hover:bg-slate-50"}`}>第{week}週目</button>)}
          <button type="button" onClick={addTemplate} className="ml-2 rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700">＋ シフト追加</button>
          <button type="button" onClick={() => void load()} className="rounded-lg border px-3 py-1.5 text-sm hover:bg-slate-50">再読込</button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full border bg-slate-50 px-2 py-1">表示 {visibleTemplates.length}件</span>
        <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-1 text-violet-700">隔週は第1・3・5週に表示</span>
        {invalidCount ? <span className="rounded-full border border-red-200 bg-red-50 px-2 py-1 font-semibold text-red-700">入力不備 {invalidCount}件</span> : null}
        {saving ? <span className="text-blue-600">保存中…</span> : null}
        {message ? <span className={message.includes("失敗") || message.startsWith("HTTP") ? "text-red-600" : "text-emerald-700"}>{message}</span> : null}
      </div>

      {loading ? <div className="rounded-xl border bg-white p-10 text-center text-slate-500">週間シフトを読み込んでいます…</div> : WEEKDAYS.map((day, weekday) => {
        const cards = cardRefsForDay(weekday);
        return (
          <section key={day} className="overflow-hidden rounded-xl border bg-white shadow-sm">
            <div className={`sticky top-0 z-20 flex items-center justify-between border-b px-3 py-2 ${weekday === 0 ? "bg-red-50" : weekday === 6 ? "bg-blue-50" : "bg-slate-50"}`}>
              <h2 className={`font-bold ${weekday === 0 ? "text-red-700" : weekday === 6 ? "text-blue-700" : "text-slate-800"}`}>{day}曜日</h2>
              <span className="text-xs text-slate-500">{cards.length}枠</span>
            </div>
            <div className="grid" style={{ gridTemplateColumns: `${NAME_WIDTH}px minmax(0, 1fr)` }}>
              <div className="border-r bg-white">
                <div className="flex h-8 items-center border-b px-2 text-xs font-semibold text-slate-500">スタッフ</div>
                {staffRows.map((person) => <div key={person.id} className={`flex items-center border-b px-2 text-xs ${person.id === UNASSIGNED ? "bg-amber-50 font-semibold text-amber-800" : ""}`} style={{ height: ROW_HEIGHT }} title={person.name}><span className="truncate">{person.name}</span></div>)}
              </div>
              <div className="overflow-x-auto">
                <div className="relative h-8 border-b bg-white" style={{ width: timeWidth }}>
                  {Array.from({ length: 19 }, (_, index) => index + 6).map((hour) => <span key={hour} className="absolute top-2 text-[10px] text-slate-500" style={{ left: (hour * 60 - VIEW_START) * PX_PER_MIN + 3 }}>{String(hour).padStart(2, "0")}:00</span>)}
                </div>
                <div className="relative" style={{ width: timeWidth, height: staffRows.length * ROW_HEIGHT, backgroundImage: "repeating-linear-gradient(to right,#e5e7eb 0,#e5e7eb 1px,transparent 1px,transparent 63px)" }}>
                  {staffRows.map((person, index) => <div key={person.id} className="absolute left-0 right-0 border-b" style={{ top: index * ROW_HEIGHT, height: ROW_HEIGHT }} />)}
                  {cards.map((card) => {
                    const personIndex = staffRows.findIndex((person) => person.id === card.staffId);
                    if (personIndex < 0) return null;
                    const client = clientMap.get(String(card.row.kaipoke_cs_id));
                    const errors = validationErrors(card.row);
                    const gender = clientGender(client);
                    const area = clientArea(client);
                    const activeDrag = drag && rowKey(drag.row) === rowKey(card.row) && drag.slot === card.slot;
                    const start = activeDrag ? drag.nextStart : toMinutes(card.row.start_time);
                    const end = activeDrag ? drag.nextEnd : toMinutes(card.row.end_time);
                    const top = (activeDrag ? drag.nextRow : personIndex) * ROW_HEIGHT + 5;
                    return (
                      <div key={`${rowKey(card.row)}-${card.slot}`} className={`absolute z-10 flex cursor-grab select-none items-center gap-1 overflow-hidden rounded-md border px-1.5 py-1 text-[10px] shadow-sm ${errors.length ? "border-red-500 bg-red-50 text-red-800" : "border-blue-300 bg-blue-100 text-slate-800"}`} style={{ left: Math.max(0, start - VIEW_START) * PX_PER_MIN, top, width: Math.max(58, (end - start) * PX_PER_MIN), height: ROW_HEIGHT - 10, opacity: activeDrag ? 0.7 : 1 }} title={`${card.row.start_time}-${card.row.end_time} ${client?.name ?? card.row.kaipoke_cs_id}\n${card.row.service_code}\n${recurrenceLabel(card.row)}${errors.length ? `\n不備: ${errors.join("、")}` : ""}`} onMouseDown={(event) => beginDrag(event, card, "move")}>
                        <GenderBadge value={gender} />
                        {area ? <span title={`地域: ${area}`} className="inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-emerald-400 bg-white px-1 font-bold text-emerald-700">{area.slice(0, 2)}</span> : null}
                        <span className="min-w-0 flex-1 truncate"><strong>{card.row.start_time}-{card.row.end_time}</strong><br />{client?.name ?? card.row.kaipoke_cs_id}・{card.row.service_code}</span>
                        {errors.length ? <span className="font-bold text-red-600">!</span> : null}
                        <span className="absolute right-0 top-0 h-full w-2 cursor-e-resize bg-blue-500/20" onMouseDown={(event) => beginDrag(event, card, "resize")} />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>
        );
      })}

      {editor ? <WeeklyEditDialog value={editor} clients={clients} staff={staff} services={services} onClose={() => setEditor(null)} onSave={saveRow} onDelete={deleteRow} /> : null}
    </div>
  );
}
